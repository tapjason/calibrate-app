// Predictions CRUD. Every exported function declared against an L1 contract
// from @/types so the compiler enforces the shape from a single source.
//
// Sync metadata (`updated_at`, `dirty`) is maintained here but never leaks
// into the public Prediction shape — only the sync helpers at the bottom of
// this file return rows that include `updated_at`.

import { UTC_OFFSET_SYNC } from '@/constants/app';
import {
  isUtcOffsetMinutes,
  type Prediction,
  type PredictionDeletion,
  type PredictionWireRow,
  type InsertPrediction,
  type GetPrediction,
  type ListPendingPredictions,
  type ListResolvedPredictions,
  type ResolvePrediction,
  type AnswerSkippedPrediction,
  type DeletePrediction,
  type SetReflection,
  type CorrectPredictionOutcome,
  type RefilePrediction,
  type UpdatePrediction,
} from '@/types';

import { afterQueuedTransactions, getDb } from './client';

// Wire shape: integrity_bonus is INTEGER 0/1, dirty is INTEGER 0/1 on disk.
// Convert at the boundary.
interface PredictionRow {
  id: string;
  user_id: string;
  title: string;
  category: Prediction['category'];
  confidence: number;
  created_at: string;
  due_date: string;
  status: Prediction['status'];
  resolved_at: string | null;
  reflection: string | null;
  integrity_bonus: number;
  /** Roadmap D45; null when never reworded. */
  title_edited_at: string | null;
  /** SQLite migration 018 (owner decision 2026-11-19); null when unknown. */
  created_utc_offset_min: number | null;
  resolved_utc_offset_min: number | null;
  title_edited_utc_offset_min: number | null;
  updated_at: string;
  dirty: number;
}

/**
 * `title_edited_at` only when set: the field is optional on Prediction, so a
 * never-reworded row reads exactly as it did before D45.
 */
function rewordedField(r: PredictionRow): { title_edited_at?: string } {
  return r.title_edited_at ? { title_edited_at: r.title_edited_at } : {};
}

type OffsetFields = Pick<
  Prediction,
  'created_utc_offset_min' | 'resolved_utc_offset_min' | 'title_edited_utc_offset_min'
>;

/**
 * Each stored UTC offset only when there is one, like `title_edited_at`: a
 * row from before migration 018 reads exactly as it did.
 */
function offsetFields(r: PredictionRow): OffsetFields {
  const out: OffsetFields = {};
  if (r.created_utc_offset_min !== null && r.created_utc_offset_min !== undefined) {
    out.created_utc_offset_min = r.created_utc_offset_min;
  }
  if (r.resolved_utc_offset_min !== null && r.resolved_utc_offset_min !== undefined) {
    out.resolved_utc_offset_min = r.resolved_utc_offset_min;
  }
  if (r.title_edited_utc_offset_min !== null && r.title_edited_utc_offset_min !== undefined) {
    out.title_edited_utc_offset_min = r.title_edited_utc_offset_min;
  }
  return out;
}

function rowToPrediction(r: PredictionRow): Prediction {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    category: r.category,
    confidence: r.confidence,
    created_at: r.created_at,
    due_date: r.due_date,
    status: r.status,
    resolved_at: r.resolved_at,
    reflection: r.reflection,
    integrity_bonus: r.integrity_bonus === 1,
    ...rewordedField(r),
    ...offsetFields(r),
  };
}

/**
 * A row as it goes up. `title_edited_at` is always there, null included
 * (security review, 2026-11-18): postgrest-js names the union of a batch's
 * keys as the columns, so a row left without the key, in a batch where
 * another row had it, was written with NULL, whatever date the server held
 * for it. Each row now states its own date, so the words and their date go
 * up together.
 *
 * The three UTC offsets follow the same rule once `UTC_OFFSET_SYNC` is on:
 * all three on every row, null included. While it's off, no row names them,
 * since the live table doesn't have the columns yet and an upsert naming one
 * fails the whole batch.
 */
