// Warmup (onboarding quiz) persistence. A single row holding the raw answers
// of the one Warmup the user has taken, plus when they finished it.
//
// This module deliberately stores answers and nothing derived. Scoring is the
// engine's job (L3) and L2 must not import it, so `getWarmupRecord` hands back
// answers and the store scores them — one source of truth, no cached verdict
// to go stale when the scorer changes.
//
// Corrupt or unparseable JSON resolves to null (= "no Warmup taken"), never
// throws. The Warmup is onboarding: a bad row should send the user through the
// quiz again, not crash the app on launch.

import type {
  ClearWarmupRecord,
  GetWarmupRecord,
  SaveWarmupRecord,
  WarmupAnswer,
  WarmupRecord,
} from '@/types';

import { getDb } from './client';

// The singleton row's fixed id (matches the CHECK (id = 'me') constraint).
const ROW_ID = 'me';

interface WarmupRow {
  completed_at: string;
  answers_json: string;
}

/**
 * Narrow untrusted JSON to WarmupAnswer[]. The row is written by this app, but
 * it survives upgrades and device restores, so it is parsed defensively.
 */
function parseAnswers(json: string): WarmupAnswer[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const answers: WarmupAnswer[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return null;
    const { confidence, correct } = item as Partial<WarmupAnswer>;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
    if (typeof correct !== 'boolean') return null;
    answers.push({ confidence, correct });
  }
  return answers;
}

export const getWarmupRecord: GetWarmupRecord = async () => {
  const row = await getDb().get<WarmupRow>(
    `SELECT completed_at, answers_json FROM warmup_results WHERE id = ?`,
    [ROW_ID],
  );
  if (!row) return null;

  const answers = parseAnswers(row.answers_json);
  if (!answers) return null;

  return { completed_at: row.completed_at, answers };
};

export const saveWarmupRecord: SaveWarmupRecord = async (record: WarmupRecord) => {
  await getDb().run(
    `INSERT INTO warmup_results (id, completed_at, answers_json)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       completed_at = excluded.completed_at,
       answers_json = excluded.answers_json`,
    [ROW_ID, record.completed_at, JSON.stringify(record.answers)],
  );
};

/** Wipe the stored Warmup, sending the user back through onboarding. */
export const clearWarmupRecord: ClearWarmupRecord = async () => {
  await getDb().run(`DELETE FROM warmup_results WHERE id = ?`, [ROW_ID]);
};
