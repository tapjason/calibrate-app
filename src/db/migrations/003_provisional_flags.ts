// Adds the min-N provisional flags to the stats tables (CLAUDE.md calibration
// engine spec). A score built on too few resolutions must never headline, so
// the engine derives these and the UI gates on them.
//
//   user_stats.rating_is_provisional     — 1 while total_resolved < MIN_N_OVERALL (20)
//   category_stats.score_is_provisional  — 1 while predictions_resolved < MIN_N_CATEGORY (15)
//
// Both default to 1 (provisional): the safe posture is to withhold a headline
// number until a recompute proves the row has enough data. Existing installs
// keep their stored scores; the next recomputeForUser sweep sets the flags
// correctly from the real resolved counts.

export const MIGRATION_003 = /* sql */ `
  ALTER TABLE user_stats
    ADD COLUMN rating_is_provisional INTEGER NOT NULL DEFAULT 1
      CHECK (rating_is_provisional IN (0,1));

  ALTER TABLE category_stats
    ADD COLUMN score_is_provisional INTEGER NOT NULL DEFAULT 1
      CHECK (score_is_provisional IN (0,1));
`;
