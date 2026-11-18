# Supabase schema

Postgres-side schema for Calibrate. The local SQLite source of truth lives in
`src/db/migrations/`; this directory mirrors what gets synced to the cloud.

## Applying migrations

The project is linked to the Supabase CLI (project ref `otopheizhjstoeyndcvc`).
Migrations are applied with:

```sh
npx supabase db push --remote          # applies anything in migrations/ not yet on remote
npx supabase migration list --remote   # shows local vs. remote state
```

The CLI (3.1) targets a local stack unless given `--remote`. Migrations 001–008 are on the
live project (`migration list --remote`, 2026-11-16). **009 is not applied yet** (the
owner's step, `docs/HUMAN_VERIFICATION.md` A6).

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
  prediction via OpenAI GPT-4o-mini. Called from `src/ai/refine.ts`. Not
  deployed (Refine is cut from v1; see below).
- `migrations/005_analytics_events.sql` — product analytics events. Append-only
  by policy (insert + select for the owning user, no update or delete grant),
  with CHECK constraints keeping `props` a small JSON object. There is no
  column freetext could go in.
- `migrations/006_custom_categories.sql` — the category check also accepts an
  added category's id (`c-` and 4 to 24 lowercase letters or digits; D39), so
  predictions filed under one sync. Never the name. Applied 2026-11-03.
- `migrations/007_guest_analytics_events.sql` — a guest's funnel events (D43,
  2026-11-03): no user, install or device id; insert only, for `anon` only;
  the eight event names in a CHECK; nobody but the service role reads it.
  Applied 2026-11-16; guests' counts are sent since then (step 186).
- `migrations/008_title_edited_at.sql` — `predictions.title_edited_at`, when a
  prediction's words last changed (D45): a reworded prediction counts as made
  then. Nullable, no default. Applied 2026-11-16; the date syncs with its
  prediction since then.
- `migrations/009_strip_provider_profile.sql` — two triggers, on `auth.users` and
  `auth.identities`, that remove the name and picture a sign-in provider sends
  as the row is written (step 192; Google sends both and nothing uses them).
  The function never raises, so it can't block a sign-in, and each trigger is
  created in a block that turns a refusal into a NOTICE, so the push succeeds
  either way. The file ends with the queries that check it. Not applied yet.
- `functions/revenuecat-webhook/index.ts` — receives RevenueCat events and
  keeps `public.entitlements` current. Its decision logic lives in
  `entitlementFromEvent.ts`, plain TypeScript with no Deno imports so Jest can
  test it (`entitlementFromEvent.test.ts`, 42 cases).
- `functions/_shared/revenuecatLookup.ts` — asks RevenueCat (API v2) whether a
  user has Plus right now. Used by `coach` when its entitlements row doesn't
  say Plus, and by `revenuecat-webhook` on a `TRANSFER` (step 189). Plain
  TypeScript, Jest-tested (`revenuecatLookup.test.ts`). The `_shared` folder is
  Supabase's convention for code several functions import; each deploy bundles
  it.
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

**Deployed** (`npx supabase functions list`, read 2026-11-16): `coach` (JWT on, version 14,
deployed 2026-11-15), `revenuecat-webhook` (JWT off, shared secret; last redeployed
2026-11-03) and `delete-account` (JWT on, version 11, deployed 2026-11-15). Both 2026-11-15
deploys postdate the last change to their code. **Step 189 (2026-11-17) changed `coach` and
`revenuecat-webhook`:** both need the new secret `REVENUECAT_READ_KEY` (below) and a
redeploy. `refine` is deliberately not deployed. The free-tier
project pauses when idle; `projects list` shows `INACTIVE` when it has, and it is restored
from the dashboard only.

### The RevenueCat read key (step 189)

`coach` and `revenuecat-webhook` ask RevenueCat directly whether a user has Plus
(`functions/_shared/revenuecatLookup.ts`): the Coach when its `entitlements` row is missing
or not active Plus, the webhook for each user a `TRANSFER` names. Without this, a purchase
the webhook never wrote (a `TRANSFER`, which carries no entitlement; a purchase made under
an anonymous id; an account deleted and made again) left a paying subscriber with a Coach
answering 403.

It needs a **v2 secret key with two read permissions and no write access** (RevenueCat →
Project settings → API keys → + New secret API key, API version 2). If the dashboard sets
access only per section, Customer information and Project configuration read-only is the
narrowest it allows:

