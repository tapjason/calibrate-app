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

The CLI (3.1) targets a local stack unless given `--remote`. All nine migrations are on the
live project (`migration list --remote`, 2026-11-18; the owner applied 009 that day).

The dashboard route still works if you prefer it — **SQL Editor → New query**, paste
each file in `supabase/migrations/` in numeric order, run.

Each script is idempotent (`create table if not exists`, `drop policy if
exists` before re-creating), so re-running on a project that already has the
schema is safe.

## 2026-11-18: migration 010 and two redeploys

From the security review of 2026-11-18. Nothing here has been applied or deployed by an
agent, and no Postgres was available to run 010 against: it was checked by reading only,
so steps 1 and 2 are how it gets checked for real. Every query in step 1 and step 2's
checks only reads; each test statement in step 2 undoes itself. Run each block in
**Supabase dashboard → SQL Editor → New query**, one at a time.

### 1. Look first (read-only)

**1a. Row counts.** Note them; step 2 compares.

```sql
select 'predictions' as table_name, count(*) as row_count from public.predictions
union all select 'analytics_events', count(*) from public.analytics_events
union all select 'guest_analytics_events', count(*) from public.guest_analytics_events
union all select 'entitlements', count(*) from public.entitlements
union all select 'coach_usage', count(*) from public.coach_usage;
```

**1b. The longest values.** Expect props under 100 characters, titles under 2,400,
reflections under 6,000, ids under 40. The new limits are 8,000 (title), 20,000
(reflection), 128 (prediction id) and 64 (event id).

```sql
select 'analytics_events.props' as what, max(length(props::text)) as longest from public.analytics_events
union all select 'guest_analytics_events.props', max(length(props::text)) from public.guest_analytics_events
union all select 'analytics_events.id', max(length(id)) from public.analytics_events
union all select 'predictions.id', max(length(id)) from public.predictions
union all select 'predictions.title', max(length(title)) from public.predictions
union all select 'predictions.reflection', max(length(reflection)) from public.predictions;
```

**1c. Rows the new checks would refuse.** Expect **no rows** from each of the two queries.
They show ids and event props only, never a title or reflection. A row here doesn't stop
010 (that constraint is left unvalidated and step 2 names it), but tell the agent before
applying: it may be a shape the app sends that the rule missed.

```sql
select b.table_name, b.id, b.name, b.props
  from (
    select 'analytics_events' as table_name, id, name, props from public.analytics_events
    union all
    select 'guest_analytics_events', id, name, props from public.guest_analytics_events
  ) as b
 where (select count(*) from jsonb_object_keys(b.props)) > 4
    or exists (
      select 1
        from jsonb_each(b.props) as e
       where e.key not in ('score', 'question_count', 'surface', 'confidence',
                           'integrity_bonus', 'correct', 'source', 'plan_annual',
                           'plan_monthly', 'plan_lifetime', 'trial', 'buckets_used',
                           'hour', 'insight_count', 'row_count')
          or not (case jsonb_typeof(e.value)
                    when 'boolean' then true
                    when 'number' then abs((e.value)::numeric) <= 1000000000
                    when 'string' then (e.value #>> '{}') in ('stats', 'stats_coach',
                      'stats_trends', 'share_theme', 'settings', 'deep_link', 'card',
                      'weekly', 'yearly', 'warmup')
                    else false
                  end)
    );
```

```sql
select 'predictions' as table_name, id from public.predictions
 where length(id) not between 1 and 128
    or length(title) > 8000
    or length(coalesce(reflection, '')) > 20000
union all
select 'analytics_events', id from public.analytics_events
 where length(id) not between 1 and 64
    or name !~ '^[a-z][a-z0-9_]{0,47}$';
```

**1d. Guest ids already in the hashed shape.** Expect `0` (before 010 is first applied).

```sql
select count(*) as guest_ids_already_hashed
  from public.guest_analytics_events
 where id ~ '^h_[0-9a-f]{32}$';
```

**1e. Today's grants. Save this output** (a screenshot is fine): step 5 uses it if a grant
ever has to be put back.

