// Initial schema. CREATE ... IF NOT EXISTS makes this migration idempotent;
// initDb() can safely run it on every app start.
//
// The CHECK constraints mirror the union types in @/types — the database
// rejects values the TypeScript layer also rejects, as a second line of
// defense against bad data sneaking past the type system.
//
// `integrity_bonus` is stored as INTEGER 0/1 because SQLite has no native
// boolean type; src/db/predictions.ts converts at the boundary.

export const MIGRATION_001 = /* sql */ `
  CREATE TABLE IF NOT EXISTS predictions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('work','health','finance','social','personal')),
    confidence      INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    created_at      TEXT NOT NULL,
    due_date        TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending','resolved_yes','resolved_no','skipped')),
    resolved_at     TEXT,
    reflection      TEXT,
    integrity_bonus INTEGER NOT NULL DEFAULT 0 CHECK (integrity_bonus IN (0,1))
  );

  CREATE INDEX IF NOT EXISTS idx_predictions_user_status
    ON predictions(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_predictions_user_due
    ON predictions(user_id, due_date);

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id            TEXT PRIMARY KEY,
    calibration_rating REAL    NOT NULL DEFAULT 0,
    total_predictions  INTEGER NOT NULL DEFAULT 0,
    total_resolved     INTEGER NOT NULL DEFAULT 0,
    current_streak     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS category_stats (
    user_id              TEXT NOT NULL,
    category             TEXT NOT NULL CHECK (category IN ('work','health','finance','social','personal')),
    predictions_made     INTEGER NOT NULL DEFAULT 0,
    predictions_resolved INTEGER NOT NULL DEFAULT 0,
    calibration_score    REAL    NOT NULL DEFAULT 0,
    badge_level          TEXT    NOT NULL DEFAULT 'guesser'
                                CHECK (badge_level IN ('guesser','tracker','forecaster','sharp','oracle')),
    PRIMARY KEY (user_id, category)
  );
`;