function rowToWire(r: PredictionRow): PredictionWireRow {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    category: r.category,
    confidence: r.confidence,
    created_at: r.created_at,
    due_date: r.due_date,
    status: r.status,
    resolved_at: r.resolved_at,
    reflection: r.reflection,
    integrity_bonus: r.integrity_bonus === 1,
    title_edited_at: r.title_edited_at ?? null,
    ...(UTC_OFFSET_SYNC
      ? {
          created_utc_offset_min: offsetOrNull(r.created_utc_offset_min),
          resolved_utc_offset_min: offsetOrNull(r.resolved_utc_offset_min),
          title_edited_utc_offset_min: offsetOrNull(r.title_edited_utc_offset_min),
        }
      : {}),
    updated_at: r.updated_at,
  };
}

/** The last `updated_at` this module stamped, in ms since the epoch. */
let lastStampMs = 0;

/**
 * The `updated_at` for a local write: now, and always later than the last one
 * stamped here, even within one millisecond (review round 5).
 * `markPredictionSynced` clears `dirty` only when the row's `updated_at` still
 * equals the one pushed, so two writes sharing a millisecond could let a push
 * that read the first mark the second clean, and the server would never get
 * it. In memory only: a restart starts again from the clock.
 */
function nowIso(): string {
  lastStampMs = Math.max(Date.now(), lastStampMs + 1);
  return new Date(lastStampMs).toISOString();
}

/** A usable offset (a whole number of minutes, −840…840), else null. */
function offsetOrNull(value: unknown): number | null {
  return isUtcOffsetMinutes(value) ? value : null;
}

/**
 * The device's UTC offset at `iso`, in minutes east of UTC, for a write whose
 * caller didn't say. Null for an unreadable time.
 */
function deviceOffsetAt(iso: string): number | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  // `+ 0` turns -0 (UTC) into 0.
  return offsetOrNull(Math.round(-t.getTimezoneOffset()) + 0);
}

/**
 * Inserted with exactly the offsets `p` carries (none means unknown): the
 * store states the logging offset of a new prediction, and demo or older
 * rows are inserted with none, so they read as every row did before.
 */
