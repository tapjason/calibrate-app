// Scored answers moved to another category (step 184, roadmap D65; record
// audit of step 182). Inside its 24-hour window an answer can be moved, and
// each category's score follows where it is filed: moved out one by one, a
// category's misses leave its score, which could carry a badge it hasn't
// earned, and nothing showed it. One row per prediction that now sits in a
// category other than the one it was answered in: `from_category` is where
// it was when first moved, so a move back removes the row (a slip fixed is
// not a hidden outcome). Device-local and never synced, like the late moves
// (015) and the tombstones' counts.

export const MIGRATION_017 = /* sql */ `
  CREATE TABLE IF NOT EXISTS prediction_refiles (
    prediction_id TEXT PRIMARY KEY NOT NULL,
    user_id       TEXT NOT NULL,
    moved_at      TEXT NOT NULL,
    from_category TEXT NOT NULL,
    to_category   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_refiles_user ON prediction_refiles (user_id);
`;