```sql
select t.table_name, r.role_name,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'select')   as sel,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'insert')   as ins,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'update')   as upd,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'delete')   as del,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'truncate') as trunc
  from (values ('predictions'), ('entitlements'), ('coach_usage'),
               ('analytics_events'), ('guest_analytics_events')) as t(table_name)
 cross join (values ('anon'), ('authenticated')) as r(role_name)
 order by 1, 2;
```

**A backup?** 010 changes the data of one table only: it rewrites `guest_analytics_events`
(about two dozen rows) so each id is a hash and each time is cut to its day. Every row and
every count stays. That rewrite is one-way on purpose (it is what makes the rows
unlinkable), so if you want the original first, use Table Editor → `guest_analytics_events`
→ Export to CSV, and delete the file once step 2 passes. Every other table only gains
checks and loses grants; step 5 undoes those.

### 2. Apply 010, then check it

Open `supabase/migrations/010_public_key_limits.sql`, paste the **whole file** into a new
query and run it. It runs as one transaction: all of it applies, or none of it.
**Expected:** "Success. No rows returned", and no NOTICE. A NOTICE that says "Constraint …
left NOT VALID" means rows already stored break that rule (1c lists them); everything else
applied, and the rule still holds for every new row.

(The CLI's migration history won't list 010 after the SQL editor. A later
`npx supabase db push --remote` will run it again, which is safe: it is idempotent.)

**2a. The triggers.** Expect 2 rows, `guest_analytics_events_limits` and
`guest_analytics_events_normalize`, each with `tgenabled` `O`.

```sql
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.guest_analytics_events'::regclass and not tgisinternal
 order by 1;
```

**2b. The new constraints.** Expect 7 rows, every `convalidated` `true`.

```sql
select conrelid::regclass as on_table, conname, convalidated
  from pg_constraint
 where conname in ('guest_analytics_events_props_allowed', 'analytics_events_id_length',
                   'analytics_events_name_shape', 'analytics_events_props_allowed',
                   'predictions_id_length', 'predictions_title_length',
                   'predictions_reflection_length')
 order by 1, 2;
```

**2c. The guest rows.** Expect `rows` equal to 1a's count and three zeros.

```sql
select count(*) as rows,
       count(*) filter (where id !~ '^h_[0-9a-f]{32}$') as ids_not_hashed,
       count(*) filter (where created_at  <> date_trunc('day', created_at, 'UTC'))  as created_not_day,
       count(*) filter (where received_at <> date_trunc('day', received_at, 'UTC')) as received_not_day
  from public.guest_analytics_events;
```

**2d. The grants.** Run 1e again. Expect exactly these `true`s, every other cell `false`:

| table | anon | authenticated |
|---|---|---|
| analytics_events | — | sel, ins |
| coach_usage | — | — |
| entitlements | — | sel |
| guest_analytics_events | ins | — |
| predictions | — | sel, ins, upd, del |

**2e. Who owns the day's count.** Expect `table_owner` and `limits_owner` to be the same
role (`postgres`). If they differ, `owner_bypasses_rls` must be `true`, or the day's budget
counts nothing; tell the agent.

```sql
select (select relowner::regrole from pg_class
         where oid = 'public.guest_analytics_events'::regclass) as table_owner,
       p.proowner::regrole as limits_owner,
       r.rolbypassrls as owner_bypasses_rls
  from pg_proc p join pg_roles r on r.oid = p.proowner
 where p.oid = 'public.guest_analytics_events_limits()'::regprocedure;
```

**2f. The props rule on every shape the app sends.** Expect 15 rows, all `ok` `true`.

```sql
select shape, public.analytics_props_ok(shape::jsonb) as ok
  from (values
    ('{}'),
    ('{"score": 63.333333333333336, "question_count": 10}'),
    ('{"surface": "card"}'), ('{"surface": "weekly"}'),
    ('{"surface": "yearly"}'), ('{"surface": "warmup"}'),
    ('{"confidence": 70, "integrity_bonus": false}'),
    ('{"confidence": 85, "correct": true}'),
    ('{"source": "stats_coach"}'),
    ('{"plan_annual": true, "plan_monthly": false, "plan_lifetime": false, "trial": true}'),
    ('{"buckets_used": 3}'),
    ('{"correct": 2, "question_count": 3}'),
    ('{"hour": 20}'),
    ('{"insight_count": 3}'),
    ('{"row_count": 148}')
  ) as t(shape);
```

