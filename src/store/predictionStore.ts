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
  answerCountedAsMoved,
  answeredCategory,
  canAnswerSkip,
  canCorrect,
  categoryChangeCountedIfAnswered as categoryChangeCountedIfAnsweredRule,
  categoryChangeCounts,
  categoryChangeRemembered,
  correctableUntil,
  deletionCounts,
  postponementCounts,
  refileCounts,
  rewordingCounts,
  skipLastDay,
} from '@/engine/corrections';
import { localDayNumber, utcOffsetMinutes } from '@/engine/localTime';
import { pastOutcomes, titleKey } from '@/engine/pastOutcomes';
import {
  clampDueDate,
  dayNumberAt,
  earliestDueDay,
  isOnLoggedDay,
  isSameDayAnswer,
  latestDueDay,
  scoredFrom,
  scoredFromOffset,
} from '@/engine/sameDay';
import { checkpointReached, returnAfterGap, streakStatus } from '@/engine/streak';
import { tallyAnswers } from '@/engine/wrapped';
import {
  correctPredictionOutcome,
  countPostponements,
  countRefiles,
  deletePrediction,
  getAnsweredCategory,
  getCategoryOrigin,
  getPrediction,
  getRefileFrom,
  insertPrediction,
  listCategoryOrigins,
  listDeletions,
  listPendingPredictions,
  listResolvedPredictions,
  recordAnsweredCategory,
  recordPostponement,
  rememberCategoryOrigin,
  resolvePrediction,
  refilePrediction,
  answerSkippedPrediction,
  setPredictionReflection,
  setRefileCounted,
  updatePrediction,
} from '@/db/predictions';
import type {
  AnswerTally,
  Category,
  CategoryOrigin,
  PastOutcomes,
  Prediction,
  PredictionEdit,
  ResolvedStatus,
  ReturnAfterGap,
  StreakStatus,
} from '@/types';

