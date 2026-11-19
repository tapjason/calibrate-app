// The version the server holds, as this phone last knew it (2026-11-19,
// re-review of round 7; the record auditor and the client reviewer, both a
// blocker). Round 7's tombstone (021) kept only the copy this phone deleted.
// An answer pushed from here, then changed here ("Change answer" switches Yes
// and No and keeps `resolved_at`; a pushed "Can't tell" answered later) and
// deleted before the next sync left the server on the old version and the
// tombstone on the new one: nothing matched, so the old answer was restored
// and its counted deletion dropped.
//
//   predictions.synced_status, predictions.synced_resolved_at
//     — the status and `resolved_at` of the version this phone last learned
//       the server holds: the one it pushed, once the push's mark landed
//       (`markPredictionSynced`), or the server's copy as a pull wrote it
//       (`upsertPredictionFromRemote`, the whole row standing here or not).
//       Never set by a local write.
//   prediction_deletions.synced_status, prediction_deletions.synced_resolved_at
//     — that pair as the row held it when it was deleted (`deletePrediction`),
//       so the deletion may also remove that version (`tombstoneCovers`).
//
// Backfill: a row with `dirty = 0` holds exactly the version this phone last
// pushed or pulled (every local write sets `dirty = 1`; only a landed push
// mark or a pull clears it), so it takes that version now, and an answer
// synced before this migration is covered too. A dirty row keeps none: what
// the server holds for it is unknown. Every tombstone from before this
// migration keeps none, and reads as before (021's copy, or "deleted open").
//
// A pair is only ever a version this phone held, so covering it never removes
// an answer given elsewhere that this phone never saw. No CHECK constraint, as
// for 018, 021 and 022: a push, a pull or a delete must never fail on what this
// records; a value that isn't a status reads as none. No words: a status and a
// date. Device-local; the server never sees these columns (sync turns the
// tombstone's into the delete's filter). Sign-out keeps the tombstones' with
// them, and removes the predictions' with the rows.

export const MIGRATION_023 = /* sql */ `
  ALTER TABLE predictions ADD COLUMN synced_status TEXT;
  ALTER TABLE predictions ADD COLUMN synced_resolved_at TEXT;
  ALTER TABLE prediction_deletions ADD COLUMN synced_status TEXT;
  ALTER TABLE prediction_deletions ADD COLUMN synced_resolved_at TEXT;

  UPDATE predictions
    SET synced_status = status, synced_resolved_at = resolved_at
    WHERE dirty = 0;
`;
