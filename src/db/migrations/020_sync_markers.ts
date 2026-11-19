// One-time sync jobs done for an account on this phone (review round 6,
// 2026-11-19). The first: when `UTC_OFFSET_SYNC` turns on, sync sends the
// UTC offsets (018) this phone holds for the account's rows, each with the
// moment it belongs to and nothing else of the row, so the server gets the
// offsets that pushes made before the flag left out (`listOffsetBackfill`,
// `markOffsetBackfillDone`, src/db/predictions.ts; it replaced a whole-row
// re-push before shipping). The marker says it was done, so it never runs
// again for that account, here.
//
//   user_id — the account the job ran for
//   marker  — which job ('utc_offsets_backfilled')
//   done_at — when it ran
//
// Device-local and never synced. No words: an account id, a job name and a
// date. Kept by sign-out with the integrity counts (signing back in brings
// the rows back from the server with their offsets, so the job has nothing
// left to send), cleared by Erase and account deletion.

export const MIGRATION_020 = /* sql */ `
  CREATE TABLE IF NOT EXISTS sync_markers (
    user_id TEXT NOT NULL,
    marker  TEXT NOT NULL,
    done_at TEXT NOT NULL,
    PRIMARY KEY (user_id, marker)
  );
`;
