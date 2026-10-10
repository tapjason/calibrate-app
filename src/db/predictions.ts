// Predictions CRUD. Every exported function declared against an L1 contract
// from @/types so the compiler enforces the shape from a single source.
//
// Sync metadata (`updated_at`, `dirty`) is maintained here but never leaks
// into the public Prediction shape — only the sync helpers at the bottom of
// this file return rows that include `updated_at`.

import type {
  Prediction,
  PredictionWireRow,
  InsertPrediction,
  GetPrediction,
  ListPendingPredictions,
  ListResolvedPredictions,
  ResolvePrediction,
  DeletePrediction,
  SetReflection,
  ReopenPrediction,
  UpdatePrediction,
} from '@/types';

import { getDb } from './client';

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
  updated_at: string;
  dirty: number;
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
  };
}

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
    updated_at: r.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export const insertPrediction: InsertPrediction = async (p) => {
  const now = nowIso();
  await getDb().run(
    `INSERT INTO predictions
       (id, user_id, title, category, confidence, created_at, due_date,
        status, resolved_at, reflection, integrity_bonus, updated_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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

export const resolvePrediction: ResolvePrediction = async (id, outcome, reflection) => {
  const now = nowIso();
  // `AND status = 'pending'` makes a second resolve a no-op instead of
  // overwriting the original outcome/resolved_at. The UI already guards
  // this, but defense-in-depth matters once notifications can deep-link
  // into Resolve twice (e.g. user taps a stale push).
  await getDb().run(
    `UPDATE predictions
       SET status = ?, resolved_at = ?, reflection = ?,
           updated_at = ?, dirty = 1
       WHERE id = ? AND status = 'pending'`,
    [outcome, now, reflection ?? null, now, id],
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
 * Undo a resolution — the "Change answer" escape hatch right after a tap.
 * `status != 'pending'` makes it a no-op on an unanswered row; `dirty = 1`
 * carries the reversal through sync (last write wins on `updated_at`).
 */
export const reopenPrediction: ReopenPrediction = async (id) => {
  const now = nowIso();
  await getDb().run(
    `UPDATE predictions
       SET status = 'pending', resolved_at = NULL, reflection = NULL,
           updated_at = ?, dirty = 1
       WHERE id = ? AND status != 'pending'`,
    [now, id],
  );
};

/**
 * Edit an open prediction's title, category or due date (roadmap D25).
 * `status = 'pending'` keeps an answered one as it was; `dirty = 1` carries
 * the edit through sync like any other write.
 */
export const updatePrediction: UpdatePrediction = async (id, edit) => {
  const now = nowIso();
  await getDb().run(
    `UPDATE predictions
       SET title = ?, category = ?, due_date = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND status = 'pending'`,
    [edit.title, edit.category, edit.due_date, now, id],
  );
};

/**
 * Delete a prediction and leave a tombstone (roadmap D25), so sync can delete
 * it on the server and pull won't bring it back. Two statements and no
 * transaction of its own: the caller (predictionStore.remove) wraps it with
 * the stats recompute, and SQLite doesn't nest transactions.
 */
export const deletePrediction: DeletePrediction = async (id) => {
  const db = getDb();
  const row = await db.get<{ user_id: string }>(
    `SELECT user_id FROM predictions WHERE id = ?`,
    [id],
  );
  if (!row) return;
  await db.run(`DELETE FROM predictions WHERE id = ?`, [id]);
  await db.run(
    `INSERT OR REPLACE INTO prediction_deletions (id, user_id, deleted_at) VALUES (?, ?, ?)`,
    [id, row.user_id, nowIso()],
  );
};

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

/** Deletions not yet pushed for `userId`, oldest first (roadmap D25). */
export async function listPendingDeletions(userId: string): Promise<string[]> {
  const rows = await getDb().all<{ id: string }>(
    `SELECT id FROM prediction_deletions WHERE user_id = ? ORDER BY deleted_at ASC`,
    [userId],
  );
  return rows.map((r) => r.id);
}

/** Whether `id` was deleted here and the deletion hasn't been pushed yet. */
export async function isDeletionPending(id: string): Promise<boolean> {
  const row = await getDb().get<{ id: string }>(
    `SELECT id FROM prediction_deletions WHERE id = ?`,
    [id],
  );
  return row !== null && row !== undefined;
}

/** Forget a tombstone once the server has the deletion. */
export async function clearDeletion(id: string): Promise<void> {
  await getDb().run(`DELETE FROM prediction_deletions WHERE id = ?`, [id]);
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
 */
export async function upsertPredictionFromRemote(
  row: PredictionWireRow,
): Promise<void> {
  await getDb().run(
    `INSERT INTO predictions
       (id, user_id, title, category, confidence, created_at, due_date,
        status, resolved_at, reflection, integrity_bonus, updated_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       user_id         = excluded.user_id,
       title           = excluded.title,
       category        = excluded.category,
       confidence      = excluded.confidence,
       created_at      = excluded.created_at,
       due_date        = excluded.due_date,
       status          = excluded.status,
       resolved_at     = excluded.resolved_at,
       reflection      = excluded.reflection,
       integrity_bonus = excluded.integrity_bonus,
       updated_at      = excluded.updated_at,
       dirty           = 0`,
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
      row.updated_at,
    ],
  );
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
