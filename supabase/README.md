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
- `migrations/002_coach_usage.sql` — per-user daily Coach call ledger + the
  `bump_coach_usage` function. RLS on with no policies: only the service role
  (i.e. the coach Edge Function) touches it.
- `functions/refine/index.ts` — Edge Function that rewrites a user-typed
  prediction via OpenAI GPT-4o-mini. Called from `src/ai/refine.ts`.
- `functions/coach/index.ts` — Edge Function that interprets calibration stats
  into grounded insights. Called from `src/ai/coach.ts`. Its validation logic
  is deliberately duplicated from `src/ai/coachValidate.ts` (Deno cannot import
  the RN bundle) — the two must stay in lockstep.

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
supabase functions deploy refine
```

JWT verification stays **on**. An earlier version deployed with
`--no-verify-jwt` so guest-mode users could call refine, but the function now
requires a real signed-in user and rejects the bare anon key with 401 — the
anon key ships in the client bundle, so anyone holding it could otherwise burn
OpenAI tokens. Guests simply keep their typed text, which costs nothing since
refine is a signed-in-only nicety. Cost protection is layered: the auth gate,
a per-user rate limit, and the 500-char input cap inside the function.

**Verify**

```sh
curl -X POST 'https://<project-ref>.functions.supabase.co/refine' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"prediction": "I will do better at work this week"}'
```

Expected: `{"refined":"..."}` with a tight rewrite under ~15 words. Note that
the anon key alone now returns 401 — use a real user's access token.

### coach

Interprets a user's calibration statistics and returns 0–3 grounded insights.
Plus-gated, and non-essential by design: `src/ai/coach.ts` turns every failure
into an empty result, so the surface simply doesn't render.

`COACH_AGENT.md` is the authoritative spec for this function. Its safeguards —
grounding, minimum-N, out-of-domain, and the crisis pre-filter — are not
optional extras; read §5 before changing anything here.

**One-time setup**

```sh
supabase secrets set OPENAI_API_KEY=sk-...
# Apply migrations/002_coach_usage.sql first — the function fails closed
# without the usage ledger, so Coach will 500 until the table and the
# bump_coach_usage function exist.
```

**Deploy**

```sh
supabase functions deploy coach
```

Cost protection is layered: a signed-in-user gate, a per-isolate burst limit
(4/min), a **durable** per-user daily ceiling in `public.coach_usage`, an
8KB body cap, and a strict payload parser that rejects anything but numbers
and enum values.

The daily ceiling **fails closed**. If the usage ledger is unreachable the
function returns 500 rather than letting the call through — a spend cap that
opens when its bookkeeping breaks is not a spend cap, and the client degrades
to rendering nothing.

**Verify**

```sh
curl -X POST 'https://<project-ref>.functions.supabase.co/coach' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -d '{"context":{"overall":{"calibration_rating":72,"total_resolved":40},
       "by_category":[{"category":"finance","resolved":25,
       "calibration_score":61,"mean_stated_confidence":80,
       "actual_rate":0.55,"direction":"overconfident"}],"patterns":[]}}'
```

Expected: `{"insights":[...],"safe":true}` with 0–3 items, every `evidence`
value matching a number in the request.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` mirror the union types in
  `src/types/index.ts` AND the SQLite CHECKs in
  `src/db/migrations/001_initial.ts`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull. See `docs/CHECKPOINT.md`.
