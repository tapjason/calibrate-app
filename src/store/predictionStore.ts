// Prediction store. Orchestrates Layer 2 (db) for I/O and Layer 4 (statsStore)
// for downstream recomputation. Holds no business math — see src/engine.
//
// Layer rule: this file imports from @/db, @/engine and @/types and from
// sibling stores. It does NOT call expo-sqlite or sql.js directly.

import { create } from 'zustand';

import { track } from '@/analytics/track';

import { withTransaction } from '@/db/client';
import { buildDemoPredictions } from '@/db/demoData';
import {
  canAnswerSkip,
  canCorrect,
  correctableUntil,
  deletionCounts,
  postponementCounts,
  refileCounts,
  rewordingCounts,
  skipLastDay,
} from '@/engine/corrections';
import { localDayNumber } from '@/engine/localTime';
import { pastOutcomes, titleKey } from '@/engine/pastOutcomes';
import {
  clampDueDate,
  earliestDueDay,
  isSameDayAnswer,
  latestDueDay,
  scoredFrom,
} from '@/engine/sameDay';
import { checkpointReached, returnAfterGap, streakStatus } from '@/engine/streak';
import { tallyAnswers } from '@/engine/wrapped';
import {
  correctPredictionOutcome,
  countPostponements,
  countRefiles,
  deletePrediction,
  getPrediction,
  insertPrediction,
  listDeletions,
  listPendingPredictions,
  listResolvedPredictions,
  noteRefile,
  recordPostponement,
  resolvePrediction,
  refilePrediction,
  unskipPrediction,
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
  ReturnAfterGap,
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
  /**
   * Deletions Insights counts (roadmap D45): scored answers, and open ones
   * deleted on or after their due day. This phone's only; loaded with the
   * resolved list.
   */
  deletedCount: number;
  /**
   * Predictions whose due date was moved later, or whose words changed, the
   * day before it or after, on this phone (step 173, D62).
   */
  postponedCount: number;
  /**
   * Scored answers now filed in another category than they were answered in,
   * on this phone (step 184, D65).
   */
  refiledCount: number;
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
  /**
   * The prediction this phone's Log saved last, until a screen takes it
   * (roadmap D48): Today scrolls to it on the focus after the sheet closes;
   * the other tabs drop it, so a save made there doesn't move Today later.
   * Only `create` sets it, so a sync pull never does.
   */
  justSavedId: string | null;
  clearJustSaved: () => void;
  /**
   * Record an answer. A no-op on a row that isn't open, unless
   * `answeringSkip`: then a "Can't tell" still inside its week (D45) takes
   * a Yes or No, reopened and answered in one transaction, so leaving
   * Resolve before answering changes nothing (playtest 2026-11-08b,
   * finding 2). Past its week that throws.
   */
  resolve: (
    id: string,
    outcome: ResolvedStatus,
    reflection?: string,
    options?: { answeringSkip?: boolean },
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
   * New words make it a prediction made now (D45): the reword is dated, and
   * the due date is held to the next day at the earliest.
   */
  update: (id: string, edit: PredictionEdit) => Promise<void>;
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
   * "Use another number" (D62): save `input` as a new prediction and delete
   * the open one it replaces, which must have been made today (by
   * `scoredFrom`, so a rewording today counts). The new one is saved first,
   * so a failure leaves the original, and the streak never sees a gap. The
   * delete isn't counted (D61's day-made exemption). Throws once the day has
   * passed: from then the number is the record.
   */
  renumber: (id: string, input: CreatePredictionInput) => Promise<Prediction>;
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
  /** A return after a long gap, today (roadmap D51), or null; practice days count as being here. */
  returnNow: (now?: Date, practiceDays?: readonly number[]) => ReturnAfterGap | null;
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

/**
 * One resolve per prediction at a time. A reminder action and a tap on the
 * question can both call resolve before either commits; the second waits and
 * does not write, so the streak checkpoint and the analytics event belong to
 * the write that landed. The SQL `status = 'pending'` guard is still what
 * makes a later call a no-op.
 */
const resolvesInFlight = new Map<string, Promise<void>>();

/**
 * A new prediction's id: the time in base36, a hyphen, then up to eight
 * random base36 characters from Math.random (`<ts>-<rand>`). Not a UUID. The
 * id is a TEXT primary key on the phone and in Postgres
 * (`supabase/migrations/001_predictions.sql`), so any string works there, and
 * two ids clash only when made in the same millisecond with the same random
 * characters.
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
  deletedCount: 0,
  postponedCount: 0,
  refiledCount: 0,
  justSavedId: null,
  clearJustSaved: () => set({ justSavedId: null }),
  streakCheckpoint: null,

  clearStreakCheckpoint: () => set({ streakCheckpoint: null }),

  loadPending: async () => {
    const userId = requireUserId();
    set({ pending: await listPendingPredictions(userId) });
  },

  loadResolved: async () => {
    const userId = requireUserId();
    const [resolved, deletions, postponed, refiled] = await Promise.all([
      listResolvedPredictions(userId),
      listDeletions(userId),
      countPostponements(userId),
      countRefiles(userId),
    ]);
    set({
      resolved,
      deletedCount: deletions.filter((d) => d.counted).length,
      postponedCount: postponed,
      refiledCount: refiled,
    });
  },

  getById: async (id) => {
    const userId = requireUserId();
    const p = await getPrediction(id);
    if (!p || p.user_id !== userId) return null;
    return p;
  },

  create: async (input) => {
    const userId = requireUserId();
    const prediction = newPredictionRow(input, userId);
    // Atomic: insert + stats recompute go together so total_predictions and
    // per-category predictions_made never lag behind the prediction list.
    await withTransaction(async () => {
      await insertPrediction(prediction);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    // Reload instead of appending: the DB query sorts by due_date, and the
    // newly-inserted row may belong before existing entries.
    await get().loadPending();
    // For Today, once the sheet closes (D48).
    set({ justSavedId: prediction.id });
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

  resolve: async (id, outcome, reflection, options) => {
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
      let reopenFirst = false;
      if (options?.answeringSkip && outcome !== 'skipped') {
        const target = await get().getById(id);
        if (target?.status === 'skipped') {
          if (!canAnswerSkip(target, new Date())) throw new Error(SKIP_CLOSED);
          reopenFirst = true;
        }
      }
      // The streak before this answer, from the database rather than the lists
      // held here: a sync can write rows those lists haven't seen, and the
      // reload after the answer would then credit this answer with a
      // checkpoint those rows reached.
      await Promise.all([get().loadPending(), get().loadResolved()]);
      const before = get().streakNow();
      // Atomic: if stats recompute throws, the resolution rolls back too.
      await withTransaction(async () => {
        // Only a row still skipped: a sync between the check above and here
        // may have brought an answer from another phone (review, 2026-11-08).
        if (reopenFirst) await unskipPrediction(id);
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
    const current = await requireCorrectable(get().getById, id);
    await withTransaction(async () => {
      await refilePrediction(id, category);
      // Counted on Insights when a score follows it (step 184, D65): beside
      // the move, so the count and the category can't part.
      if (refileCounts(current)) await noteRefile(id, userId, current.category, category);
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

  renumber: async (id, input) => {
    const userId = requireUserId();
    const now = new Date();
    const current = await get().getById(id);
    if (!current || !canRenumber(current, now)) throw new Error(RENUMBER_CLOSED);
    const prediction = newPredictionRow(input, userId, now);
    // One transaction and one clock (code review of step 178): saved and
    // deleted together, so a failure or a kill leaves exactly one, and the
    // delete is uncounted by the rule just checked, not re-read past midnight.
    await withTransaction(async () => {
      await insertPrediction(prediction);
      // deletionCounts is false for an open one on the day it was made
      // (D61), which canRenumber just checked: the one rule, not a literal.
      await deletePrediction(id, { counted: deletionCounts(current, now) });
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await get().loadPending();
    set({ justSavedId: prediction.id });
    // No `prediction_logged`: the same prediction, at another number.
    return prediction;
  },

  update: async (id, edit) => {
    const userId = requireUserId();
    const title = edit.title.trim();
    if (title.length === 0) throw new Error('title is required');
    // Only this user's own prediction (getById applies the owner filter).
    const current = await get().getById(id);
    if (!current) return;
    // New words are a new prediction from now (D45); a fixed typo, case or
    // punctuation isn't (the same key as D32's own record).
    const now = new Date();
    const rewordedAt = rewords(current.title, title) ? now.toISOString() : undefined;
    const from = rewordedAt ?? scoredFrom(current);
    // The picker's floor, held here too: a typed date can get past it.
    const due_date = clampDueDate(edit.due_date, new Date(from), now);
    // A late move later is counted on Insights (step 173), held here so a
    // deep link or a typed date is caught as the picker is.
    // Only an open one: an answer landing meanwhile leaves the row unchanged
    // (the UPDATE is for pending rows), so nothing to count (code review).
    // New words on the eve are counted too (D62): the date stays, so a call
    // whose outcome was in sight could be rewritten and answered tomorrow.
    const late =
      current.status === 'pending' &&
      (postponementCounts(current.due_date, due_date, now, scoredFrom(current)) ||
        (rewordedAt !== undefined && rewordingCounts(current, now)));
    await withTransaction(async () => {
      await updatePrediction(id, { ...edit, title, due_date }, { rewordedAt });
      if (late) await recordPostponement(id, userId, current.due_date, due_date);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await get().loadPending();
    if (late) set({ postponedCount: await countPostponements(userId) });
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
    // Counted on Insights when it hides something scored or due (D45).
    const counted = target ? deletionCounts(target, new Date()) : false;
    // Deleting a resolved prediction changes calibration, streak, and per-
    // category counts — recompute inside the same transaction so the stats
    // never reflect a ghost prediction.
    await withTransaction(async () => {
      await deletePrediction(id, { counted });
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await Promise.all([get().loadPending(), get().loadResolved()]);
  },

  streakNow: (now = new Date()) => streakStatus([...get().pending, ...get().resolved], now),
  returnNow: (now = new Date(), practiceDays = []) =>
    returnAfterGap([...get().pending, ...get().resolved], now, practiceDays),

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

/**
 * The earliest due day for a prediction logged at `createdAt` (roadmap D41):
 * the next day, since an answer on the day it was logged isn't scored. For
 * the date pickers of Log and Edit.
 */
export function earliestDueFor(createdAt: string | Date, now: Date = new Date()): Date {
  return earliestDueDay(new Date(createdAt), now);
}

/**
 * The soonest open prediction with the same words as `p` (D32's `titleKey`)
 * in the same category, other than `p` itself, or null. History's answered details say "Logged
 * again, due …" instead of offering "Log it again" while one is open (roadmap
 * D56), so a habit isn't stacked twice from one source.
 */
export function openRepeatOf(p: Prediction, pending: readonly Prediction[]): Prediction | null {
  const key = titleKey(p.title);
  const same = pending.filter(
    // The same category too: "Log it again" carries it, and words matched
    // across categories said "Logged again" about another category's
    // prediction (blind playtests 2026-11-12 run 4, 2026-11-12f run 7).
    (o) =>
      o.id !== p.id &&
      o.status === 'pending' &&
      o.category === p.category &&
      titleKey(o.title) === key,
  );
  if (same.length === 0) return null;
  return same.reduce((a, b) => (Date.parse(b.due_date) < Date.parse(a.due_date) ? b : a));
}

/**
 * The due date a prediction saved at `now` with `dueIso` will carry: `create`
 * moves anything before tomorrow to tomorrow (D41). Log's Save names this one
 * (roadmap D55), so it never names a date that won't be saved.
 */
export function dueDateSavedAt(dueIso: string, now: Date = new Date()): string {
  return clampDueDate(dueIso, now, now);
}

/**
 * The latest due day the date pickers offer, at local midnight: two years on
 * (playtest 2026-11-08).
 */
export function latestDueFor(now: Date = new Date()): Date {
  return latestDueDay(now);
}

/** Whether an answer given at `now` would be a same-day one, not scored (D41). */
export function answerNowIsSameDay(p: Prediction, now: Date = new Date()): boolean {
  return isSameDayAnswer({ ...p, status: 'resolved_yes', resolved_at: now.toISOString() });
}

/**
 * An open prediction with the same words (D32's `titleKey`) due the same
 * local day as `dueIso`, or null. Log says so before a second one is saved:
 * "Save and log another" answers "Saved, due tomorrow." every time, and a
 * tester logged one twice (blind playtest 2026-11-14, finding 16).
 */
export function openTwinFor(
  title: string,
  dueIso: string,
  pending: readonly Prediction[],
  exceptId?: string,
): Prediction | null {
  const key = titleKey(title);
  if (!key) return null;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return null;
  const day = localDayNumber(due);
  return (
    pending.find(
      (o) =>
        o.id !== exceptId &&
        o.status === 'pending' &&
        titleKey(o.title) === key &&
        localDayNumber(new Date(o.due_date)) === day,
    ) ?? null
  );
}

/**
 * Whether the words were changed on a later day than the prediction was
 * logged. On the day itself new words change nothing it could be told: it
 * already counts as made today (blind playtest 2026-11-14, finding 15).
 */
export function rewordedLater(p: Prediction): boolean {
  const made = new Date(scoredFrom(p));
  const logged = new Date(p.created_at);
  if (Number.isNaN(made.getTime()) || Number.isNaN(logged.getTime())) return false;
  return localDayNumber(made) !== localDayNumber(logged);
}

/**
 * Whether the same words were answered before (D32's `titleKey`), on another
 * prediction: a habit being repeated. D56's "log the next one the evening
 * before" is said only then (D62): it reached a one-off maths test (blind
 * playtest 2026-11-13d, run 5).
 */
export function answeredBefore(p: Prediction, resolved: readonly Prediction[]): boolean {
  const key = titleKey(p.title);
  return resolved.some(
    (o) =>
      o.id !== p.id &&
      (o.status === 'resolved_yes' || o.status === 'resolved_no') &&
      titleKey(o.title) === key,
  );
}

/**
 * Whether changing `before` to `after` counts as new words (roadmap D45): not
 * a change of case, spacing, end punctuation or quote style. Edit warns
 * before saving one.
 */
export function rewords(before: string, after: string): boolean {
  return titleKey(before) !== titleKey(after);
}

/**
 * The earliest due day Edit offers (D41, D45): the day after the prediction
 * was logged or last reworded, or the day after today when the draft
 * rewords it.
 */
export function earliestDueForEdit(p: Prediction, draftTitle: string, now: Date = new Date()): Date {
  return earliestDueDay(new Date(rewords(p.title, draftTitle) ? now : scoredFrom(p)), now);
}

/** When the prediction, as it now reads, was made: logged or last reworded (D45). */
export function madeAt(p: Prediction): string {
  return scoredFrom(p);
}

/**
 * The last day a "Can't tell" can be answered (D45), or null when that day
 * has passed or it isn't a skip.
 */
export function skipAnswerBy(p: Prediction, now: Date = new Date()): Date | null {
  return canAnswerSkip(p, now) ? skipLastDay(p) : null;
}

/** Whether deleting this one now would be counted on Insights (D45). */
export function deleteIsCounted(p: Prediction, now: Date = new Date()): boolean {
  return deletionCounts(p, now);
}

/** Whether moving this answer to another category is counted on Insights (D65). */
export function refileIsCounted(p: Prediction): boolean {
  return refileCounts(p);
}

/**
 * A new open prediction from Log's input, validated (defense in depth: the
 * DB has matching CHECK constraints, but failing fast gives the UI a clean
 * error message). Never due today or earlier (D41).
 */
function newPredictionRow(
  input: CreatePredictionInput,
  userId: string,
  now: Date = new Date(),
): Prediction {
  if (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new Error('confidence must be an integer between 0 and 100');
  }
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0) {
    throw new Error('title is required');
  }
  const createdAt = now.toISOString();
  return {
    id: newId(),
    user_id: userId,
    title: trimmedTitle,
    category: input.category,
    confidence: input.confidence,
    created_at: createdAt,
    due_date: clampDueDate(input.due_date, new Date(createdAt), now),
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: isIntegrityBonus(input.confidence),
  };
}