export const insertPrediction: InsertPrediction = async (p) => {
  const now = nowIso();
  await getDb().run(
    `INSERT INTO predictions
       (id, user_id, title, category, confidence, created_at, due_date,
        status, resolved_at, reflection, integrity_bonus, title_edited_at,
        created_utc_offset_min, resolved_utc_offset_min, title_edited_utc_offset_min,
        updated_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      p.id,
      p.user_id,
      p.title,
      p.category,
      p.confidence,
      p.created_at,
      p.due_date,
      p.status,
      p.resolved_at,
      p.reflection,
      p.integrity_bonus ? 1 : 0,
      p.title_edited_at ?? null,
      offsetOrNull(p.created_utc_offset_min),
      offsetOrNull(p.resolved_utc_offset_min),
      offsetOrNull(p.title_edited_utc_offset_min),
      now,
    ],
  );
};

export const getPrediction: GetPrediction = async (id) => {
  const row = await getDb().get<PredictionRow>(
    `SELECT * FROM predictions WHERE id = ?`,
    [id],
  );
  return row ? rowToPrediction(row) : null;
};

export const listPendingPredictions: ListPendingPredictions = async (userId) => {
  const rows = await getDb().all<PredictionRow>(
    `SELECT * FROM predictions
       WHERE user_id = ? AND status = 'pending'
       ORDER BY due_date ASC`,
    [userId],
  );
  return rows.map(rowToPrediction);
};

export const listResolvedPredictions: ListResolvedPredictions = async (userId) => {
  const rows = await getDb().all<PredictionRow>(
    `SELECT * FROM predictions
       WHERE user_id = ? AND status != 'pending'
       ORDER BY resolved_at DESC`,
    [userId],
  );
  return rows.map(rowToPrediction);
};

export const resolvePrediction: ResolvePrediction = async (id, outcome, reflection, opts) => {
  const now = nowIso();
  // When it was answered, with the offset the phone was in then (owner
  // decision 2026-11-19): the store states both, from one clock reading.
  const at = opts?.at ?? now;
  const offset =
    opts && opts.utcOffsetMin !== undefined ? offsetOrNull(opts.utcOffsetMin) : deviceOffsetAt(at);
  // `AND status = 'pending'` makes a second resolve a no-op instead of
  // overwriting the original outcome/resolved_at. The UI already guards
  // this, but defense-in-depth matters once notifications can deep-link
  // into Resolve twice (e.g. user taps a stale push).
  await getDb().run(
    `UPDATE predictions
       SET status = ?, resolved_at = ?, resolved_utc_offset_min = ?, reflection = ?,
           updated_at = ?, dirty = 1
       WHERE id = ? AND status = 'pending'`,
    [outcome, at, offset, reflection ?? null, now, id],
  );
};

/**
 * The reflection is written after the answer (DESIGN_SYSTEM §7.10: typing
 * first would delay the only required tap), so it lands on a row that is
 * already resolved. `status != 'pending'` keeps it from attaching to an
 * unanswered prediction; `dirty = 1` sends it through sync like any edit.
 */
export const setPredictionReflection: SetReflection = async (id, reflection) => {
  const now = nowIso();
  await getDb().run(
    `UPDATE predictions
       SET reflection = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND status != 'pending'`,
    [reflection, now, id],
  );
};

/**
 * Answer a "Can't tell" with a Yes or No (D45), in one statement: status,
 * `resolved_at`, its offset, the reflection, `updated_at` and `dirty` change
 * at once, and only on a row still skipped, so a Yes or No pulled from
 * another phone a moment earlier is never overwritten (review, 2026-11-08).
 * The answer gets its own time, offset and correction window; the skip's
 * note goes with the skip.
 *
 * It used to reopen the row and then answer it, two statements in one
 * transaction (review round 5): sync's reads don't queue behind a
 * transaction, so a push could read the open row in between, and with both
 * writes in one millisecond mark the answered row clean; the server, keeping
 * its Can't tell, then brought it back over the answer. There is no open
 * state in between now, and nothing here puts an answer back to open.
 */
export const answerSkippedPrediction: AnswerSkippedPrediction = async (
  id,
  outcome,
  reflection,
  opts,
) => {
  const now = nowIso();
  const at = opts?.at ?? new Date().toISOString();
  const offset =
    opts && opts.utcOffsetMin !== undefined ? offsetOrNull(opts.utcOffsetMin) : deviceOffsetAt(at);
  await getDb().run(
    `UPDATE predictions
       SET status = ?, resolved_at = ?, resolved_utc_offset_min = ?, reflection = ?,
           updated_at = ?, dirty = 1
       WHERE id = ? AND status = 'skipped'`,
    [outcome, at, offset, reflection ?? null, now, id],
  );
};

/**
 * Correct a Yes to a No or back (roadmap D34). `resolved_at` stays as it was,
 * and its offset with it, so the correction window is measured from the
 * first answer, correcting can't stretch it, and a same-day answer stays one. Only between Yes and No: never to "Can't tell", which is
 * how a miss used to be parked (blind playtest 2026-11-01). The window itself
 * is the store's to check; it knows the time.
 */
export const correctPredictionOutcome: CorrectPredictionOutcome = async (id, outcome) => {
  const now = nowIso();
  await getDb().run(
    `UPDATE predictions
       SET status = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND status IN ('resolved_yes', 'resolved_no')`,
    [outcome, now, id],
  );
};

/** Move an answered prediction to another category (roadmap D34). */
export const refilePrediction: RefilePrediction = async (id, category) => {
  const now = nowIso();
  await getDb().run(
    `UPDATE predictions
       SET category = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND status IN ('resolved_yes', 'resolved_no')`,
    [category, now, id],
  );
};

/**
 * Edit an open prediction's title, category or due date (roadmap D25).
 * `status = 'pending'` keeps an answered one as it was; `dirty = 1` carries
 * the edit through sync like any other write.
 */
export const updatePrediction: UpdatePrediction = async (id, edit, opts) => {
  const now = nowIso();
  // Whether the words changed is the store's call (the engine's titleKey,
  // D45); a rewording only ever moves title_edited_at forward, and its
  // offset goes with it (owner decision 2026-11-19).
  const rewordedAt = opts?.rewordedAt ?? null;
  const rewordedOffset =
    rewordedAt === null
      ? null
      : opts?.rewordedUtcOffsetMin !== undefined
        ? offsetOrNull(opts.rewordedUtcOffsetMin)
        : deviceOffsetAt(rewordedAt);
  await getDb().run(
    `UPDATE predictions
       SET title = ?, category = ?, due_date = ?,
           title_edited_at = COALESCE(?, title_edited_at),
           title_edited_utc_offset_min =
             CASE WHEN ? IS NOT NULL THEN ? ELSE title_edited_utc_offset_min END,
           updated_at = ?, dirty = 1
       WHERE id = ? AND status = 'pending'`,
    [edit.title, edit.category, edit.due_date, rewordedAt, rewordedAt, rewordedOffset, now, id],
  );
};

/**
 * Record a late due-date move (step 173), late new words (D62) or a late
 * category change (owner decision 2026-11-19), the last two with `fromDue`
 * equal to `toDue` when the date stays: once per prediction, the first kept,
 * so the one Insights line counts each prediction once whatever changed.
 * Device-local, never synced, kept after a delete. No transaction of its
 * own: the store calls it beside the update, after `updatePrediction`.
 *
 * Only an edit that landed is recorded: the statement requires this user's
 * prediction to be still open, as the update just required. One answered
 * from another phone between the store's check and its transaction (the
 * update then changed nothing) leaves the count alone, as `noteRefile` does.
 */
export async function recordPostponement(
  predictionId: string,
  userId: string,
  fromDue: string,
  toDue: string,
): Promise<void> {
  await getDb().run(
    `INSERT OR IGNORE INTO prediction_postponements (prediction_id, user_id, moved_at, from_due, to_due)
       SELECT ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM predictions
                       WHERE id = ? AND user_id = ? AND status = 'pending')`,
    [predictionId, userId, nowIso(), fromDue, toDue, predictionId, userId],
  );
}

/**
 * How many predictions had a late change on this phone: a due date moved
 * later (step 173), new words (D62) or another category (2026-11-19), each
 * prediction once.
 */
export async function countPostponements(userId: string): Promise<number> {
  const row = await getDb().get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM prediction_postponements WHERE user_id = ?`,
    [userId],
  );
  return row?.n ?? 0;
}

