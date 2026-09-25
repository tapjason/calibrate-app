# Supabase schema

Postgres-side schema for Calibrate. The local SQLite source of truth lives in
`src/db/migrations/`; this directory mirrors what gets synced to the cloud.

## Applying migrations

The project is linked to the Supabase CLI (project ref `otopheizhjstoeyndcvc`).
Migrations are applied with:

```sh
npx supabase db push        # applies anything in migrations/ not yet on remote
npx supabase migration list # shows local vs. remote state
```

The dashboard route still works if you prefer it — **SQL Editor → New query**, paste
each file in `supabase/migrations/` in numeric order, run.

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
- `migrations/003_entitlements.sql` — server-side Plus mirror. Written by the
  service role only (the RevenueCat webhook below); users may read their own
  row. Absence of a row means free.
- `migrations/004_entitlement_event_cursor.sql` — `last_event_ms` cursor plus
  `apply_entitlement_event()`, the guarded upsert the webhook calls. The guard
  is what stops an out-of-order delivery from resurrecting a lapsed
  subscription.
- `functions/refine/index.ts` — Edge Function that rewrites a user-typed
  prediction via OpenAI GPT-4o-mini. Called from `src/ai/refine.ts`.
- `migrations/005_analytics_events.sql` — product analytics events. Append-only
  by policy (insert + select for the owning user, no update or delete grant),
  with CHECK constraints keeping `props` a small JSON object. There is no
  column freetext could go in.
- `functions/revenuecat-webhook/index.ts` — receives RevenueCat events and
  keeps `public.entitlements` current. Its decision logic lives in
  `entitlementFromEvent.ts`, plain TypeScript with no Deno imports so Jest can
  test it (`entitlementFromEvent.test.ts`, 28 cases).
- `functions/delete-account/index.ts` — deletes the caller's account (App Store
  Guideline 5.1.1(v)): revokes Sign in with Apple, deletes the RevenueCat
  customer, then `auth.admin.deleteUser`, whose rows cascade out of every
  public table. Called from `src/supabase/account.ts`. Decision logic in
  `deletionPlan.ts`, Jest-tested (`deletionPlan.test.ts`).
- `functions/coach/index.ts` — Edge Function that interprets calibration stats
  into grounded insights. Called from `src/ai/coach.ts`. Its validation logic
  is deliberately duplicated from `src/ai/coachValidate.ts` (Deno cannot import
  the RN bundle) — the two must stay in lockstep.

## Edge Functions

### refine

> **Not deployed — cut from the first release (2026-09-24).** The first live
> run against a funded OpenAI account showed the prompt turning predictions
> into *questions* ("I'll finish the report" → "Will I finish the report?"),
> four inputs out of four. `REFINE_ENABLED` in `src/constants/app.ts` is false
> and the function is intentionally absent from the project, so
> `/functions/v1/refine` answers 404. Everything below still applies when it
> comes back; fix the prompt first.

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
# Apply BOTH migrations/002_coach_usage.sql and migrations/003_entitlements.sql
# first. The function fails closed on either, so Coach 500s until the usage
# ledger and the entitlements table both exist.
```

**Before billing exists**, no row in `entitlements` means nobody is Plus, so
every request is refused with 403 — correct for a paid feature nobody has
bought, but it makes the endpoint impossible to exercise. To test it:

```sh
supabase secrets set COACH_ALLOW_UNENTITLED=true   # unset before launch
```

With that set the Plus gate is skipped entirely. It is the only thing standing
between a signed-in free user and your OpenAI bill, so unset it the moment
billing populates the table.

**Deploy**

```sh
supabase functions deploy coach
```

Cost protection is layered: a signed-in-user gate, a **server-side Plus
check** against `public.entitlements`, a per-isolate burst limit (4/min), a
**durable** per-user daily ceiling in `public.coach_usage`, an 8KB body cap,
and a strict payload parser that rejects anything but numbers and enum values.

The Plus check is server-side because the one in `src/ai/coach.ts` is a
suggestion — anyone can post to the endpoint directly with a valid JWT. The
daily ceiling bounds what an unentitled caller could cost you; it does not stop
them getting the feature.

Both the entitlement check and the daily ceiling **fail closed**. If either
lookup is unreachable the function returns 500 rather than letting the call
through — a spend cap that opens when its bookkeeping breaks is not a spend
cap — and the client degrades to rendering nothing.

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

### revenuecat-webhook

Keeps `public.entitlements` in step with what people own, so the Coach's
server-side Plus gate has something true to read. Without it, billing works
on-device and the Coach endpoint still answers 403 to a paying subscriber.

**One-time setup**

```sh
# Any long random string. This IS the authentication for the endpoint.
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 32)"
npx supabase db push        # applies 004_entitlement_event_cursor.sql
```

**Deploy — note the flag**

```sh
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`--no-verify-jwt` is required and is not a weakening: RevenueCat has no
Supabase session and cannot send a user JWT. The shared secret in the
`Authorization` header is the gate, it is compared in length-independent time,
and the function returns 500 to *every* request when the secret isn't
configured rather than running unauthenticated.

Then in RevenueCat → Project settings → Integrations → Webhooks, set the URL to
`https://<project-ref>.functions.supabase.co/revenuecat-webhook` and the
Authorization header to the same secret.

**Verify**

RevenueCat's "Send test event" button should return 200 with
`{"ok":true,"action":"ignored"}` — a TEST event is acknowledged and writes
nothing. A real sandbox purchase should then produce a row in
`public.entitlements` with `is_plus = true`.

**What it does and does not revoke**

`EXPIRATION`, `REFUND` and `SUBSCRIPTION_PAUSED` revoke. `CANCELLATION` does
**not** — that fires when someone turns off auto-renew, often weeks before
their access ends, and revoking on it would take away time they paid for.
`BILLING_ISSUE` doesn't revoke either, because access continues through the
grace period. Everything else is decided by the expiry: a grant whose
`expiration_at_ms` has already passed writes free.

### delete-account

Deletes the calling user's account. Spec: `docs/ACCOUNT_SPEC.md` §3.

**Deploy** (JWT verification stays on; the caller is always deleting their
own account):

```sh
npx supabase functions deploy delete-account
```

That alone is a working, compliant deletion: the auth user is removed, and
`predictions`, `coach_usage`, `entitlements` and `analytics_events` cascade
with it. Two optional legs switch on when all of their secrets are set, and
are skipped and logged until then:

```sh
# Sign in with Apple token revocation. A key with "Sign in with Apple"
# enabled (developer.apple.com → Keys), not the In-App Purchase key.
npx supabase secrets set APPLE_TEAM_ID=... APPLE_SIWA_KEY_ID=...   APPLE_CLIENT_ID=com.calibrate.app   APPLE_SIWA_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"

# RevenueCat customer deletion. A v2 secret key with customers *write*.
# The existing sk_ key is read-only for customers and won't work.
npx supabase secrets set REVENUECAT_DELETE_KEY=sk_...   REVENUECAT_PROJECT_ID=projb27eccad
```

**Verify**

```sh
curl -i -X POST https://<project-ref>.functions.supabase.co/delete-account
# → 401. Then delete a throwaway account from the app (Settings → Delete
# account) and confirm its auth.users row, and its rows in the four tables,
# are gone.
```

A 200 always means the auth user is gone. Anything else means it isn't, and
the app leaves the device untouched so the user can retry. The body's
`skipped` array lists any best-effort leg that didn't run, and why.

Smoke-tested locally under Deno 2 on 2026-09-25 against the live project's
auth: 401 without a header, 401 for a bogus token, 405 for GET.