- `customer_information:customers:read`: the customer's active entitlements.
- `project_configuration:entitlements:read`: an active entitlement names RevenueCat's own
  id for `plus` (an `entl…` id), not the lookup key, so the function reads the project's
  entitlements once to match them.

```sh
npx supabase secrets set REVENUECAT_READ_KEY=sk_...
# REVENUECAT_PROJECT_ID is already set (delete-account uses it).
npx supabase functions deploy coach
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

It is a separate key from `REVENUECAT_DELETE_KEY` on purpose: the delete key can write.
Without the read key, or with a permission missing, every lookup is an error and both
functions fail closed: the Coach answers 403 to anyone without a Plus row (as before step
189), and the webhook answers 500 to a `TRANSFER`, so RevenueCat retries it and its
dashboard shows the failure. The key is never logged.

### refine

**Not deployed: cut from the first release (2026-09-24).** The first live run turned
predictions into questions ("I'll finish the report" → "Will I finish the report?"),
so `REFINE_ENABLED` in `src/constants/app.ts` is false and `/functions/v1/refine` answers
404. The function, its client and their tests are kept dormant; fix the prompt first
(`CLAUDE.md` § AI A), then `npx supabase functions deploy refine` with JWT verification on.

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

**Never leave `COACH_ALLOW_UNENTITLED` set.** It skips the Plus gate entirely, and the
gate is the only thing standing between a signed-in free user and your OpenAI bill. If
it is ever set for a test, unset it and redeploy in the same sitting
(`docs/HUMAN_VERIFICATION.md` A4).

**Deploy**

```sh
supabase functions deploy coach
```

Cost protection is layered: a signed-in-user gate, a **server-side Plus
check** against `public.entitlements` (and, when that row doesn't say Plus,
RevenueCat itself; a yes writes the row), a per-isolate burst limit (4/min), a
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

### revenuecat-webhook

Keeps `public.entitlements` in step with what people own, so the Coach's
server-side Plus gate has something true to read. Without it, billing works
on-device and the Coach endpoint still answers 403 to a paying subscriber.

**One-time setup**

```sh
# Any long random string. This IS the authentication for the endpoint.
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 32)"
npx supabase db push --remote   # applies 004_entitlement_event_cursor.sql
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

**`TRANSFER`** (step 189) carries no entitlement, only `transferred_from` and
`transferred_to`. Each Supabase user id in them (anonymous ids are skipped) is looked up in
RevenueCat with `REVENUECAT_READ_KEY` and written as RevenueCat says, Plus with its expiry or
free, with the event's timestamp as the cursor. A lookup that fails answers 500, so
RevenueCat retries.

**A deleted user.** `apply_entitlement_event` catches a foreign-key violation itself
(migration 004) and returns normally. If the live function ever reports one instead
(SQLSTATE `23503`), the webhook answers 200 `{"ok":true,"action":"ignored","reason":"no such
user"}` rather than 500: retrying a deleted account's event can never succeed.

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
are skipped and logged until then. All of them are set (2026-11-16; the RevenueCat key
is spelled `REVENUECAT_DELETE_KEY`, and a misspelled name leaves that leg skipped).

```sh
# Sign in with Apple token revocation. A key with "Sign in with Apple"
# enabled (developer.apple.com → Keys), not the In-App Purchase key.
npx supabase secrets set APPLE_TEAM_ID=... APPLE_SIWA_KEY_ID=...   APPLE_CLIENT_ID=app.fairlysure   APPLE_SIWA_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"

# RevenueCat customer deletion. A v2 secret key with customers *write*.
# The existing sk_ key is read-only for customers and won't work.
npx supabase secrets set REVENUECAT_DELETE_KEY=sk_...   REVENUECAT_PROJECT_ID=projb27eccad
```

**Verify**

```sh
curl -i -X POST https://<project-ref>.functions.supabase.co/delete-account
# → 401. Then delete a throwaway account from the app (You → Delete
# account) and confirm its auth.users row, and its rows in the four tables,
# are gone.
```

A 200 always means the auth user is gone. Anything else means it isn't, and
the app leaves the device untouched so the user can retry. The body's
`skipped` array lists any best-effort leg that didn't run, and why.

Smoke-tested locally under Deno 2 on 2026-09-25 against the live project's
auth: 401 without a header, 401 for a bogus token, 405 for GET.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` (the category check now in
  `006_custom_categories.sql`) mirror the union types in `src/types/index.ts`
  AND the SQLite CHECKs in `src/db/migrations/`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull (`src/supabase/sync.ts`).
