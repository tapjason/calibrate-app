# Supabase schema

Postgres-side schema for Calibrate. The local SQLite source of truth lives in
`src/db/migrations/`; this directory mirrors what gets synced to the cloud.

## Applying migrations

There is no Supabase CLI workflow in this repo yet. To apply a migration:

1. Open the Supabase dashboard for the project.
2. Go to **SQL Editor → New query**.
3. Paste the contents of each file in `supabase/migrations/` in numeric order.
4. Run it.

Each script is idempotent (`create table if not exists`, `drop policy if
exists` before re-creating), so re-running on a project that already has the
schema is safe.

## Files

- `migrations/001_predictions.sql` — `public.predictions` table + RLS policies.
  Mirror of the local SQLite predictions table; client always writes
  `updated_at` so last-write-wins works deterministically.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` mirror the union types in
  `src/types/index.ts` AND the SQLite CHECKs in
  `src/db/migrations/001_initial.ts`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull. See `docs/CHECKPOINT.md`.