/**
 * Note that a scored answer moved to another category (step 184, D65). One
 * row per prediction, holding where it was when first moved: a later move
 * elsewhere keeps that origin, and a move back to it removes the row, so the
 * count is of answers now filed somewhere other than where they were
 * answered. Device-local, never synced. No transaction of its own: the store
 * calls it beside the update, after `refilePrediction`.
 *
 * Only a move that landed is noted: every statement here requires this
 * user's prediction to be an answer now filed under `toCategory`, which is
 * what the move just wrote. A prediction deleted between the store's check
 * and its transaction (the delete counted it once already) or no longer a
 * Yes or No leaves the count alone (code review, 2026-11-18).
 */
export async function noteRefile(
  predictionId: string,
  userId: string,
  fromCategory: string,
  toCategory: string,
): Promise<void> {
  const db = getDb();
  // The condition is in each statement, not read beforehand, so nothing can
  // change the prediction between the check and the write.
  const landed = `EXISTS (SELECT 1 FROM predictions
       WHERE id = ? AND user_id = ? AND category = ?
         AND status IN ('resolved_yes', 'resolved_no'))`;
  const landedParams = [predictionId, userId, toCategory];
  const row = await db.get<{ from_category: string }>(
    `SELECT from_category FROM prediction_refiles WHERE prediction_id = ?`,
    [predictionId],
  );
  if (!row) {
    if (fromCategory === toCategory) return;
    await db.run(
      `INSERT INTO prediction_refiles (prediction_id, user_id, moved_at, from_category, to_category)
         SELECT ?, ?, ?, ?, ?
         WHERE ${landed}`,
      [predictionId, userId, nowIso(), fromCategory, toCategory, ...landedParams],
    );
    return;
  }
  if (row.from_category === toCategory) {
    await db.run(
      `DELETE FROM prediction_refiles WHERE prediction_id = ? AND ${landed}`,
      [predictionId, ...landedParams],
    );
    return;
  }
  await db.run(
    `UPDATE prediction_refiles SET to_category = ?, moved_at = ?
       WHERE prediction_id = ? AND ${landed}`,
    [toCategory, nowIso(), predictionId, ...landedParams],
  );
}