import { useAuthStore } from './authStore';
import { useStatsStore, type HeldStats } from './statsStore';

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
   * deleted on any day after the day they were logged, or already due (owner
   * decision 2026-11-19). This phone's only; loaded with the resolved list.
   */
  deletedCount: number;
  /**
   * Predictions whose due date was moved later, whose words changed, or that
   * were moved to another category, the day before it or after, on this
   * phone (step 173, D62, 2026-11-19), each once.
   */
  postponedCount: number;
  /**
   * Scored answers now filed in another category than the one they had at
   * the end of the day they were logged, on this phone (step 184, D65;
   * review rounds 6 and 7, `answerCountedAsMoved`): moved after they were
   * answered, or moved while open, after that day, and answered elsewhere.
   * Each once, by where it is now, never by the path it took; one whose
   * change was counted as a late change isn't counted again unless moved on
   * to a third category.
   */
  refiledCount: number;
  /**
   * The category this phone remembers for each open prediction moved after
   * the day it was logged (review round 6), by prediction id; loaded with the
   * open list. For Edit's note (`categoryChangeCountedIfAnswered`).
   */
  categoryOrigins: Readonly<Record<string, CategoryOrigin>>;
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
   *
   * `seen` is the prediction as the screen showed it when the person
   * confirmed (review round 7): the tombstone records its status and
   * `resolved_at`, and sync removes from the server only that, an open copy
   * or the same answer. An answer that reached this phone after the screen
   * was drawn (a pull from another phone) is then restored on the next sync
   * instead of being deleted everywhere. The copy this store reads at the
   * start of the delete when omitted.
   */
  remove: (id: string, seen?: Pick<Prediction, 'status' | 'resolved_at'>) => Promise<void>;
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
   * the open one it replaces, which must have been logged today
   * (`canRenumber`: by `created_at`, read where it was logged; one logged
   * earlier and reworded today doesn't qualify). The new one is saved first,
   * so a failure leaves the original, and the streak never sees a gap. The
   * delete isn't counted (the day-logged exemption, `deletionCounts`).
   * Throws once the day has passed: from then the number is the record.
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
   * The streak checkpoint (7, 30, 100, 365…) the last log or answer reached,
   * not yet shown; the screen that shows it clears it, as with
   * statsStore.milestone.
   */
  streakCheckpoint: number | null;
  /**
   * What reached it (step 194): an answer's is Resolve's to show, on the
   * answer; a log's is Today's, once the Log sheet has closed onto it. Null
   * with no checkpoint.
   */
  streakCheckpointFrom: 'answer' | 'log' | null;
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

/**
 * Run a list reload and say whether it worked, never throwing: for the reads
 * around a save or an answer, which must never fail it (code review,
 * 2026-11-18).
 */
async function readSucceeds(load: () => Promise<void>): Promise<boolean> {
  try {
    await load();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[predictions] a list reload around a save failed:', e);
    return false;
  }
}

/**
 * An answer's write with its stats recompute, in one transaction. The
 * recompute sets the stats held in memory, with any milestone or badge fall,
 * before the commit; if the write then fails and rolls back (a failed COMMIT),
 * memory would be ahead of the database, and the next "Your rating moved
 * from…" would start from a rating that includes the rolled-back answer. So
 * on failure nothing of it is claimed, and the stats are read again from the
 * database, in their own transaction (code review, 2026-11-18). The write's
 * error still reaches the caller: nothing was recorded, so trying again is
 * safe.
 *
 * If that reload fails too (review round 5), the stats are put back as they
 * were when the write began and marked stale: nothing from the rolled-back
 * write stays on screen, the next recompute takes its "before" from the
 * database (so a retry still earns the unlock it brings, and no moment is
 * claimed from memory that may be wrong), and the next load rebuilds them.
 */
async function writeWithStats(userId: string, write: () => Promise<void>): Promise<void> {
  let held: HeldStats | null = null;
  try {
    await withTransaction(async () => {
      // Inside the transaction, so no other queued write lands in between.
      held = useStatsStore.getState().heldStats();
      await write();
    });
  } catch (e) {
    useStatsStore.getState().clearMilestone();
    try {
      await withTransaction(() => useStatsStore.getState().loadForUser(userId));
    } catch (reloadError) {
      // eslint-disable-next-line no-console
      console.warn('[predictions] reloading the stats after a failed write failed:', reloadError);
      useStatsStore.getState().markStale(held);
    }
    throw e;
  }
}

/**
 * This user's prediction from the database (getById applies the owner
 * filter), or, if that read fails, the copy in the lists held here, which
 * only ever hold this user's rows. With neither, the read's error stands:
 * nothing has been written, so trying again is safe.
 */
async function getByIdOrHeld(
  get: () => PredictionState,
  id: string,
): Promise<Prediction | null> {
  try {
    return await get().getById(id);
  } catch (e) {
    const held = [...get().pending, ...get().resolved].find((p) => p.id === id);
    if (!held) throw e;
    // eslint-disable-next-line no-console
    console.warn('[predictions] read failed; using the copy held here:', e);
    return held;
  }
}

/**
 * Inside an answer's transaction, after the write (review rounds 6 and 7):
 * for a prediction this phone remembers a category for, write where it was
 * answered and put it on the moved-answers line when it was given in another
 * category than the one it had at the end of the day it was logged
 * (`answerCountedAsMoved`: a scored Yes or No, not already counted as a late
 * change). With nothing remembered there is nothing to write: it was
 * answered where it was at the end of that day. Only this answer: the row
 * must be this user's, answered at `at`, which a resolve that changed
 * nothing (a row already answered from another phone) isn't. The reads are
 * inside the transaction, like the recompute's: a failure rolls the answer
 * back and the person can try again.
 */
async function countAnswerAwayFromOrigin(userId: string, id: string, at: string): Promise<void> {
  const origin = await getCategoryOrigin(id, userId);
  if (!origin) return;
  const answered = await getPrediction(id);
  if (!answered || answered.user_id !== userId || answered.resolved_at !== at) return;
  if (answered.status !== 'resolved_yes' && answered.status !== 'resolved_no') return;
  await recordAnsweredCategory(id, userId, answered.category, at);
  await setRefileCounted(
    id,
    userId,
    answerCountedAsMoved(answered, answered.category, origin),
    answered.category,
    answered.category,
  );
}

/**
 * Inside a move's transaction, after the write (review round 7): work out
 * afresh whether the answer, filed where the move put it, is on the
 * moved-answers line (`answerCountedAsMoved`), from where it is now, where
 * it was answered (`answeredCategory`) and the category this phone
 * remembers for it, and set its one row to match. The moves before don't
 * enter, so the count follows where the answer ends up, not the path it took
 * there. `before` is its category before this move.
 *
 * Only a move that landed changes anything: the row must be this user's
 * Yes or No, filed under `category`. A prediction deleted in between (its
 * delete counted it once already) or changed by a pull leaves the count
 * alone, and the writes require the same (`setRefileCounted`).
 */
async function recountMovedAnswer(
  userId: string,
  id: string,
  before: Category,
  category: Category,
): Promise<void> {
  const moved = await getPrediction(id);
  if (!moved || moved.user_id !== userId || moved.category !== category) return;
  if (!refileCounts(moved)) return;
  const origin = await getCategoryOrigin(id, userId);
  const recorded = origin ? await getAnsweredCategory(id, userId) : null;
  const answeredIn = answeredCategory(before, recorded, await getRefileFrom(id, userId));
  // Written once, so a move back to the remembered category, which takes the
  // moved-answers row away, can't lose where it was answered.
  if (origin && recorded === null) await recordAnsweredCategory(id, userId, answeredIn);
  await setRefileCounted(
    id,
    userId,
    answerCountedAsMoved(moved, answeredIn, origin),
    answeredIn,
    category,
  );
}

export const usePredictionStore = create<PredictionState>((set, get) => ({
  pending: [],
  resolved: [],
  deletedCount: 0,
  postponedCount: 0,
  refiledCount: 0,
  categoryOrigins: {},
  justSavedId: null,
  clearJustSaved: () => set({ justSavedId: null }),
  streakCheckpoint: null,
  streakCheckpointFrom: null,

  clearStreakCheckpoint: () => set({ streakCheckpoint: null, streakCheckpointFrom: null }),

  loadPending: async () => {
    const userId = requireUserId();
    const [pending, origins] = await Promise.all([
      listPendingPredictions(userId),
      // Only for Edit's note: a failed read leaves the open list loading and
      // the note unsaid. Whether an answer is counted is read from the
      // database inside the answer's own transaction, never from this.
      listCategoryOrigins(userId).catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[predictions] reading the remembered categories failed:', e);
        return [];
      }),
    ]);
    set({
      pending,
      categoryOrigins: Object.fromEntries(origins.map((o) => [o.prediction_id, o])),
    });
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
    // The streak before this log, from the database as `resolve` takes it: a
    // sync can write rows the lists here haven't seen, and the log would then
    // be credited with a checkpoint those rows reached (step 194). A save
    // never depends on a read (code review, 2026-11-18): if a read fails, the
    // lists already held stand in, and no checkpoint is claimed, since lists
    // that missed a sync's rows could credit this log with theirs.
    const [pendingRead, resolvedRead] = await Promise.all([
      readSucceeds(get().loadPending),
      readSucceeds(get().loadResolved),
    ]);
    const before = pendingRead && resolvedRead ? get().streakNow() : null;
    // Atomic: insert + stats recompute go together so total_predictions and
    // per-category predictions_made never lag behind the prediction list.
    await withTransaction(async () => {
      await insertPrediction(prediction);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    // Reload instead of appending: the DB query sorts by due_date, and the
    // newly-inserted row may belong before existing entries. Saved by now, so
    // a failed reload is logged rather than reported as a failed save (which
    // would invite saving it twice); the next load brings it.
    const reloaded = await readSucceeds(get().loadPending);
    // A log that made today count on a checkpoint day earned it, as an answer
    // does (step 194); a second log the same day reaches nothing. Kept until
    // Today shows it, so "Save and log another" doesn't lose it. Only with
    // both sides read from the database.
    const reached =
      before !== null && reloaded ? checkpointReached(before, get().streakNow()) : null;
    // For Today, once the sheet closes (D48).
    set({
      justSavedId: prediction.id,
      ...(reached === null ? {} : { streakCheckpoint: reached, streakCheckpointFrom: 'log' as const }),
    });
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
      let answerSkip = false;
      if (options?.answeringSkip && outcome !== 'skipped') {
        // The skip's week (D45) is checked on the row, or on the copy held
        // here if that read fails (code review, 2026-11-18): the answer below
        // only touches a row still skipped, whatever the copy says.
        const target = await getByIdOrHeld(get, id);
        if (target?.status === 'skipped') {
          if (!canAnswerSkip(target, new Date())) throw new Error(SKIP_CLOSED);
          answerSkip = true;
        }
      }
      // The streak before this answer, from the database rather than the lists
      // held here: a sync can write rows those lists haven't seen, and the
      // reload after the answer would then credit this answer with a
      // checkpoint those rows reached. The answer never waits on these reads
      // (code review, 2026-11-18): if one fails, the lists held stand in and
      // no checkpoint is claimed.
      const [pendingRead, resolvedRead] = await Promise.all([
        readSucceeds(get().loadPending),
        readSucceeds(get().loadResolved),
      ]);
      const before = pendingRead && resolvedRead ? get().streakNow() : null;
      // Atomic: if stats recompute throws, the resolution rolls back too. The
      // milestone and a badge's fall are found inside it, on the same reads
      // as the answer's stats, so they stand or fall with the answer.
      await writeWithStats(userId, async () => {
        // When it was answered, stated here so the count below can tell this
        // answer landed. No offset (round 6): the same-day rule reads the
        // answer's day in the zone the prediction was made in.
        const at = new Date().toISOString();
        if (answerSkip && outcome !== 'skipped') {
          // Skipped straight to the answer in one statement, never through
          // open (review round 5), and only a row still skipped: a sync
          // between the check above and here may have brought an answer from
          // another phone (review, 2026-11-08).
          await answerSkippedPrediction(id, outcome, reflection, { at });
        } else {
          await resolvePrediction(id, outcome, reflection, { at });
        }
        // Moved to another category before it was answered (round 6): beside
        // the answer, so the count and the answer can't part.
        if (outcome !== 'skipped') await countAnswerAwayFromOrigin(userId, id, at);
        await useStatsStore.getState().recomputeForUser(userId);
      });
      // Refresh local lists from the source of truth. The answer is saved by
      // now: a failed reload is logged, never reported as a failed answer,
      // which could lead the person to answer again.
      const [pendingAfter, resolvedAfter] = await Promise.all([
        readSucceeds(get().loadPending),
        readSucceeds(get().loadResolved),
      ]);
      // Kept until shown, like an uncelebrated milestone. Only with both
      // sides read from the database.
      const reached =
        before !== null && pendingAfter && resolvedAfter
          ? checkpointReached(before, get().streakNow())
          : null;
      if (reached !== null) set({ streakCheckpoint: reached, streakCheckpointFrom: 'answer' });
      // Only from a fresh list: whether this write landed is read there.
      const resolvedPrediction = resolvedAfter ? get().resolved.find((p) => p.id === id) : undefined;
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
    // The window (D34) on the row, or on the copy held here if that read
    // fails (code review, 2026-11-18); the switch itself only touches a Yes
    // or No.
    await requireCorrectable((rid) => getByIdOrHeld(get, rid), id);
    await writeWithStats(userId, async () => {
      await correctPredictionOutcome(id, outcome);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    useStatsStore.getState().clearMilestone();
    // Saved by now: a failed reload is logged, not reported as a failed
    // switch, which could lead the person to switch it again.
    await readSucceeds(get().loadResolved);
  },

  refile: async (id, category) => {
    const userId = requireUserId();
    const current = await requireCorrectable(get().getById, id);
    await withTransaction(async () => {
      // Its category just before the move, read inside the transaction, as
      // the count below reads everything else.
      const before = (await getPrediction(id))?.category ?? current.category;
      await refilePrediction(id, category);
      // Counted on Insights when a score follows it (step 184, D65): beside
      // the move, so the count and the category can't part, and worked out
      // afresh from where the answer now is (review round 7).
      if (refileCounts(current)) await recountMovedAnswer(userId, id, before, category);
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
      // deletionCounts is false for an open one on the day it was logged
      // (D61), which canRenumber just checked: the one rule, not a literal.
      // The tombstone records the open copy checked (review round 7).
      await deletePrediction(id, { counted: deletionCounts(current, now), seen: current });
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
    // punctuation isn't (the same key as D32's own record). The rewording
    // keeps the phone's UTC offset now beside its date (2026-11-19).
    const now = new Date();
    const rewordedAt = rewords(current.title, title) ? now.toISOString() : undefined;
    const rewordedUtcOffsetMin = rewordedAt !== undefined ? utcOffsetMinutes(now) : undefined;
    // The picker's floor, held here too: a typed date can get past it. The
    // one rule Edit shows its date by (dueDateSavedForEdit), on this clock.
    const due_date = dueDateSavedForEdit(current, title, edit.due_date, now);
    // A late move later is counted on Insights (step 173), held here so a
    // deep link or a typed date is caught as the picker is.
    // Only an open one: an answer landing meanwhile leaves the row unchanged
    // (the UPDATE is for pending rows), so nothing to count (code review).
    // New words on the eve are counted too (D62): the date stays, so a call
    // whose outcome was in sight could be rewritten and answered tomorrow.
    // So is another category from the eve on (owner decision 2026-11-19): a
    // likely miss moved out before it was answered took its category's score
    // with it, uncounted.
    const categoryMoved = current.status === 'pending' && edit.category !== current.category;
    const categoryLate = categoryMoved && categoryChangeCounts(current, now);
    const late =
      current.status === 'pending' &&
      (postponementCounts(
        current.due_date,
        due_date,
        now,
        scoredFrom(current),
        scoredFromOffset(current),
      ) ||
        (rewordedAt !== undefined && rewordingCounts(current, now)) ||
        categoryLate);
    // Any move after the day it was logged is remembered (round 6; a
    // rewording doesn't move that day, round 7), so an answer given in
    // another category than it had then is counted with the moved answers,
    // however early the move; one counted late here is marked so, and its
    // answer is left to the late-changes line.
    const remembers = categoryMoved && categoryChangeRemembered(current, now);
    await withTransaction(async () => {
      await updatePrediction(
        id,
        { ...edit, title, due_date },
        { rewordedAt, rewordedUtcOffsetMin },
      );
      if (late) await recordPostponement(id, userId, current.due_date, due_date);
      if (remembers) {
        await rememberCategoryOrigin(id, userId, current.category, edit.category, categoryLate);
      }
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await get().loadPending();
    if (late) set({ postponedCount: await countPostponements(userId) });
  },

  remove: async (id, seen) => {
    const userId = requireUserId();
    // Only this user's own prediction (getById applies the owner filter): a
    // missing row or another account's is left alone (code review,
    // 2026-11-18), since deletePrediction itself deletes by id.
    const target = await get().getById(id);
    if (!target) return;
    // An answered one only within the correction window (roadmap D34); an
    // open one or a skip any time.
    if (
      (target.status === 'resolved_yes' || target.status === 'resolved_no') &&
      !canCorrect(target, new Date())
    ) {
      throw new Error(PAST_WINDOW);
    }
    // Counted on Insights when it hides something scored, or an open call or
    // a Can't tell from a day after it was logged (D45, owner decisions
    // 2026-11-19). Read from the row as it is now: an open copy on screen
    // that another phone has since marked Can't tell is counted by the same
    // days, so the confirmation's words still hold.
    const counted = deletionCounts(target, new Date());
    // Deleting a resolved prediction changes calibration, streak, and per-
    // category counts — recompute inside the same transaction so the stats
    // never reflect a ghost prediction. The tombstone records what the
    // person saw, or the copy just checked (review round 7): sync removes
    // only that from the server.
    await withTransaction(async () => {
      await deletePrediction(id, { counted, seen: seen ?? target });
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
 * Log's date picker, logging now, so the day is the phone's own; Edit uses
 * earliestDueForEdit, which reads the day it was made where it was made.
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
  // With the offset `create` stores, so the two can't part.
  return clampDueDate(dueIso, now, now, utcOffsetMinutes(now));
}

/**
 * The latest due day the date pickers offer, at local midnight: two years on
 * (playtest 2026-11-08).
 */
export function latestDueFor(now: Date = new Date()): Date {
  return latestDueDay(now);
}

/**
 * Whether an answer given at `now` would be a same-day one, not scored (D41):
 * the answer as `resolve` would store it, judged as every answer is, in the
 * zone the prediction was made in (round 6). For a traveller east of where
 * it was made, true until the next day has begun there.
 */
export function answerNowIsSameDay(p: Prediction, now: Date = new Date()): boolean {
  return isSameDayAnswer({
    ...p,
    status: 'resolved_yes',
    resolved_at: now.toISOString(),
  });
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
 *
 * It picks the words of a note ("You changed its words today" rather than
 * "You logged this today"), so it is true when either reading puts the two
 * on different days: both in the rewording's zone, as the same-day rule
 * reads them (round 6), or each where it happened. Logged on Wednesday
 * evening in New York and reworded on Thursday morning in London is one
 * London day, and "You logged this today" would be untrue to the person; the
 * rewording note is true in both. Without stored offsets both readings are
 * the phone's zone, as before.
 */
export function rewordedLater(p: Prediction): boolean {
  const madeAtIso = scoredFrom(p);
  if (madeAtIso === p.created_at) return false;
  const offset = scoredFromOffset(p);
  const made = dayNumberAt(new Date(madeAtIso), offset);
  if (Number.isNaN(made)) return false;
  const created = new Date(p.created_at);
  const loggedThere = dayNumberAt(created, offset);
  const loggedWhereLogged = dayNumberAt(created, p.created_utc_offset_min);
  return (
    (!Number.isNaN(loggedThere) && made !== loggedThere) ||
    (!Number.isNaN(loggedWhereLogged) && made !== loggedWhereLogged)
  );
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
  // As `update` clamps it: from now with new words, else from when it was
  // made, read where it was made.
  return rewords(p.title, draftTitle)
    ? earliestDueDay(now, now, utcOffsetMinutes(now))
    : earliestDueDay(new Date(scoredFrom(p)), now, scoredFromOffset(p));
}

/**
 * The due date `update` will store for an edit of `p` to `draftTitle` with
 * `dueIso` chosen (D41, D45): the chosen day, or the earliest Edit allows when
 * that is later, the day after it was made, or after today when the words are
 * new. Edit shows this one, so its line never names a date Save won't keep
 * (record audit 2026-11-25); `update` and moveIsCounted clamp by it too.
 */
export function dueDateSavedForEdit(
  p: Prediction,
  draftTitle: string,
  dueIso: string,
  now: Date = new Date(),
): string {
  return rewords(p.title, draftTitle.trim())
    ? clampDueDate(dueIso, now, now, utcOffsetMinutes(now))
    : clampDueDate(dueIso, new Date(scoredFrom(p)), now, scoredFromOffset(p));
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

/**
 * Whether deleting this one now would be counted on Insights (D45), for the
 * delete confirmation to say so first. The engine's rule (`deletionCounts`):
 * a scored Yes or No (not a same-day answer); an open one or a "Can't tell"
 * deleted on any day after the day it was logged (owner decisions
 * 2026-11-19), read where it was logged, a rewording since changing nothing;
 * or an open one or a Can't tell already due, even on the day it was logged.
 * For an open one, `!canRenumber(p, now)` says which: true means it was
 * logged before today; false (still the day it was logged) means it is
 * already due. Not for a Can't tell, which `canRenumber` always refuses.
 */
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
  // The phone's UTC offset as it's logged (owner decision 2026-11-19), so its
  // day is read where it was made, wherever the phone goes.
  const createdOffset = utcOffsetMinutes(now);
  return {
    id: newId(),
    user_id: userId,
    title: trimmedTitle,
    category: input.category,
    confidence: input.confidence,
    created_at: createdAt,
    due_date: clampDueDate(input.due_date, new Date(createdAt), now, createdOffset),
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: isIntegrityBonus(input.confidence),
    created_utc_offset_min: createdOffset,
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
  // The day it was logged and today, both read where it was logged (round
  // 6), so a traveller's day doesn't end early (record audit: refused an
  // hour after logging after a zone change); the phone's zone without a
  // stored offset, as before. The same day a delete is uncounted on
  // (`deletionCounts`, round 7), so the replacement's delete never counts.
  return isOnLoggedDay(p, now);
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
  const saved = dueDateSavedForEdit(p, title, newDueIso, now);
  return postponementCounts(p.due_date, saved, now, scoredFrom(p), scoredFromOffset(p));
}

/**
 * Whether moving an open prediction to `category` now would be counted on
 * Insights (owner decision 2026-11-19), for Edit to say so before Save, as
 * moveIsCounted does for a date: another category on the eve of its due day
 * or after, except on the day it was logged (a rewording since doesn't move
 * that day, round 7). The rule is the engine's (`categoryChangeCounts`);
 * `update` records it, once per prediction, beside the late moves and
 * rewordings.
 */
export function categoryChangeIsCounted(
  p: Prediction,
  category: Category,
  now: Date = new Date(),
): boolean {
  if (p.status !== 'pending') return false;
  return category !== p.category && categoryChangeCounts(p, now);
}

/**
 * For Edit's note on an early move (review round 6): whether moving open
 * prediction `p` to `category` now would be counted on Insights once it is
 * answered there with a scored Yes or No, on the moved-answers line (D65).
 * `origin` is the category this phone remembers for it:
 * `usePredictionStore.getState().categoryOrigins[p.id] ?? null`. Never true
 * when `categoryChangeIsCounted` is (that move is counted now, on the
 * late-changes line), nor for a move back to the remembered category, nor
 * on the day it was logged with nothing remembered. Whether the answer will be
 * scored (not the day it was made, not "Can't tell") isn't known yet, so the
 * note says "if it's answered there". The rule is the engine's
 * (`categoryChangeCountedIfAnswered`); `update` and `resolve` record it.
 */
export function categoryChangeCountedIfAnswered(
  p: Prediction,
  category: Category,
  origin: CategoryOrigin | null,
  now: Date = new Date(),
): boolean {
  return categoryChangeCountedIfAnsweredRule(p, category, origin, now);
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
