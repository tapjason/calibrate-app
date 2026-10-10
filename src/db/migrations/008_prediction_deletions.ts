// Deletions waiting to reach Supabase (roadmap D25).
//
// A delete removes the row locally at once; without a record of it, the next
// pull would bring a signed-in user's prediction straight back from the
// server. Each delete leaves a tombstone here, sync pushes it as a server-side
// delete and then clears it, and pull skips any id still listed. Guests'
// tombstones are harmless: nothing pushes them, and erase clears them.
export const MIGRATION_008 = /* sql */ `
  CREATE TABLE IF NOT EXISTS prediction_deletions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_prediction_deletions_user
    ON prediction_deletions (user_id);
`;
