// Adds the per-row sync metadata predictions need to round-trip with Supabase:
//
//   updated_at  — ISO timestamp of the last local write. Drives both
//                 last-write-wins on pull and the cursor advance on pull.
//   dirty       — 1 when local has unsynced changes, 0 after push confirms.
//
// Backfill for existing installs: rows that pre-date this migration get
// updated_at = COALESCE(resolved_at, created_at), and dirty defaults to 1 so
// the next syncNow sweep mirrors them up to the server. Fresh installs run
// 001 first (no rows) and the UPDATE is a no-op.

export const MIGRATION_002 = /* sql */ `
  ALTER TABLE predictions
    ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';

  ALTER TABLE predictions
    ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0,1));

  UPDATE predictions
    SET updated_at = COALESCE(resolved_at, created_at)
    WHERE updated_at = '1970-01-01T00:00:00.000Z';

  CREATE INDEX IF NOT EXISTS idx_predictions_dirty
    ON predictions(dirty) WHERE dirty = 1;
`;
