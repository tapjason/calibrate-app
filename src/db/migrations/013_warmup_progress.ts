// The Warm-up's answers so far (blind playtest 2026-11-09b, finding 1).
//
// A reload at question 5 sent a tester back to question 1: the answers lived
// in memory until the tenth. This singleton row keeps the unfinished ones, so
// the quiz reopens at the next question (the ten are the same for everyone).
// Apart from everything real, like `warmup_results`: no user_id, nothing to
// join to. Deleted when the Warm-up is finished, retaken or erased.

export const MIGRATION_013 = /* sql */ `
  CREATE TABLE IF NOT EXISTS warmup_progress (
    id           TEXT PRIMARY KEY DEFAULT 'me' CHECK (id = 'me'),
    answers_json TEXT NOT NULL,
    -- The ids of the questions answered, in order: a resume checks them, so
    -- answers to an older set of questions don't carry into a new one.
    question_ids TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
`;
