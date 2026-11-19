// The UTC offset each moment of a prediction happened in (owner decision
// 2026-11-19, review round 5). Same-day answers (roadmap D41) were judged in
// the phone's zone at the time of reading, so moving the phone to another
// zone re-scored past answers: 20 answers given the day they were logged in
// New York all counted after the phone moved to London (record audit,
// 2026-11-19). Each moment now keeps the offset it was written in, in minutes
// east of UTC (`-getTimezoneOffset()`, −840…840), and the rule reads each
// moment's own calendar day:
//
//   created_utc_offset_min       — when the prediction was logged
//   resolved_utc_offset_min      — when `resolved_at` was set
//   title_edited_utc_offset_min  — when `title_edited_at` was set (D45)
//
// Null on every row from before this migration, and on a row whose moment
// came from another phone on an older build: that side is read in the
// phone's current zone, as before. No CHECK constraint: a save must never
// fail on an offset; the app writes only usable values and reads anything
// else as missing. The same three columns are added to Supabase's
// `public.predictions` by its own migration; until that is live they stay on
// this phone (`UTC_OFFSET_SYNC`).

export const MIGRATION_018 = /* sql */ `
  ALTER TABLE predictions ADD COLUMN created_utc_offset_min INTEGER;
  ALTER TABLE predictions ADD COLUMN resolved_utc_offset_min INTEGER;
  ALTER TABLE predictions ADD COLUMN title_edited_utc_offset_min INTEGER;
`;
