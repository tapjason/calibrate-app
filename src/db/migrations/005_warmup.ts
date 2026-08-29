// Warmup (onboarding quiz) storage.
//
// Singleton table, same shape as `entitlements`: one row, id fixed to 'me'.
// A user takes the Warmup once; re-taking it overwrites.
//
// Two deliberate choices here:
//
//   • No user_id, no foreign key, no shared column with `predictions`. Warmup
//     answers are not predictions, and CLAUDE.md requires they never mix into
//     UserStat / CategoryStat. A table nothing can join to enforces that
//     structurally instead of trusting every future query to remember.
//
//   • answers_json holds the raw answers, not the scored result. The score is
//     derived by the engine (L3) on read, so tuning the scorer can never leave
//     a stale verdict cached on disk. It is opaque to SQL by design — nothing
//     should ever be aggregating over Warmup answers.

export const MIGRATION_005 = /* sql */ `
  CREATE TABLE IF NOT EXISTS warmup_results (
    id           TEXT PRIMARY KEY DEFAULT 'me' CHECK (id = 'me'),
    completed_at TEXT NOT NULL,
    answers_json TEXT NOT NULL
  );
`;
