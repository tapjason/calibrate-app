// Categories the person adds, renames or hides (roadmap D39, decided
// 2026-11-01).
//
// predictions.category and category_stats.category only allowed the five
// built-ins (001). SQLite can't change a CHECK in place, so both tables are
// rebuilt with the same columns and a check that also accepts an added
// category's id ("c-" and its random part), copied across, and their indexes
// made again. The runner wraps this in one transaction, so a failure leaves
// the old tables as they were.
//
// `categories` holds the names, renames of the built-ins, hidden flags and
// order. Device-local, like the settings: nothing syncs it yet.

const CATEGORY_CHECK = `(category IN ('work','health','finance','social','personal') OR category GLOB 'c-?*')`;

export const MIGRATION_009 = /* sql */ `
  CREATE TABLE predictions_d39 (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    category        TEXT NOT NULL CHECK ${CATEGORY_CHECK},
    confidence      INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    created_at      TEXT NOT NULL,
    due_date        TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending','resolved_yes','resolved_no','skipped')),
    resolved_at     TEXT,
    reflection      TEXT,
    integrity_bonus INTEGER NOT NULL DEFAULT 0 CHECK (integrity_bonus IN (0,1)),
    updated_at      TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
    dirty           INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0,1))
  );
  INSERT INTO predictions_d39
    (id, user_id, title, category, confidence, created_at, due_date, status,
     resolved_at, reflection, integrity_bonus, updated_at, dirty)
    SELECT id, user_id, title, category, confidence, created_at, due_date, status,
           resolved_at, reflection, integrity_bonus, updated_at, dirty
      FROM predictions;
  DROP TABLE predictions;
  ALTER TABLE predictions_d39 RENAME TO predictions;
  CREATE INDEX IF NOT EXISTS idx_predictions_user_status ON predictions(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_predictions_user_due ON predictions(user_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_predictions_dirty ON predictions(dirty) WHERE dirty = 1;

  CREATE TABLE category_stats_d39 (
    user_id              TEXT NOT NULL,
    category             TEXT NOT NULL CHECK ${CATEGORY_CHECK},
    predictions_made     INTEGER NOT NULL DEFAULT 0,
    predictions_resolved INTEGER NOT NULL DEFAULT 0,
    calibration_score    REAL    NOT NULL DEFAULT 0,
    badge_level          TEXT    NOT NULL DEFAULT 'guesser'
                                CHECK (badge_level IN ('guesser','tracker','forecaster','sharp','oracle')),
    score_is_provisional INTEGER NOT NULL DEFAULT 1 CHECK (score_is_provisional IN (0,1)),
    PRIMARY KEY (user_id, category)
  );
  INSERT INTO category_stats_d39
    (user_id, category, predictions_made, predictions_resolved, calibration_score,
     badge_level, score_is_provisional)
    SELECT user_id, category, predictions_made, predictions_resolved, calibration_score,
           badge_level, score_is_provisional
      FROM category_stats;
  DROP TABLE category_stats;
  ALTER TABLE category_stats_d39 RENAME TO category_stats;

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    name       TEXT,
    hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
`;
