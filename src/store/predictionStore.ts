// Prediction store. Orchestrates Layer 2 (db) for I/O and Layer 4 (statsStore)
// for downstream recomputation. Holds no business math — see src/engine.
//
// Layer rule: this file imports from @/db, @/engine and @/types and from
// sibling stores. It does NOT call expo-sqlite or sql.js directly.

import { create } from 'zustand';

import { track } from '@/analytics/track';

import { withTransaction } from '@/db/client';
import { buildDemoPredictions } from '@/db/demoData';
import { canCorrect, correctableUntil } from '@/engine/corrections';
import { pastOutcomes } from '@/engine/pastOutcomes';
import { checkpointReached, streakStatus } from '@/engine/streak';
import { tallyAnswers } from '@/engine/wrapped';
import {
  correctPredictionOutcome,
  deletePrediction,
  getPrediction,
  insertPrediction,
  listPendingPredictions,
  listResolvedPredictions,
  resolvePrediction,
  refilePrediction,
  reopenPrediction,
  setPredictionReflection,
  updatePrediction,
} from '@/db/predictions';
import type {
  AnswerTally,
  Category,
  PastOutcomes,
  Prediction,
  PredictionEdit,
  ResolvedStatus,
  StreakStatus,
} from '@/types';

import { useAuthStore } from './authStore';
import { useStatsStore } from './statsStore';

interface CreatePredictionInput {
  title: string;
  category: Category;
  confidence: number; // 0–100 integer
  due_date: string;   // ISO timestamp
}