And on shapes it must refuse: expect 8 rows, all `ok` `false`.

```sql
select shape, public.analytics_props_ok(shape::jsonb) as ok
  from (values
    ('{"title": "I will finish the report"}'),
    ('{"surface": "I will finish the report"}'),
    ('{"confidence": "70"}'),
    ('{"score": 1, "question_count": 2, "confidence": 3, "correct": true, "hour": 5}'),
    ('{"row_count": 10000000000}'),
    ('{"surface": null}'),
    ('{"surface": ["card"]}'),
    ('[]')
  ) as t(shape);
```

**Test statements.** Each runs as `anon` (the role a guest's phone uses), inserts into the
live table, and then raises an error on purpose so that everything it did is rolled back:
**an error is the expected result**, and the message says whether it passed. Nothing stays
in the table.

**T1, the app's own batch of 100 goes in.** Expected:
`ERROR: P0001: PASS: 100 rows accepted as anon, then rolled back`.

```sql
do $$
begin
  set local role anon;
  insert into public.guest_analytics_events (id, name, props, created_at)
  select 'verify-' || g, 'prediction_logged',
         '{"confidence": 70, "integrity_bonus": false}'::jsonb, now()
    from generate_series(1, 100) as g;
  raise exception 'PASS: 100 rows accepted as anon, then rolled back';
end $$;
```

**T2, 101 rows in one insert are refused.** Expected:
`ERROR: PT413: guest_analytics_events: at most 100 rows per insert`.

```sql
do $$
begin
  set local role anon;
  insert into public.guest_analytics_events (id, name, props, created_at)
  select 'verify-' || g, 'warmup_started', '{}'::jsonb, now()
    from generate_series(1, 101) as g;
  raise exception 'FAIL: 101 rows went in (rolled back)';
end $$;
```

**T3, a prop with words in it is refused.** Expected: `ERROR: 23514: new row for relation
"guest_analytics_events" violates check constraint "guest_analytics_events_props_allowed"`.

```sql
do $$
begin
  set local role anon;
  insert into public.guest_analytics_events (id, name, props, created_at)
  values ('verify-props', 'share_opened', '{"surface": "my secret plan"}'::jsonb, now());
  raise exception 'FAIL: a free-text prop went in (rolled back)';
end $$;
```

**T4 (optional, a few seconds), the day's budget trips.** Inserts batches of 100 until the
budget refuses one. Expected: `ERROR: P0001: PASS: the day budget refused batch N, then
everything was rolled back`, with N about 200 minus a hundredth of the guest rows received
today. It leaves about 20,000 dead rows that Postgres's autovacuum clears by itself.

```sql
do $$
declare
  batch integer;
begin
  set local role anon;
  for batch in 1..250 loop
    begin
      insert into public.guest_analytics_events (id, name, props, created_at)
      select 'budget-' || batch || '-' || g, 'warmup_started', '{}'::jsonb, now()
        from generate_series(1, 100) as g;
    exception
      when sqlstate 'PT429' then
        raise exception 'PASS: the day budget refused batch %, then everything was rolled back', batch;
    end;
  end loop;
  raise exception 'FAIL: 25,000 rows went in without the budget refusing (rolled back)';
end $$;
```

Then 1a again: the counts are unchanged.

### 3. Redeploy two functions

```sh
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
npx supabase functions deploy delete-account
```

`--no-verify-jwt` is required for the webhook only (RevenueCat sends the shared secret, not a
user token); `delete-account` keeps JWT verification on. Confirm with
`npx supabase functions list`: `revenuecat-webhook` and `delete-account` each one version
higher than before (13 and 11 on 2026-11-18), updated today. Then RevenueCat → Project
settings → Integrations → Webhooks → **Send test event**: expect 200 with
`{"ok":true,"action":"ignored",…}`. And `curl -i -X POST https://<project-ref>.functions.supabase.co/delete-account`
with no token: expect 401.

`coach` is not redeployed in this step: it follows in a later one. It also bundles
`_shared/revenuecatLookup.ts`, so until then the live Coach keeps its current copy (where a
RevenueCat 404 reads as "no Plus", which for the Coach only means a 403). Steps 2 and 3 can
go in either order.

### 4. A stopgap, if you want guest inserts closed before applying 010

One statement closes the anonymous insert (phones keep their guest counts queued, capped at
2,000 each, and send them once it's back):

```sql
drop policy "guests insert events" on public.guest_analytics_events;
```

To put it back (010 doesn't, so do this after applying 010 if you used the stopgap):

```sql
create policy "guests insert events"
  on public.guest_analytics_events for insert
  to anon
  with check (true);
```

### 5. Undo 010, if something goes wrong

The checks, triggers, functions and index come off with this, in one run:

```sql
drop trigger if exists guest_analytics_events_limits on public.guest_analytics_events;
drop trigger if exists guest_analytics_events_normalize on public.guest_analytics_events;
alter table public.guest_analytics_events
  drop constraint if exists guest_analytics_events_props_allowed;
alter table public.analytics_events
  drop constraint if exists analytics_events_id_length,
  drop constraint if exists analytics_events_name_shape,
  drop constraint if exists analytics_events_props_allowed;
alter table public.predictions
  drop constraint if exists predictions_id_length,
  drop constraint if exists predictions_title_length,
  drop constraint if exists predictions_reflection_length;
drop function if exists public.guest_analytics_events_limits();
drop function if exists public.guest_analytics_events_normalize();
drop function if exists public.analytics_props_ok(jsonb);
drop index if exists public.idx_guest_analytics_events_received_day;
alter table public.guest_analytics_events alter column received_at set default now();
```

The grants: put back only what something needs. If the app reports "permission denied"
(SQLSTATE 42501) after 010, grant that one privilege back from 1e's saved output, for
example `grant update on table public.analytics_events to authenticated;`. The blanket reset to
Supabase's defaults, as a last resort:
`grant all on table public.predictions, public.entitlements, public.coach_usage, public.analytics_events, public.guest_analytics_events to anon, authenticated;`.
The explicit `execute` grants on `apply_entitlement_event` and `bump_coach_usage` are
correct either way and stay. The guest rows stay rewritten (that can't be undone, and
nothing needs it undone).

To undo a function deploy, deploy it again from `master`.

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
  either way. The file ends with the queries that check it. Applied 2026-11-18, and
  both triggers are enabled (`pg_trigger`, the owner's screenshot); the file's own
  header still says "not applied", left as it was pushed.
- `migrations/010_public_key_limits.sql` — limits on what the public key can
  write (security review, 2026-11-18): at most 100 rows per guest insert and
  20,000 guest rows a day; analytics `props` limited to the declared keys and
  values; guest rows kept to the day with a hashed id, so they can't be tied
  together by time; size limits on prediction and event ids and text; each
  role's table grants cut to what the app uses. **Not applied yet**: the steps
  are in "2026-11-18: migration 010 and two redeploys" below.
- `functions/revenuecat-webhook/index.ts` — receives RevenueCat events and
  keeps `public.entitlements` current. Its decisions live in
  `entitlementFromEvent.ts` and its flow (look up, write, answer) in
  `handleEvent.ts`, plain TypeScript with no Deno imports so Jest can test them
  (`entitlementFromEvent.test.ts`, `handleEvent.test.ts`).
- `functions/_shared/revenuecatLookup.ts` — asks RevenueCat (API v2) whether a
  user has Plus right now. Used by `coach` when its entitlements row doesn't
  say Plus, and by `revenuecat-webhook` for the events it looks up (step 189;
  2026-11-18). Plain TypeScript, Jest-tested (`revenuecatLookup.test.ts`). The
  `_shared` folder is Supabase's convention for code several functions import;
  each deploy bundles it, so a function keeps the copy it was deployed with.
- `functions/delete-account/index.ts` — deletes the caller's account (App Store
  Guideline 5.1.1(v)): revokes Sign in with Apple (only the account's own Apple
  ID) and deletes the RevenueCat customer at the same time, then
  `auth.admin.deleteUser`, whose rows cascade out of every public table. Called
  from `src/supabase/account.ts`. Decision logic in `deletionPlan.ts`,
  Jest-tested (`deletionPlan.test.ts`).
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
189), and the webhook answers 500 to every event it looks up (`TRANSFER`, and since
2026-11-18 `CANCELLATION`, `REFUND_REVERSED` and a few others; a refund is written as free
first), so RevenueCat retries it and its dashboard shows the failure. The key is never
logged. Since 2026-11-18 `project_configuration:entitlements:read` is also what lets a
customer 404 mean "no Plus": without it, a 404 is an error too.

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

**What it does and does not revoke** (changed 2026-11-18, security review)

A closed list (`entitlementFromEvent.ts`); any other event type is answered 200 and writes
nothing, so a type RevenueCat adds later can't grant Plus.

- **Grants, decided by the expiry:** `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`,
  `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE`, `BILLING_ISSUE` (access continues through the
  grace period, whose end is the expiry), `SUBSCRIPTION_EXTENDED`. A grant whose
  `expiration_at_ms` has passed writes free. No expiry is believed only on
  `NON_RENEWING_PURCHASE` (the lifetime product); on the others it is looked up.
- **Revokes:** `EXPIRATION`.
- **Looked up in RevenueCat and written as it says now:** `CANCELLATION`,
  `REFUND_REVERSED`, `TEMPORARY_ENTITLEMENT_GRANT`, `PURCHASE_REDEEMED`. RevenueCat has no
  `REFUND` event: a refund is a `CANCELLATION` with `cancel_reason` `CUSTOMER_SUPPORT`, and a
  refunded Lifetime has no expiry. Until 2026-11-18 a `CANCELLATION` was decided from its own
  payload, where no expiry read as "never expires", so a refunded Lifetime stayed Plus for
  ever. A `CANCELLATION` can also be auto-renew turned off (access runs to the expiry); only
  RevenueCat's answer tells them apart. If the lookup fails, the function answers 500 so
  RevenueCat retries, and for a `CANCELLATION` that reads as the end of access (a refund, no
  expiry, or an expiry already past) it writes free first; the retry's lookup writes the truth.
- **Ignored:** `TEST`, `SUBSCRIBER_ALIAS`, `INVOICE_ISSUANCE`, `SUBSCRIPTION_PAUSED`
  (RevenueCat: "Don't revoke access on this event"), `VIRTUAL_CURRENCY_TRANSACTION`,
  `EXPERIMENT_ENROLLMENT`, the two `PRICE_INCREASE_CONSENT_*`.

Every write carries the event's `event_timestamp_ms` as the cursor (migration 004), so a
retried delivery is idempotent and an older event delivered late can't overwrite a newer one.

**`TRANSFER`** (step 189) carries no entitlement, only `transferred_from` and
`transferred_to`. Each Supabase user id in them (anonymous ids are skipped) is looked up in
RevenueCat with `REVENUECAT_READ_KEY` and written as RevenueCat says, Plus with its expiry or
free, with the event's timestamp as the cursor. A lookup that fails answers 500, so
RevenueCat retries, and writes nothing.

**A customer 404** from RevenueCat means "no Plus" only once a project-level call (the
entitlements list) has succeeded with the same key and project id; RevenueCat answers 404
for a wrong project id too, and a mistyped `REVENUECAT_PROJECT_ID` would otherwise write free
rows over real subscribers. Without that, it is an error (the webhook answers 500, the Coach
403). User ids are accepted in lowercase only, as Supabase writes them.

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

Since 2026-11-18 (security review): the Apple and RevenueCat legs run at the same time, each
cut off at 20 seconds, and the user is deleted only after both have settled, so the worst
case before the delete is about 20 seconds instead of three 8-second calls in a row. The
Apple leg revokes only the account's own grant: it reads the account's Apple identity with
the service role, exchanges the code, and compares the `sub` in the id_token Apple returns.
On a different Apple ID (the phone signed into another one) nothing is revoked, and
`skipped` says "apple: the code is for a different Apple ID than the account's; not
revoked". An account with no Apple identity never sends the code to Apple.

Smoke-tested locally under Deno 2 on 2026-09-25 against the live project's
auth: 401 without a header, 401 for a bogus token, 405 for GET.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` (the category check now in
  `006_custom_categories.sql`) mirror the union types in `src/types/index.ts`
  AND the SQLite CHECKs in `src/db/migrations/`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull (`src/supabase/sync.ts`).
