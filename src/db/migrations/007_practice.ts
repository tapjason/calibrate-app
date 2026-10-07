// Daily practice answers (roadmap step 88).
//
// Like `warmup_results`, deliberately apart from everything real: no
// user_id, no foreign key, nothing to join to `predictions`. CLAUDE.md keeps
// practice out of UserStat / CategoryStat, and a table nothing can join to
// enforces that structurally. Device-local and never synced, like the Warmup.
//
// One row per day and slot (`id` = "<day>:<slot>"), so answering the same
// question twice replaces rather than adds. The question itself is stored with
// the answer (question_json), because questions are drawn from tables that may
// grow: a later version must never rewrite what someone was actually asked.
export const MIGRATION_007 = /* sql */ `
  CREATE TABLE IF NOT EXISTS practice_answers (
    id            TEXT PRIMARY KEY,
    day           INTEGER NOT NULL,
    slot          INTEGER NOT NULL,
    question_json TEXT NOT NULL,
    picked        INTEGER NOT NULL CHECK (picked IN (0, 1)),
    correct       INTEGER NOT NULL CHECK (correct IN (0, 1)),
    confidence    INTEGER NOT NULL,
    answered_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_practice_day ON practice_answers (day, slot);
`;