interface PredictionState {
  pending: Prediction[];
  resolved: Prediction[];
  loadPending: () => Promise<void>;
  loadResolved: () => Promise<void>;
  /**
   * Fetch a single prediction by id. Returns null when missing or when the
   * row belongs to a different user — that filter exists here (not in the L2
   * helper) so deep-linked screens never have to reach into the auth store
   * directly, and a future Supabase swap doesn't leak other users' rows.
   */
  getById: (id: string) => Promise<Prediction | null>;
  create: (input: CreatePredictionInput) => Promise<Prediction>;
  resolve: (
    id: string,
    outcome: ResolvedStatus,
    reflection?: string,
  ) => Promise<void>;
  /**
   * Delete a prediction (roadmap D25). Leaves a tombstone so sync deletes it
   * on the server too; stats recompute in the same transaction.
   */
  remove: (id: string) => Promise<void>;
  /**
   * Edit an open prediction's title, category or due date (roadmap D25).
   * Never the confidence. A no-op on an answered one. Stats recompute with it,
   * since a category change moves a prediction between categories' counts.
   */
  update: (id: string, edit: PredictionEdit) => Promise<void>;
  /**
   * Undo a resolution (the "Change answer" tap). Stats recompute in the same
   * transaction, exactly as for resolve, so nothing counts a withdrawn answer.
   */
  reopen: (id: string) => Promise<void>;
  /**
   * Switch an answer between Yes and No (roadmap D34): "Change answer" right
   * after, or from its details within the correction window. Throws outside
   * the window. Never to "Can't tell". Stats recompute in the same
   * transaction; a milestone the switch crosses is cleared, since a
   * correction is not an achievement.
   */
  correct: (id: string, outcome: 'resolved_yes' | 'resolved_no') => Promise<void>;
  /** Move an answered prediction to another category, within the window (D34). */
  refile: (id: string, category: Category) => Promise<void>;
  /** Attach (or clear, with an empty string) a reflection after resolving. */
  reflect: (id: string, reflection: string) => Promise<void>;
  /**
   * Screenshots and demos only: add the demo predictions (src/db/demoData.ts)
   * for the current user. The one caller, `app/dev/seed`, is __DEV__-gated.
   * Returns false if they were already there.
   */
  loadDemoData: () => Promise<boolean>;
  /**
   * Where today stands for the streak (roadmap D2): the engine's count over
   * the lists held here, read at render so it follows each log and answer.
   */
  streakNow: (now?: Date) => StreakStatus;
  /**
   * The streak checkpoint (7, 30, 100, 365…) the last answer reached, not yet
   * shown; Resolve shows it and clears it, as with statsStore.milestone.
   */
  streakCheckpoint: number | null;
  clearStreakCheckpoint: () => void;
  /**
   * What these predictions' answers came to (the end of a run, roadmap step
   * 65): the engine's counts over the resolved list held here.
   */
  tallyFor: (ids: readonly string[]) => AnswerTally;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * One resolve per prediction at a time. A reminder action and a tap on the
 * question can both call resolve before either commits; the second waits and
 * does not write, so the streak checkpoint and the analytics event belong to
 * the write that landed. The SQL `status = 'pending'` guard is still what
 * makes a later call a no-op.
 */
const resolvesInFlight = new Map<string, Promise<void>>();

/**
 * Unique-enough ID for the local single-user MVP. Format: `<ts>-<rand>` in
 * base36. NOT a UUID — when L5 turns on Supabase sync, swap this for a real
 * UUID (expo-crypto's randomUUID or similar) so cross-device IDs can't
 * collide. The L2 schema already accepts any TEXT, so the swap is local
 * to this function.
 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The legacy 35-65% flag (CLAUDE.md, D23): still stored and synced so the
 * schema doesn't change, never shown or rewarded.
 */
function isIntegrityBonus(confidence: number): boolean {
  return confidence >= 35 && confidence <= 65;
}

function requireUserId(): string {
  const { userId } = useAuthStore.getState();
  if (!userId) {
    throw new Error(
      'No active user — call useAuthStore.getState().initialize() first',
    );
  }
  return userId;
}

export const usePredictionStore = create<PredictionState>((set, get) => ({
  pending: [],
  resolved: [],
  streakCheckpoint: null,

  clearStreakCheckpoint: () => set({ streakCheckpoint: null }),

  loadPending: async () => {
    const userId = requireUserId();
    set({ pending: await listPendingPredictions(userId) });
  },

  loadResolved: async () => {
    const userId = requireUserId();
    set({ resolved: await listResolvedPredictions(userId) });
  },

  getById: async (id) => {
    const userId = requireUserId();
    const p = await getPrediction(id);
    if (!p || p.user_id !== userId) return null;
    return p;
  },

  create: async (input) => {
    const userId = requireUserId();

    // Validation — defense in depth. The DB has matching CHECK constraints,
    // but failing fast here gives the UI a clean error message.
    if (
      !Number.isInteger(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 100
    ) {
      throw new Error('confidence must be an integer between 0 and 100');
    }
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length === 0) {
      throw new Error('title is required');
    }

    const prediction: Prediction = {
      id: newId(),
      user_id: userId,
      title: trimmedTitle,
      category: input.category,
      confidence: input.confidence,
      created_at: nowIso(),
      due_date: input.due_date,
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: isIntegrityBonus(input.confidence),
    };
    // Atomic: insert + stats recompute go together so total_predictions and
    // per-category predictions_made never lag behind the prediction list.
    await withTransaction(async () => {
      await insertPrediction(prediction);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    // Reload instead of appending: the DB query sorts by due_date, and the
    // newly-inserted row may belong before existing entries.
    await get().loadPending();
    // After the transaction, never inside it: analytics must not be able to
    // roll back a saved prediction. The confidence value goes, the title does
    // not — it is the number that says whether people use the whole range
    // (CLAUDE.md's range-coverage caveat).
    void track('prediction_logged', {
      confidence: prediction.confidence,
      integrity_bonus: prediction.integrity_bonus,
    });
    return prediction;
  },

  resolve: async (id, outcome, reflection) => {
    const running = resolvesInFlight.get(id);
    if (running) {
      await running;
      return;
    }
    let settle!: () => void;
    const done = new Promise<void>((resolveDone) => {
      settle = resolveDone;
    });
    // Taken before the body awaits, so a second caller can't start a write.
    resolvesInFlight.set(id, done);
    try {
      const userId = requireUserId();
      // The streak before this answer, from the database rather than the lists
      // held here: a sync can write rows those lists haven't seen, and the
      // reload after the answer would then credit this answer with a
      // checkpoint those rows reached.
      await Promise.all([get().loadPending(), get().loadResolved()]);
      const before = get().streakNow();
      // Atomic: if stats recompute throws, the resolution rolls back too.
      await withTransaction(async () => {
        await resolvePrediction(id, outcome, reflection);
        await useStatsStore.getState().recomputeForUser(userId);
      });
      // Refresh local lists from the source of truth.
      await Promise.all([get().loadPending(), get().loadResolved()]);
      // Kept until shown, like an uncelebrated milestone.
      const reached = checkpointReached(before, get().streakNow());
      if (reached !== null) set({ streakCheckpoint: reached });
      const resolvedPrediction = get().resolved.find((p) => p.id === id);
      if (resolvedPrediction && resolvedPrediction.status === outcome) {
        void track('prediction_resolved', {
          confidence: resolvedPrediction.confidence,
          correct: outcome === 'resolved_yes',
        });
      }
    } finally {
      settle();
      if (resolvesInFlight.get(id) === done) resolvesInFlight.delete(id);
    }
  },

  reopen: async (id) => {
    const userId = requireUserId();
    await withTransaction(async () => {
      await reopenPrediction(id);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await Promise.all([get().loadPending(), get().loadResolved()]);
    // A withdrawn answer takes back the checkpoint it reached.
    set({ streakCheckpoint: null });
  },

  correct: async (id, outcome) => {
    const userId = requireUserId();
    await requireCorrectable(get().getById, id);
    await withTransaction(async () => {
      await correctPredictionOutcome(id, outcome);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    useStatsStore.getState().clearMilestone();
    await get().loadResolved();
  },

  refile: async (id, category) => {
    const userId = requireUserId();
    await requireCorrectable(get().getById, id);
    await withTransaction(async () => {
      await refilePrediction(id, category);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    useStatsStore.getState().clearMilestone();
    await get().loadResolved();
  },

  reflect: async (id, reflection) => {
    requireUserId();
    const text = reflection.trim();
    // A reflection changes no statistic, so no recompute — just the row.
    await setPredictionReflection(id, text.length > 0 ? text : null);
    await get().loadResolved();
  },

  update: async (id, edit) => {
    const userId = requireUserId();
    const title = edit.title.trim();
    if (title.length === 0) throw new Error('title is required');
    // Only this user's own prediction (getById applies the owner filter).
    if (!(await get().getById(id))) return;
    await withTransaction(async () => {
      await updatePrediction(id, { ...edit, title });
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await get().loadPending();
  },

  remove: async (id) => {
    const userId = requireUserId();
    // An answered one only within the correction window (roadmap D34); an
    // open one or a skip any time.
    const target = await get().getById(id);
    if (
      target &&
      (target.status === 'resolved_yes' || target.status === 'resolved_no') &&
      !canCorrect(target, new Date())
    ) {
      throw new Error(PAST_WINDOW);
    }
    // Deleting a resolved prediction changes calibration, streak, and per-
    // category counts — recompute inside the same transaction so the stats
    // never reflect a ghost prediction.
    await withTransaction(async () => {
      await deletePrediction(id);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await Promise.all([get().loadPending(), get().loadResolved()]);
  },

  streakNow: (now = new Date()) => streakStatus([...get().pending, ...get().resolved], now),

  tallyFor: (ids) => {
    const wanted = new Set(ids);
    return tallyAnswers(get().resolved.filter((p) => wanted.has(p.id)));
  },

  loadDemoData: async () => {
    const userId = requireUserId();
    const rows = buildDemoPredictions(userId, new Date());
    if (await getPrediction(rows[0].id)) return false;
    await withTransaction(async () => {
      for (const p of rows) await insertPrediction(p);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await Promise.all([get().loadPending(), get().loadResolved()]);
    return true;
  },
}));

/**
 * A prediction's own record on Log (roadmap D32): how the answered ones with
 * the same title came out, or null before any has been. A pure function of the
 * store's resolved list, called through here so the Log form never imports the
 * engine (BUILD_PLAN invariant).
 */
export function pastOutcomesFor(
  resolved: readonly Prediction[],
  title: string,
): PastOutcomes | null {
  return pastOutcomes(resolved, title);
}

/**
 * When an answer's correction window closes (roadmap D34), or null when it
 * has closed or there is none (open, skipped). The rule is the engine's;
 * screens read it here.
 */
export function correctionWindow(p: Prediction, now: Date): Date | null {
  return canCorrect(p, now) ? correctableUntil(p) : null;
}

const PAST_WINDOW = 'This answer is part of the record now and can no longer be changed.';

/**
 * The prediction, if it is this user's (getById applies the owner filter) and
 * an answer still inside the correction window (roadmap D34); throws if not.
 */
async function requireCorrectable(
  getById: (id: string) => Promise<Prediction | null>,
  id: string,
): Promise<Prediction> {
  const p = await getById(id);
  if (!p) throw new Error('Prediction not found');
  if (!canCorrect(p, new Date())) throw new Error(PAST_WINDOW);
  return p;
}
