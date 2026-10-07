// Daily practice persistence (roadmap step 88). One row per answered
// question, device-local, never synced, and never joined to predictions
// (migration 007).
//
// Rows are parsed defensively, like the Warmup's: they survive upgrades and
// device restores, and one bad row should cost that answer, not the whole
// record, and never the app's launch.

import {
  PRACTICE_KINDS,
  type ClearPracticeAnswers,
  type ListPracticeAnswers,
  type PracticeAnswer,
  type PracticeQuestion,
  type SavePracticeAnswer,
} from '@/types';

import { getDb } from './client';

interface PracticeRow {
  day: number;
  slot: number;
  question_json: string;
  picked: number;
  correct: number;
  confidence: number;
  answered_at: string;
}

/** Narrow a stored question back to PracticeQuestion, or null if it isn't one. */
function parseQuestion(json: string): PracticeQuestion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const q = parsed as Partial<PracticeQuestion>;
  if (typeof q.id !== 'string' || typeof q.prompt !== 'string' || typeof q.fact !== 'string') {
    return null;
  }
  if (!q.kind || !PRACTICE_KINDS.includes(q.kind)) return null;
  if (!Array.isArray(q.options) || q.options.length !== 2) return null;
  if (!q.options.every((o) => typeof o === 'string')) return null;
  if (q.correctIndex !== 0 && q.correctIndex !== 1) return null;
  return {
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    options: [q.options[0], q.options[1]],
    correctIndex: q.correctIndex,
    fact: q.fact,
  };
}

function toAnswer(row: PracticeRow): PracticeAnswer | null {
  const question = parseQuestion(row.question_json);
  if (!question) return null;
  if (row.picked !== 0 && row.picked !== 1) return null;
  if (!Number.isFinite(row.confidence)) return null;
  return {
    day: row.day,
    slot: row.slot,
    question,
    picked: row.picked,
    correct: row.correct === 1,
    confidence: row.confidence,
    answered_at: row.answered_at,
  };
}

export const listPracticeAnswers: ListPracticeAnswers = async () => {
  const rows = await getDb().all<PracticeRow>(
    `SELECT day, slot, question_json, picked, correct, confidence, answered_at
       FROM practice_answers
      ORDER BY day ASC, slot ASC`,
  );
  return rows.map(toAnswer).filter((a): a is PracticeAnswer => a !== null);
};

export const savePracticeAnswer: SavePracticeAnswer = async (answer) => {
  await getDb().run(
    `INSERT INTO practice_answers
       (id, day, slot, question_json, picked, correct, confidence, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       question_json = excluded.question_json,
       picked        = excluded.picked,
       correct       = excluded.correct,
       confidence    = excluded.confidence,
       answered_at   = excluded.answered_at`,
    [
      `${answer.day}:${answer.slot}`,
      answer.day,
      answer.slot,
      JSON.stringify(answer.question),
      answer.picked,
      answer.correct ? 1 : 0,
      answer.confidence,
      answer.answered_at,
    ],
  );
};

/** Wipe every practice answer: part of erasing the device. */
export const clearPracticeAnswers: ClearPracticeAnswers = async () => {
  await getDb().run(`DELETE FROM practice_answers`);
};
