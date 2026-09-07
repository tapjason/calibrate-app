// Local analytics queue.
//
// Events are written here first and pushed to Supabase later, for the same
// reason predictions are: the device is the source of truth and the network is
// optional. A user who never signs in still generates a local queue that costs
// nothing and goes nowhere.
//
// `props_json` is a small object of numbers, booleans, and declared enum
// values — never freetext (src/analytics/events.ts enforces that on the way
// in). `synced` mirrors the `dirty` flag on predictions, inverted: 0 means
// not yet pushed.
export const MIGRATION_006 = /* sql */ `
  CREATE TABLE IF NOT EXISTS analytics_events (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    props_json  TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    synced      INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_unsynced
    ON analytics_events (created_at) WHERE synced = 0;
`;