/** How many scored answers sit in another category than they were answered in (step 184). */
export async function countRefiles(userId: string): Promise<number> {
  const row = await getDb().get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM prediction_refiles WHERE user_id = ?`,
    [userId],
  );
  return row?.n ?? 0;
}

/**
 * Delete a prediction and leave a tombstone (roadmap D25), so sync can delete
 * it on the server and pull won't bring it back. The tombstone stays after
 * the push, with whether Insights counts it (D45). Two statements and no
 * transaction of its own: the caller (predictionStore.remove) wraps it with
 * the stats recompute, and SQLite doesn't nest transactions.
 */
export const deletePrediction: DeletePrediction = async (id, opts) => {
  const db = getDb();
  const row = await db.get<{ user_id: string }>(
    `SELECT user_id FROM predictions WHERE id = ?`,
    [id],
  );
  if (!row) return;
  await db.run(`DELETE FROM predictions WHERE id = ?`, [id]);
  // A moved answer that is then deleted is counted once, as a deletion.
  await db.run(`DELETE FROM prediction_refiles WHERE prediction_id = ?`, [id]);
  await db.run(
    `INSERT OR REPLACE INTO prediction_deletions (id, user_id, deleted_at, pushed_at, counted)
       VALUES (?, ?, ?, NULL, ?)`,
    [id, row.user_id, nowIso(), opts?.counted ? 1 : 0],
  );
};

/**
 * This phone's deletions for `userId` (roadmap D45), newest first. Insights
 * counts the ones marked `counted`; nothing here syncs.
 */
export async function listDeletions(userId: string): Promise<PredictionDeletion[]> {
  const rows = await getDb().all<{
    id: string;
    user_id: string;
    deleted_at: string;
    pushed_at: string | null;
    counted: number;
  }>(
    `SELECT id, user_id, deleted_at, pushed_at, counted FROM prediction_deletions
       WHERE user_id = ?
       ORDER BY deleted_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ ...r, counted: r.counted === 1 }));
}

// ----------------------------------------------------------------------------
// Sync helpers — used only by src/supabase/sync.ts.
//
// These intentionally expose the wire shape (with `updated_at`) and the
// `dirty` flag handling. Keep them at the bottom and out of the contracts in
// @/types: they're an L2↔L5 detail, not a public contract.
// ----------------------------------------------------------------------------

/** Predictions owned by `userId` that have local changes not yet pushed. */
export async function listDirtyPredictions(
  userId: string,
): Promise<PredictionWireRow[]> {
  const rows = await getDb().all<PredictionRow>(
    `SELECT * FROM predictions
       WHERE user_id = ? AND dirty = 1
       ORDER BY updated_at ASC`,
    [userId],
  );
  return rows.map(rowToWire);
}

/**
 * How many of `userId`'s changes this phone holds that the server doesn't
 * have yet: predictions still marked dirty (a log, answer, edit or note not
 * pushed, or an answer the pull kept and must push back) and deletions not
 * yet pushed. What sign-out would lose if it removed the account's rows now.
 * Queued analytics events aren't counted: they are no one's record.
 */
