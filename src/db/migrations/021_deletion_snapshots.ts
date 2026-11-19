// What a deletion saw (review round 7, 2026-11-19; client reviewer and record
// auditor, both a blocker). A phone that hadn't pulled could delete its open
// copy of a prediction another phone had already answered: the answer was
// given before the delete, so the server's conditional delete (open, or
// answered no later than the deletion) let it through, and the answer left
// the server for every phone. A deletion now remembers the row as this phone
// held it, and only ever removes that (`tombstoneCovers`,
// src/db/predictions.ts): an open row, or the same answer it deleted.
//
//   deleted_status      — the status of this phone's copy when it was deleted
//   deleted_resolved_at — that copy's `resolved_at`, as stored
//
// Written in the same statement that writes the tombstone, from the row as
// this phone held it (`deletePrediction`). Null on every tombstone from
// before this migration: read as "deleted open", the reading under which a
// deletion never removes an answer. No CHECK constraint, as for 018: a delete
// must never fail on what it records; a value that isn't a status reads as
// none. No words: a status and a date. Device-local, like the rest of the
// tombstone; the server never sees these columns (sync turns them into the
// delete's filter).

export const MIGRATION_021 = /* sql */ `
  ALTER TABLE prediction_deletions ADD COLUMN deleted_status TEXT;
  ALTER TABLE prediction_deletions ADD COLUMN deleted_resolved_at TEXT;
`;
