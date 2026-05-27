// Predictions CRUD. Every exported function is declared against an L1 contract
// from @/types so the compiler enforces the shape from a single source.

import type {
  Prediction,
  InsertPrediction,
  GetPrediction,
  ListPendingPredictions,
  ListResolvedPredictions,
  ResolvePrediction,
  DeletePrediction,
} from '@/types';

import { getDb } from './client';

// Wire shape: integrity_bonus is INTEGER 0/1 on disk. Convert at the boundary.
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

export const insertPrediction: InsertPrediction = async (p) => {
  await getDb().run(
    `INSERT INTO predictions
       (id, user_id, title, category, confidence, created_at, due_date,
        status, resolved_at, reflection, integrity_bonus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  // `AND status = 'pending'` makes a second resolve a no-op instead of
  // overwriting the original outcome/resolved_at. The UI already guards
  // this, but defense-in-depth matters once notifications can deep-link
  // into Resolve twice (e.g. user taps a stale push).
  await getDb().run(
    `UPDATE predictions
       SET status = ?, resolved_at = ?, reflection = ?
       WHERE id = ? AND status = 'pending'`,
    [outcome, new Date().toISOString(), reflection ?? null, id],
  );
};

export const deletePrediction: DeletePrediction = async (id) => {
  await getDb().run(`DELETE FROM predictions WHERE id = ?`, [id]);
};
