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
  GetWarmupProgress,
  GetWarmupRecord,
  SaveWarmupProgress,
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
  // Finished: the answers so far are now the record.
  await getDb().run(`DELETE FROM warmup_progress WHERE id = ?`, [ROW_ID]);
};

/** Wipe the stored Warmup, sending the user back through onboarding. */
export const clearWarmupRecord: ClearWarmupRecord = async () => {
  await getDb().run(`DELETE FROM warmup_results WHERE id = ?`, [ROW_ID]);
  await getDb().run(`DELETE FROM warmup_progress WHERE id = ?`, [ROW_ID]);
};

/**
 * The answers of an unfinished Warmup (playtest 2026-11-09b: a reload at
 * question 5 started it over). Unparseable JSON reads as none, like the record.
 */
export const getWarmupProgress: GetWarmupProgress = async () => {
  const row = await getDb().get<{ answers_json: string; question_ids: string }>(
    `SELECT answers_json, question_ids FROM warmup_progress WHERE id = ?`,
    [ROW_ID],
  );
  if (!row) return null;
  const answers = parseAnswers(row.answers_json);
  let ids: unknown;
  try {
    ids = JSON.parse(row.question_ids);
  } catch {
    return null;
  }
  if (!answers || !Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null;
  if (ids.length !== answers.length) return null;
  return { question_ids: ids as string[], answers };
};

/** Keep the answers so far, replacing what was kept; none deletes the row. */
export const saveWarmupProgress: SaveWarmupProgress = async ({ question_ids, answers }) => {
  if (answers.length === 0) {
    await getDb().run(`DELETE FROM warmup_progress WHERE id = ?`, [ROW_ID]);
    return;
  }
  await getDb().run(
    `INSERT INTO warmup_progress (id, answers_json, question_ids, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       answers_json = excluded.answers_json,
       question_ids = excluded.question_ids,
       updated_at = excluded.updated_at`,
    [ROW_ID, JSON.stringify(answers), JSON.stringify(question_ids), new Date().toISOString()],
  );
};
