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
- `functions/refine/index.ts` — Edge Function that rewrites a user-typed
  prediction via OpenAI GPT-4o-mini. Called from `src/ai/refine.ts`.

## Edge Functions

### refine

Rewrites a user prediction into a concise yes/no-resolvable form. The mobile
client treats every failure as silent (`src/ai/refine.ts` returns `null`), so
the function can be down without breaking the save flow.

**One-time setup**

```sh
# Install the CLI if you haven't: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set OPENAI_API_KEY=sk-...
```

**Deploy**

```sh
supabase functions deploy refine --no-verify-jwt
```

`--no-verify-jwt` lets guest-mode users (no Supabase session) still call
refine. Cost protection comes from the 500-char input cap inside the function
and from Supabase's per-project function rate limits.

**Verify**

```sh
curl -X POST 'https://<project-ref>.functions.supabase.co/refine' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"prediction": "I will do better at work this week"}'
```

Expected: `{"refined":"..."}` with a tight rewrite under ~15 words.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` mirror the union types in
  `src/types/index.ts` AND the SQLite CHECKs in
  `src/db/migrations/001_initial.ts`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull. See `docs/CHECKPOINT.md`.
