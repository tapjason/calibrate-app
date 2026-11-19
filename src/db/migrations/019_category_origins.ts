// The category an open prediction had when it was first moved after the day
// it was made (owner decision 2026-11-19, review round 6, widening D69 (e)).
// D69 (e) counts a category change from the eve of the due day; a change two
// or more days early, then "Answer it now", left no trace (reproduced by the
// record auditor). This phone now remembers where the prediction was, and a
// scored Yes or No given in another category is counted with the moved
// answers (prediction_refiles, 017), whenever the move happened.
//
//   from_category — the category before that first move; later moves keep it
//   changed_at    — when that first move was saved
//   counted_late  — 1 once a category change on it was counted as a late
//                   change (prediction_postponements, 015): its answer is then
//                   never counted as moved as well
//
// One row per prediction. Removed when the prediction is deleted (a deleted
// answer is counted as a deletion, D65). Device-local and never synced, like
// the other counts; kept by sign-out with them, cleared by Erase and account
// deletion. No words: an id, a category id and dates.

export const MIGRATION_019 = /* sql */ `
  CREATE TABLE IF NOT EXISTS prediction_category_origins (
    prediction_id TEXT PRIMARY KEY NOT NULL,
    user_id       TEXT NOT NULL,
    from_category TEXT NOT NULL,
    changed_at    TEXT NOT NULL,
    counted_late  INTEGER NOT NULL DEFAULT 0 CHECK (counted_late IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS idx_category_origins_user ON prediction_category_origins (user_id);
`;
