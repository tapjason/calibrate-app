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

export const deletePrediction: DeletePrediction = async (id) => {
  // Hard delete — no tombstone is written, so a delete won't propagate to
  // Supabase. There is no delete UI in the MVP; revisit if/when one ships.
  await getDb().run(`DELETE FROM predictions WHERE id = ?`, [id]);
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
