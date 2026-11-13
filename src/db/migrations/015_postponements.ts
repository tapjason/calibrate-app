// Due dates moved later once the outcome may be known (step 173, aggregate
// B1; record audit 2026-11-12). A known miss could be moved past its due day
// and answered later, and nothing showed it, as deleting one once did (D45).
// One row per prediction, however many moves; kept if the prediction is later
// deleted, so "move on the eve, then delete" still counts. Device-local and
// never synced, like the tombstones' counts: the predictions row syncs, so a
// column there would need a Supabase migration.

export const MIGRATION_015 = /* sql */ `
  CREATE TABLE IF NOT EXISTS prediction_postponements (
    prediction_id TEXT PRIMARY KEY NOT NULL,
    user_id       TEXT NOT NULL,
    moved_at      TEXT NOT NULL,
    from_due      TEXT NOT NULL,
    to_due        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_postponements_user ON prediction_postponements (user_id);
`;