export async function countUnsynced(userId: string): Promise<number> {
  const row = await getDb().get<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM predictions WHERE user_id = ? AND dirty = 1)
       + (SELECT COUNT(*) FROM prediction_deletions WHERE user_id = ? AND pushed_at IS NULL)
       AS n`,
    [userId, userId],
  );
  return Number(row?.n ?? 0);
}

/** Deletions not yet pushed for `userId`, oldest first (roadmap D25). */
export async function listPendingDeletions(userId: string): Promise<string[]> {
  const rows = await getDb().all<{ id: string }>(
    `SELECT id FROM prediction_deletions
       WHERE user_id = ? AND pushed_at IS NULL
       ORDER BY deleted_at ASC`,
    [userId],
  );
  return rows.map((r) => r.id);
}

/**
 * `listDirtyPredictions`, read once every queued transaction has settled
 * (review round 5), for the push. On the one connection an unqueued read
 * runs between a transaction's statements and sees its uncommitted writes:
 * pushed, a write that then rolled back would sit on the server, and the
 * next pull would bring it back. The same rows and the same errors as
 * `listDirtyPredictions`. Never call it inside a `withTransaction` callback.
 */
export async function listDirtyPredictionsSettled(
  userId: string,
): Promise<PredictionWireRow[]> {
  return await afterQueuedTransactions(() => listDirtyPredictions(userId));
}

/**
 * `listPendingDeletions`, read once every queued transaction has settled,
 * for pushing deletions: a delete that rolls back is never sent. The same
 * ids and the same errors as `listPendingDeletions`. Never call it inside a
 * `withTransaction` callback.
 */
export async function listPendingDeletionsSettled(userId: string): Promise<string[]> {
  return await afterQueuedTransactions(() => listPendingDeletions(userId));
}

/**
 * Whether `id` was deleted on this phone, pushed or not. Pull skips it either
 * way: another device's stale copy shouldn't bring a deletion back.
 */
export async function isDeletedHere(id: string): Promise<boolean> {
  const row = await getDb().get<{ id: string }>(
    `SELECT id FROM prediction_deletions WHERE id = ?`,
    [id],
  );
  return row !== null && row !== undefined;
}

/**
 * Record that the server has the deletion. The tombstone stays (D45), so the
 * deletion is still counted and still skipped on pull.
 */
export async function markDeletionPushed(id: string): Promise<void> {
  await getDb().run(
    `UPDATE prediction_deletions SET pushed_at = ? WHERE id = ? AND pushed_at IS NULL`,
    [nowIso(), id],
  );
}

/** `updated_at` of a row, used by pull to decide if remote is newer. */
export async function getPredictionUpdatedAt(
  id: string,
): Promise<string | null> {
  const row = await getDb().get<{ updated_at: string }>(
    `SELECT updated_at FROM predictions WHERE id = ?`,
    [id],
  );
  return row?.updated_at ?? null;
}

/**
 * Write a remote row into local storage with `dirty = 0`. Used by pull when
 * the remote copy is strictly newer than the local one (or local has no row).
 *
 * The remote row wins whole, `title_edited_at` included, null too (record
 * audit, 2026-11-18): the date belongs to the words it came with. Keeping the
 * later of the two dates kept this phone's rewording date beside another
 * phone's newer row with the old words, so an answer scored on one phone was
 * same-day and unscored on the other, and the two never agreed. That rule was
 * for a server without Supabase migration 008, which is live. Builds from
 * before step 186 leave the column out of their upserts, and an upsert leaves
 * a column it doesn't name as it was, so they can't clear a date either. When
 * this phone's row is the newer one, pull doesn't call this at all, and its
 * own words and date stand.
 *
 * **No answer goes back to open, and no Yes or No becomes "Can't tell"**
 * (D34, D45; record audit 2026-11-19; main session's decision the same day,
 * the strict direction). A phone that hadn't pulled could edit its open copy
 * of a prediction answered elsewhere, and that newer row, whole, reopened the
 * answer here. Now, when this phone's row is answered (Yes, No or Can't tell)
 * and the pulled one is open, or this phone's is a Yes or No and the pulled
 * one a Can't tell, **this phone's whole row stands**: the answer (status,
 * `resolved_at`, reflection), and also the words, category, due date,
 * `title_edited_at` and every offset. The pulled copy is stale by definition
 * (its phone didn't know about the answer), so none of its edits land on an
 * answered prediction: new words after an answer (D45) or a move to another
 * category that nothing counted (D65). The row is marked dirty with an
 * `updated_at` past both its own and the pulled one, so the answered row goes
 * back up and every phone ends on it. Yes ↔ No between phones stays last
 * write wins ("Change answer"), and a Can't tell can still become a Yes or No
 * (a skip is answered later): there the newer row wins whole, as before. One
 * statement, so nothing written between a read and the write can slip past
 * the rule.
 *
 * **The UTC offsets** (owner decision 2026-11-19): with `UTC_OFFSET_SYNC` on,
 * a winning row brings its own, null included, like `title_edited_at`. While
 * it's off the server has none to send: this phone keeps its offset for a
 * moment the pulled row shares (the same instant, however the server wrote
 * it), and a moment the pulled row changed has none, so it is read in this
 * phone's zone, as before.
 */
export async function upsertPredictionFromRemote(
  row: PredictionWireRow,
): Promise<void> {
  // This phone's answered row stands when the pulled one would undo it (see
  // above).
  const keepLocal = `(
       (predictions.status IN ('resolved_yes', 'resolved_no', 'skipped')
          AND excluded.status = 'pending')
       OR (predictions.status IN ('resolved_yes', 'resolved_no')
          AND excluded.status = 'skipped'))`;
  // Each column: this phone's value when its row stands, else `otherwise`.
  const unlessKept = (column: string, otherwise = `excluded.${column}`) =>
    `CASE WHEN ${keepLocal} THEN predictions.${column} ELSE ${otherwise} END`;
  // A pulled row's offset, or with the flag off this phone's own for the same
  // moment and none for a moment the pulled row changed.
  const offsetFrom = (column: string, moment: string) =>
    UTC_OFFSET_SYNC
      ? `excluded.${column}`
      : `CASE WHEN julianday(excluded.${moment}) IS julianday(predictions.${moment})
              THEN predictions.${column} ELSE NULL END`;
  const incoming = (value: number | null | undefined) =>
    UTC_OFFSET_SYNC ? offsetOrNull(value) : null;
  await getDb().run(
    `INSERT INTO predictions
       (id, user_id, title, category, confidence, created_at, due_date,
        status, resolved_at, reflection, integrity_bonus, title_edited_at,
        created_utc_offset_min, resolved_utc_offset_min, title_edited_utc_offset_min,
        updated_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       user_id         = ${unlessKept('user_id')},
       title           = ${unlessKept('title')},
       category        = ${unlessKept('category')},
       confidence      = ${unlessKept('confidence')},
       created_at      = ${unlessKept('created_at')},
       due_date        = ${unlessKept('due_date')},
       status          = ${unlessKept('status')},
       resolved_at     = ${unlessKept('resolved_at')},
       reflection      = ${unlessKept('reflection')},
       integrity_bonus = ${unlessKept('integrity_bonus')},
       -- With the words it came with (D45), null included: see above.
       title_edited_at = ${unlessKept('title_edited_at')},
       created_utc_offset_min = ${unlessKept(
         'created_utc_offset_min',
         offsetFrom('created_utc_offset_min', 'created_at'),
       )},
       resolved_utc_offset_min = ${unlessKept(
         'resolved_utc_offset_min',
         offsetFrom('resolved_utc_offset_min', 'resolved_at'),
       )},
       title_edited_utc_offset_min = ${unlessKept(
         'title_edited_utc_offset_min',
         offsetFrom('title_edited_utc_offset_min', 'title_edited_at'),
       )},
       -- Past the pulled time (laterThan) and never behind this phone's own,
       -- in the text order sync compares by.
       updated_at      = CASE WHEN ${keepLocal} THEN MAX(?, predictions.updated_at)
                              ELSE excluded.updated_at END,
       dirty           = CASE WHEN ${keepLocal} THEN 1 ELSE 0 END`,
    [
      row.id,
      row.user_id,
      row.title,
      row.category,
      row.confidence,
      row.created_at,
      row.due_date,
      row.status,
      row.resolved_at,
      row.reflection,
      row.integrity_bonus ? 1 : 0,
      row.title_edited_at ?? null,
      incoming(row.created_utc_offset_min),
      incoming(row.resolved_utc_offset_min),
      incoming(row.title_edited_utc_offset_min),
      row.updated_at,
      laterThan(row.updated_at),
    ],
  );
}

/**
 * A timestamp later than `iso` and no earlier than now, for an answer the
 * pull kept: pushed back, it must be newer than the open copy it overrode,
 * on the server and on the phone that wrote that copy (sync compares
 * `updated_at` as text, and an ISO time ending `Z` sorts after the same
 * instant written `+00:00`). The server may write microseconds, which not
 * every engine parses, so they are cut to milliseconds first.
 */
function laterThan(iso: string): string {
  const now = Date.now();
  const parsed = typeof iso === 'string' ? Date.parse(iso.replace(/(\.\d{3})\d+/, '$1')) : NaN;
  return new Date(Number.isNaN(parsed) ? now : Math.max(now, parsed + 1)).toISOString();
}

/**
 * Clear `dirty` after a successful push, but ONLY if `updated_at` still
 * matches what we pushed. A concurrent local write would have bumped
 * updated_at and re-set dirty=1; this guard preserves that.
 */
export async function markPredictionSynced(
  id: string,
  syncedUpdatedAt: string,
): Promise<void> {
  await getDb().run(
    `UPDATE predictions
       SET dirty = 0
       WHERE id = ? AND updated_at = ? AND dirty = 1`,
    [id, syncedUpdatedAt],
  );
}