/**
 * Whether "Use another number" is open (D62): an open prediction logged
 * today, by its `created_at`. Not one logged earlier and only reworded
 * today: replacing it would move its streak day (D45 keeps `created_at` for
 * that) and give an old call a new number (code review of step 178).
 */
export function canRenumber(p: Prediction, now: Date = new Date()): boolean {
  if (p.status !== 'pending') return false;
  const made = new Date(p.created_at);
  return !Number.isNaN(made.getTime()) && localDayNumber(made) === localDayNumber(now);
}

const RENUMBER_CLOSED =
  'It was made before today, so its number is part of the record and stays as it is.';
const PAST_WINDOW = 'This answer is part of the record now and can no longer be changed.';
const SKIP_CLOSED =
  'It’s more than a week past its due day, so it stays Can’t tell and can no longer be answered.';

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

/**
 * Whether moving an open prediction's due date to `newDueIso` now would be
 * counted on Insights (step 173), for Edit to say so before Save. The rule is
 * the engine's; the store's `update` records it.
 */
export function moveIsCounted(
  p: Prediction,
  newDueIso: string,
  /** The words as edited: new words move the floor to tomorrow (D45). */
  title: string = p.title,
  now: Date = new Date(),
): boolean {
  if (p.status !== 'pending') return false;
  // The date Save will keep, clamped as `update` clamps it, so a rewording on
  // the due day that pushes the date on is warned about too (record audit
  // 2026-11-12).
  const from = rewords(p.title, title.trim()) ? now.toISOString() : scoredFrom(p);
  const saved = clampDueDate(newDueIso, new Date(from), now);
  return postponementCounts(p.due_date, saved, now, scoredFrom(p));
}

/**
 * Whether changing an open prediction's words to `title` now would be counted
 * on Insights (D62), for Edit to say so before Save: new words on the eve of
 * its due day or after. The rule is the engine's; `update` records it.
 */
export function rewordIsCounted(p: Prediction, title: string, now: Date = new Date()): boolean {
  if (p.status !== 'pending') return false;
  const next = title.trim();
  return next.length > 0 && rewords(p.title, next) && rewordingCounts(p, now);
}
