// The score holes (roadmap D45, decided 2026-11-06), found in three blind
// playtest rounds in November.
//
//   predictions.title_edited_at — when the words were last changed. A
//     reworded prediction counts as logged then: an answer that day isn't
//     scored (D41) and it can't be due before the next day.
//   prediction_deletions.pushed_at — tombstones are kept once the server has
//     the deletion, instead of being forgotten, so they can be counted.
//   prediction_deletions.counted — 1 when Insights counts the deletion: a
//     scored Yes or No, or an open one deleted on or after its due day.
//     Tombstones from before this migration aren't counted.

export const MIGRATION_012 = /* sql */ `
  ALTER TABLE predictions ADD COLUMN title_edited_at TEXT;
  ALTER TABLE prediction_deletions ADD COLUMN pushed_at TEXT;
  ALTER TABLE prediction_deletions ADD COLUMN counted INTEGER NOT NULL DEFAULT 0;
`;
