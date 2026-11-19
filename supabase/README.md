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

**Working down the checklist at the top of the 2026-11-19 section? Skip this step:** that
section's step 8 deploys the same two functions from the branch's final commit, and each needs
deploying only once.

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

`coach` is not redeployed in this step: the 2026-11-19 section's step 9 does it. It also
bundles `_shared/revenuecatLookup.ts`, so until then the live Coach keeps its current copy
(where a RevenueCat 404 reads as "no Plus", which for the Coach only means a 403). Steps 2 and
3 can go in either order.

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

## 2026-11-19: migrations 011 and 012, three redeploys, and the sandbox Plus rows

From rounds 5 and 6 of the security review. Nothing here has been applied or deployed by an
agent, and no Postgres was available to run 011 or 012 against (no psql, Docker or Deno on this
machine, and WSL can't start because virtualization isn't enabled; checked again in round 6):
both were checked by reading only, so steps 1, 3, 5 and 7 are how they get checked for real.

### Every owner step, in order

Work down this list, top to bottom; each line says where its details are. It includes the
2026-11-18 section above, so nothing there needs doing separately.

1. **Audit logs off, and purged.** Supabase dashboard → Authentication → Configuration → Audit
   Logs: turn off "Write audit logs to the database". Then in the SQL Editor run
   `delete from auth.audit_log_entries;`, then `select count(*) from auth.audit_log_entries;`,
   which must return `0` (`docs/PRIVACY_POLICY.md`, the list at its top, items 1 and 2).
2. **010, look first:** the 2026-11-18 section, step 1 (1a–1e; save 1e's output).
3. **Apply 010 and check it:** the 2026-11-18 section, step 2 (2a–2f, then T1–T3; T4 is
   optional).
4. **011, look first:** step 1 below.
5. **Apply 011:** step 2 below.
6. **Check 011:** step 3 below (3a–3f, then T5, T6, T8, T10, T11 and T12; T7 and T9 are
   optional).
7. **Enable pg_cron:** step 4 below.
8. **012, look first:** step 5 below.
9. **Apply 012:** step 6 below.
10. **Check 012:** step 7 below (7a–7d; T13 is optional), then 7e the day after.
11. **Redeploy `delete-account` and `revenuecat-webhook`** from this branch's final commit: step
    8 below. This is also the 2026-11-18 section's step 3 (the same two functions): deploy each
    once, from the final commit.
12. **Redeploy `coach`** from the same commit: step 9 below. **Never from commit `6830354`.**
13. **Tell the agent "011 is live":** step 10 below. The agent turns on `UTC_OFFSET_SYNC` in a
    later build.

Left out on purpose: the 2026-11-18 section's step 4 (a stopgap for before 010, not needed
once 010 is in); step 11 below (the sandbox Plus rows: after App Store approval, a separate
sitting); steps 12 and 13 (undo, only if something goes wrong).

### What 011 does

**Apply it only after 010** and 010's checks (the 2026-11-18 section above); 011 refuses to run
without 010's functions and changes nothing if so.

- `predictions` gains `created_utc_offset_min` and `title_edited_utc_offset_min`: the phone's
  offset from UTC, in minutes east, when the prediction was logged and when it was reworded.
  Your decision of 2026-11-19, as refined after the re-review: a same-day answer is judged
  only in the zone the prediction was logged (or reworded) in, so the answer's own offset
  isn't kept and has no column. Nullable, each held to −840…840. A push that sends an offset
  as null (a phone that never had it, such as one that pulled the row before the app sent
  offsets) keeps the one already stored for the same moment: a null means the phone doesn't
  know. A push that changes the moment (new words with their own date) takes what it brings,
  null included.
- No answer goes back to open through sync: an update that would turn an answered row (Yes,
  No or "Can't tell") into open, or a Yes or No into "Can't tell", comes from a phone that
  hadn't pulled the answer, and none of it lands. The whole row stays as it was (status,
  `resolved_at`, reflection, title, category, due date, `title_edited_at`, the offsets) and
  only `updated_at` moves, past both copies' times, so the stale phone's next pull takes the
  answered row. Yes ↔ No and "Can't tell" → Yes or No still go through. It never raises an
  error.
- Per account (the public key's roles only; your own statements in the SQL editor aren't
  limited): at most 100 new and 100 changed predictions per request and 50,000 predictions
  per account; at most 25 MB of titles and notes per account (a statement that adds text past
  it is refused; one that adds none, such as an answer, always goes through); at most 100
  events per request and 5,000 per UTC day on `analytics_events`, whose `received_at` is now
  always the server's clock; a title at most 8,000 bytes and a reflection 20,000 (010 counted
  characters, which can be 4 bytes each).
- Guest table: an insert of more than 100 rows stops at row 101, before the rest is written;
  inserts stop once the table's estimated rows pass 500,000; and on both analytics tables a
  number in `props` is at most 24 characters long (010 allowed hundreds of digits).

### What 012 does

**Apply it only after 011**, and after enabling pg_cron (step 4); 012 refuses to run without
either and changes nothing if so.

- Usage counts are kept for 13 months (your decision of 2026-11-19). A daily `pg_cron` job,
  `purge-old-usage-counts`, at 09:17 UTC, deletes rows of `analytics_events` and
  `guest_analytics_events` once they are more than 13 months old by `received_at`, the
  server's clock. It deletes in batches of 5,000 rows, each committed on its own, at most 200
  batches or 25 seconds per table a night, so a large backlog is spread over days and no lock
  is held for long. The app doesn't change. "Kept for 13 months" is true only while this job
  runs; step 7e checks that it does.
- At most 100,000 rows of `analytics_events` per account (the public key's roles only, like
  011's limits): an insert past it is refused with `PT429`, and the phone keeps its counts
  queued. 011's day cap alone let one account add about 2.75 MB a day for ever.
- An index on `analytics_events (received_at)`, so the job finds the oldest rows without
  reading the whole table.

Every query in steps 1, 3, 4, 5 and 7 only reads; each test statement undoes itself. Run each
block in **Supabase dashboard → SQL Editor → New query**, one at a time.

### 1. Look first at 011 (read-only)

**1a. 010 is in.** Expect `true` and `true`. If either is `false`, apply 010 first (the
section above).

```sql
select to_regprocedure('public.analytics_props_ok(jsonb)') is not null as has_010_props_rule,
       to_regprocedure('public.guest_analytics_events_limits()') is not null as has_010_guest_limits;
```

**1b. The longest text, in bytes.** Expect titles under 7,200 and reflections under 18,000
(the most the app can write). The new limits are 8,000 and 20,000.

```sql
select 'predictions.title (bytes)' as what, max(octet_length(title)) as longest from public.predictions
union all select 'predictions.reflection (bytes)', max(octet_length(reflection)) from public.predictions;
```

**1c. Rows the new checks would refuse.** Expect **no rows**. It shows ids only, never a title
or reflection. A row here doesn't stop 011 (that constraint is left unvalidated and step 2
prints a NOTICE naming it), but tell the agent before applying: it may be a shape the app
sends that the rule missed.

```sql
select 'predictions' as table_name, id from public.predictions
 where octet_length(title) > 8000 or octet_length(coalesce(reflection, '')) > 20000
union all
select 'analytics_events', e.id from public.analytics_events e
 where exists (select 1 from jsonb_each(e.props) p
                where jsonb_typeof(p.value) = 'number' and length(p.value::text) > 24)
union all
select 'guest_analytics_events', g.id from public.guest_analytics_events g
 where exists (select 1 from jsonb_each(g.props) p
                where jsonb_typeof(p.value) = 'number' and length(p.value::text) > 24);
```

**1d. How close anyone is to the new caps.** Note the numbers. Expect the first far under
50,000, the second far under 26,214,400 bytes (25 MB; a typical account holds a few hundred
thousand at most), the third far under 5,000, and the guest rows far under 500,000 (the
estimate reads `-1` on a table never analyzed, which is fine).

```sql
select
  (select coalesce(max(n), 0) from (select count(*) as n from public.predictions group by user_id) s)
    as most_predictions_one_account,
  (select coalesce(max(b), 0) from (select sum(octet_length(title) + coalesce(octet_length(reflection), 0)) as b
                                      from public.predictions group by user_id) s)
    as most_text_bytes_one_account,
  (select coalesce(max(n), 0) from (select count(*) as n from public.analytics_events
                                     where received_at >= date_trunc('day', now(), 'UTC')
                                     group by user_id) s)
    as most_events_one_account_today,
  (select reltuples::bigint from pg_class where oid = 'public.guest_analytics_events'::regclass)
    as guest_rows_estimate,
  (select count(*) from public.guest_analytics_events) as guest_rows;
```

**A backup?** 011 rewrites no row. It adds two empty columns, checks, triggers and an index,
and replaces two functions; step 12 takes them off again.

### 2. Apply 011

Open `supabase/migrations/011_offsets_answers_limits.sql`, paste the **whole file** into a new
query and run it. It runs as one transaction: all of it applies, or none of it.
**Expected:** "Success. No rows returned", and no NOTICE.

- A NOTICE "Constraint … left NOT VALID" means rows already stored break that rule (1c lists
  them); everything else applied, and the rule still holds for every new row. Tell the agent.
- `ERROR: P0001: Migration 011 needs migration 010 first…`: nothing was applied. Apply 010,
  then 011.
- `ERROR: 55P03: canceling statement due to lock timeout`: the app held a table for more
  than 10 seconds; nothing was applied. Run it again a minute later.

(As with 010, the CLI's migration history won't list 011 after the SQL editor; a later
`npx supabase db push --remote` runs 010, 011 and 012 again, in that order, which is safe.
**Never run 010 alone after 011**: it would put back 010's looser props rule. If you do, run 011
again.)

### 3. Check 011

**3a. The columns.** Expect exactly 2 rows, `created_utc_offset_min` and
`title_edited_utc_offset_min`, each `integer` and `YES`. A third row,
`resolved_utc_offset_min`, would mean an earlier draft of 011 ran somewhere: tell the agent.

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'predictions'
   and column_name like '%utc%offset%'
 order by 1;
```

**3b. The constraints.** Expect 6 rows, every `convalidated` `true`.

```sql
select conrelid::regclass as on_table, conname, convalidated
  from pg_constraint
 where conname in ('predictions_created_utc_offset_min_range',
                   'predictions_title_edited_utc_offset_min_range',
                   'predictions_title_bytes', 'predictions_reflection_bytes',
                   'analytics_events_props_allowed', 'guest_analytics_events_props_allowed')
 order by conrelid::regclass::text, conname;
```

**3c. The triggers.** Expect these 10 rows, each `tgenabled` `O`: on `analytics_events`,
`analytics_events_limits` and `analytics_events_stamp_received`; on `guest_analytics_events`,
`guest_analytics_events_count_rows`, `guest_analytics_events_limits`,
`guest_analytics_events_normalize` and `guest_analytics_events_reset_count`; on `predictions`,
`predictions_insert_limits`, `predictions_keep_answer`, `predictions_keep_offsets` and
`predictions_update_limits`. (Run after 012, it shows an eleventh:
`analytics_events_account_cap` on `analytics_events`.)

```sql
select tgrelid::regclass as on_table, tgname, tgenabled
  from pg_trigger
 where tgrelid in ('public.predictions'::regclass, 'public.analytics_events'::regclass,
                   'public.guest_analytics_events'::regclass)
   and not tgisinternal
 order by tgrelid::regclass::text, tgname;
```

**3d. The index.** Expect 1 row, `idx_analytics_events_user_received`.

```sql
select indexname from pg_indexes
 where schemaname = 'public' and indexname = 'idx_analytics_events_user_received';
```

**3e. Who owns the counts.** Expect 3 rows, each with `owner` equal to `table_owner`
(`postgres`). If one differs, `owner_bypasses_rls` must be `true`, or that count misses rows;
tell the agent.

```sql
select t.fn as trigger_function, p.proowner::regrole as owner, r.rolbypassrls as owner_bypasses_rls,
       (select relowner::regrole from pg_class where oid = t.tbl) as table_owner
  from (values ('public.predictions_write_limits()'::regprocedure, 'public.predictions'::regclass),
               ('public.analytics_events_limits()'::regprocedure, 'public.analytics_events'::regclass),
               ('public.guest_analytics_events_count_rows()'::regprocedure,
                'public.guest_analytics_events'::regclass)) as t(fn, tbl)
  join pg_proc p on p.oid = t.fn
  join pg_roles r on r.oid = p.proowner;
```

**3f. The props rule on every shape the app sends.** Expect 17 rows, all `ok` `true` (010's
15, then the longest numbers the rule takes).

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
    ('{"row_count": 148}'),
    ('{"score": 99.99999999999999}'),
    ('{"score": 0.0000012345678901234567}')
  ) as t(shape);
```

And on shapes it must refuse: expect 11 rows, all `ok` `false` (010's 8, then numbers longer
than 24 characters).

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
    ('[]'),
    ('{"score": 0.00000123456789012345678}'),
    ('{"score": 1e-30}'),
    ('{"row_count": 123456789.123456789123456789}')
  ) as t(shape);
```

**Test statements.** Each writes to the live tables and then raises an error on purpose, so
everything it did is rolled back: **an error is the expected result**, and its message says
PASS or FAIL. Nothing stays, and no other session ever sees the rows. T5–T9, T11 and T12 act
as a signed-in phone of the oldest account (most likely yours): they set the session's JWT
claims and the `authenticated` role, exactly as the API does. T10 acts as a guest (`anon`).

**T5, answered rows stay as they were.** A stale phone's open copy, pushed over a Yes and
over a "Can't tell", and a Yes pushed as "Can't tell", each leave every field of the row as it
was and move `updated_at` past both copies' times; "Change answer" and answering a "Can't
tell" still go through. Expected:
`ERROR: P0001: PASS: stale copies changed nothing but updated_at; Change answer and answering a Can't tell still work; rolled back`.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  before_row public.predictions;
  after_row public.predictions;
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- A Yes, as a phone pushes it.
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, resolved_at, reflection,
     title_edited_at, created_utc_offset_min, title_edited_utc_offset_min, updated_at)
  values
    ('verify-011-yes', uid, 'Verify 011', 'work', 70, now() - interval '3 days', now() - interval '1 day',
     'resolved_yes', now() - interval '1 day', 'kept', null, 60, null, '2026-11-19T10:00:00.000Z');
  select * into before_row from public.predictions where id = 'verify-011-yes';

  -- An older phone's open copy, reworded, re-dated and re-filed, pushed later
  -- with a later time: the upsert the app sends, every column named.
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, resolved_at, reflection,
     title_edited_at, created_utc_offset_min, title_edited_utc_offset_min, updated_at)
  values
    ('verify-011-yes', uid, 'Verify 011, reworded', 'health', 70, now() - interval '3 days', now() + interval '5 days',
     'pending', null, null, now(), -300, -300, '2026-11-19T10:05:00.000Z')
  on conflict (id) do update set
    title = excluded.title, category = excluded.category, due_date = excluded.due_date,
    status = excluded.status, resolved_at = excluded.resolved_at, reflection = excluded.reflection,
    title_edited_at = excluded.title_edited_at, created_utc_offset_min = excluded.created_utc_offset_min,
    title_edited_utc_offset_min = excluded.title_edited_utc_offset_min, updated_at = excluded.updated_at;

  select * into after_row from public.predictions where id = 'verify-011-yes';
  if to_jsonb(after_row) - 'updated_at' <> to_jsonb(before_row) - 'updated_at'
     or after_row.updated_at <= before_row.updated_at
     or after_row.updated_at <= '2026-11-19T10:05:00.000Z'::timestamptz
     or after_row.updated_at <> date_trunc('milliseconds', after_row.updated_at) then
    raise exception 'FAIL: the open copy changed the Yes, or its time did not move past both (rolled back)';
  end if;

  -- A Yes pushed as Can't tell: the same.
  before_row := after_row;
  update public.predictions set status = 'skipped', reflection = null where id = 'verify-011-yes';
  select * into after_row from public.predictions where id = 'verify-011-yes';
  if to_jsonb(after_row) - 'updated_at' <> to_jsonb(before_row) - 'updated_at'
     or after_row.updated_at <= before_row.updated_at then
    raise exception 'FAIL: a Yes became Can''t tell, or its time did not move on (rolled back)';
  end if;

  -- Yes to No still goes through ("Change answer").
  update public.predictions set status = 'resolved_no' where id = 'verify-011-yes';
  if (select status from public.predictions where id = 'verify-011-yes') <> 'resolved_no' then
    raise exception 'FAIL: Change answer was refused (rolled back)';
  end if;

  -- A Can't tell pushed as open, with new words: nothing changes but the time.
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, resolved_at, updated_at)
  values
    ('verify-011-skip', uid, 'Verify 011 skip', 'work', 60, now() - interval '3 days', now() - interval '1 day',
     'skipped', now() - interval '1 day', '2026-11-19T10:00:00.000Z');
  select * into before_row from public.predictions where id = 'verify-011-skip';
  update public.predictions
     set status = 'pending', resolved_at = null, title = 'Verify 011 skip, reworded'
   where id = 'verify-011-skip';
  select * into after_row from public.predictions where id = 'verify-011-skip';
  if to_jsonb(after_row) - 'updated_at' <> to_jsonb(before_row) - 'updated_at'
     or after_row.updated_at <= before_row.updated_at then
    raise exception 'FAIL: a Can''t tell went back to open or took the new words (rolled back)';
  end if;

  -- And a Can't tell can still be answered.
  update public.predictions set status = 'resolved_yes', resolved_at = now() where id = 'verify-011-skip';
  if (select status from public.predictions where id = 'verify-011-skip') <> 'resolved_yes' then
    raise exception 'FAIL: a Can''t tell could not be answered (rolled back)';
  end if;

  raise exception 'PASS: stale copies changed nothing but updated_at; Change answer and answering a Can''t tell still work; rolled back';
end $$;
```

**T6, a request holds at most 100 new and 100 changed predictions.** Expected:
`ERROR: P0001: PASS: 101 predictions went in as 100 and 1; 101 new and 101 changed in one statement were refused (PT413); rolled back`.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  new_refused text := 'not refused';
  changed_refused text := 'not refused';
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.predictions (id, user_id, title, category, confidence, created_at, due_date, status, updated_at)
  select 'verify-011-' || g, uid, 'Verify 011', 'work', 70, now(), now() + interval '1 day', 'pending', now()
    from generate_series(1, 100) as g;
  insert into public.predictions (id, user_id, title, category, confidence, created_at, due_date, status, updated_at)
  values ('verify-011-101', uid, 'Verify 011', 'work', 70, now(), now() + interval '1 day', 'pending', now());

  begin
    insert into public.predictions (id, user_id, title, category, confidence, created_at, due_date, status, updated_at)
    select 'verify-011-big-' || g, uid, 'Verify 011', 'work', 70, now(), now() + interval '1 day', 'pending', now()
      from generate_series(1, 101) as g;
  exception when sqlstate 'PT413' then new_refused := sqlerrm;
  end;

  begin
    update public.predictions set confidence = 60 where id like 'verify-011-%';
  exception when sqlstate 'PT413' then changed_refused := sqlerrm;
  end;

  if new_refused = 'predictions: at most 100 new rows in one request'
     and changed_refused = 'predictions: at most 100 changed rows in one request' then
    raise exception 'PASS: 101 predictions went in as 100 and 1; 101 new and 101 changed in one statement were refused (PT413); rolled back';
  end if;
  raise exception 'FAIL: 101 new rows: %; 101 changed rows: % (rolled back)', new_refused, changed_refused;
end $$;
```

**T7 (optional, up to a minute), the 50,000 cap.** Inserts batches of 100 until the cap
refuses one. Expected: `ERROR: P0001: PASS: the account cap refused batch N …`, with N equal
to the "expected batch" in the same message (about 500, less a hundredth of the account's
predictions). It leaves about 50,000 dead rows that autovacuum clears by itself. If the editor
times out first, that says nothing about the cap; skip it.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  had bigint;
  batch integer;
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  select count(*) into had from public.predictions where user_id = uid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for batch in 1..501 loop
    begin
      insert into public.predictions (id, user_id, title, category, confidence, created_at, due_date, status, updated_at)
      select 'verify-011-cap-' || batch || '-' || g, uid, 'v', 'work', 70, now(), now() + interval '1 day',
             'pending', now()
        from generate_series(1, 100) as g;
    exception
      when sqlstate 'PT429' then
        raise exception 'PASS: the account cap refused batch % (the account had % predictions; expected batch %), then everything was rolled back',
          batch, had, (50000 - had) / 100 + 1;
    end;
  end loop;
  raise exception 'FAIL: 50,100 predictions went in without the cap refusing (rolled back)';
end $$;
```

**T8, events: 100 a request, and the server's clock.** Expected:
`ERROR: P0001: PASS: 100 events went in, the server set received_at, 101 were refused (PT413); rolled back`.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  stamped timestamptz;
  refused text := 'not refused';
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.analytics_events (id, user_id, name, props, created_at)
  select 'verify-011-' || g, uid, 'prediction_logged', '{"confidence": 70, "integrity_bonus": false}'::jsonb, now()
    from generate_series(1, 100) as g;

  -- A client that sends its own received_at.
  insert into public.analytics_events (id, user_id, name, props, created_at, received_at)
  values ('verify-011-clock', uid, 'warmup_started', '{}'::jsonb, now(), '2000-01-01T00:00:00Z');
  select received_at into stamped from public.analytics_events where id = 'verify-011-clock';

  begin
    insert into public.analytics_events (id, user_id, name, props, created_at)
    select 'verify-011-big-' || g, uid, 'warmup_started', '{}'::jsonb, now()
      from generate_series(1, 101) as g;
  exception when sqlstate 'PT413' then refused := sqlerrm;
  end;

  if stamped = now() and refused = 'analytics_events: at most 100 rows per insert' then
    raise exception 'PASS: 100 events went in, the server set received_at, 101 were refused (PT413); rolled back';
  end if;
  raise exception 'FAIL: received_at %, 101 rows: % (rolled back)', stamped, refused;
end $$;
```

**T9 (optional, a few seconds), the day's cap.** Expected: `ERROR: P0001: PASS: the day cap
refused batch N …`, with N equal to the "expected batch" in the message (51, less a hundredth
of the account's events today).

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  had bigint;
  batch integer;
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  select count(*) into had from public.analytics_events
   where user_id = uid and received_at >= date_trunc('day', now(), 'UTC');
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for batch in 1..51 loop
    begin
      insert into public.analytics_events (id, user_id, name, props, created_at)
      select 'verify-011-day-' || batch || '-' || g, uid, 'warmup_started', '{}'::jsonb, now()
        from generate_series(1, 100) as g;
    exception
      when sqlstate 'PT429' then
        raise exception 'PASS: the day cap refused batch % (the account had % events today; expected batch %), then everything was rolled back',
          batch, had, (5000 - had) / 100 + 1;
    end;
  end loop;
  raise exception 'FAIL: 5,100 events went in today without the cap refusing (rolled back)';
end $$;
```

**T10, a guest insert stops at row 101, and each statement is counted alone.** Expected:
`ERROR: P0001: PASS: two inserts of 100 went in; one of 101 stopped at row 101 (PT413); rolled back`.
If you get `ERROR: PT413: guest_analytics_events: stopped at row 101…` instead, with no PASS,
the count didn't start again at the second statement; if the FAIL message names "at most 100
rows per insert", the early stop didn't work and only 010's check caught it. Either way tell
the agent (010's limit still holds).

```sql
do $$
declare
  refused text := 'not refused';
begin
  set local role anon;
  insert into public.guest_analytics_events (id, name, props, created_at)
  select 'verify-011-a-' || g, 'warmup_started', '{}'::jsonb, now() from generate_series(1, 100) as g;
  insert into public.guest_analytics_events (id, name, props, created_at)
  select 'verify-011-b-' || g, 'warmup_started', '{}'::jsonb, now() from generate_series(1, 100) as g;
  begin
    insert into public.guest_analytics_events (id, name, props, created_at)
    select 'verify-011-c-' || g, 'warmup_started', '{}'::jsonb, now() from generate_series(1, 101) as g;
  exception when sqlstate 'PT413' then refused := sqlerrm;
  end;
  if refused = 'guest_analytics_events: stopped at row 101; at most 100 rows per insert' then
    raise exception 'PASS: two inserts of 100 went in; one of 101 stopped at row 101 (PT413); rolled back';
  end if;
  raise exception 'FAIL: 101 rows: % (rolled back)', refused;
end $$;
```

**T11 (a few seconds), the 25 MB text budget.** Inserts batches of 100 predictions holding
28,000 bytes of title and note each (2.8 MB a batch) until the budget refuses one; then, as you
(the SQL editor isn't limited), pushes the account past the budget; then, as the phone again,
answers one prediction (adds no text: goes through) and lengthens a note (adds text: refused).
Expected:
`ERROR: P0001: PASS: the text budget refused batch N as expected; your own insert wasn't limited; over the budget an answer went through and a longer note was refused (PT429); rolled back`,
with N about 10 (fewer if the account already holds megabytes of text). The text is repeated
letters, which Postgres compresses, so it takes little room before it is rolled back.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  had bigint;
  expected integer;
  batch integer;
  refused_at integer;
  answered boolean;
  longer_note text := 'not refused';
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  select coalesce(sum(octet_length(title) + coalesce(octet_length(reflection), 0)), 0) into had
    from public.predictions where user_id = uid;
  expected := (26214400 - had) / 2800000 + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  for batch in 1..11 loop
    begin
      insert into public.predictions
        (id, user_id, title, category, confidence, created_at, due_date, status, reflection, updated_at)
      select 'verify-011-text-' || batch || '-' || g, uid, repeat('t', 8000), 'work', 70, now(),
             now() + interval '1 day', 'pending', repeat('r', 20000), now()
        from generate_series(1, 100) as g;
    exception when sqlstate 'PT429' then
      refused_at := batch;
      exit;
    end;
  end loop;

  -- As you, in the SQL editor: not limited, so the account goes past the budget.
  set local role none;
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, reflection, updated_at)
  select 'verify-011-text-owner-' || g, uid, repeat('t', 8000), 'work', 70, now(),
         now() + interval '1 day', 'pending', repeat('r', 20000), now()
    from generate_series(1, 100) as g;
  insert into public.predictions (id, user_id, title, category, confidence, created_at, due_date, status, updated_at)
  values ('verify-011-text-small', uid, 'Short', 'work', 70, now(), now() + interval '1 day', 'pending', now());

  -- The phone again, over the budget: an answer adds no text and goes through ...
  set local role authenticated;
  update public.predictions set status = 'resolved_yes', resolved_at = now() where id = 'verify-011-text-small';
  answered := (select status from public.predictions where id = 'verify-011-text-small') = 'resolved_yes';
  -- ... and a longer note adds text and is refused.
  begin
    update public.predictions set reflection = 'A note that adds text' where id = 'verify-011-text-small';
  exception when sqlstate 'PT429' then longer_note := sqlerrm;
  end;

  if refused_at = expected and answered
     and longer_note = 'predictions: an account holds at most 26214400 bytes of titles and notes' then
    raise exception 'PASS: the text budget refused batch % as expected; your own insert wasn''t limited; over the budget an answer went through and a longer note was refused (PT429); rolled back',
      refused_at;
  end if;
  raise exception 'FAIL: refused at batch % (expected %), answer went through: %, longer note: % (rolled back)',
    refused_at, expected, answered, longer_note;
end $$;
```

**T12, a null offset doesn't erase a stored one.** A prediction logged at UTC+1 and reworded
at UTC+9 is answered by a phone that knows neither offset, which pushes the whole row with both
offsets null and the two moments written in another zone (the same instants): both stored
offsets stay, and the rest of the push (the answer, its `updated_at`) lands as sent. Then a
known offset replaces a stored one; a logging time moved by an hour (the app never does this)
takes the null it brings while the reword's offset, its moment unchanged, stays; and new words
with their own date take their null. `updated_at` is never touched. Expected:
`ERROR: P0001: PASS: a null push kept both stored offsets and the rest landed; a known offset replaced one; a moved logging time and new words with their own date let the null through; updated_at untouched; rolled back`.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  r public.predictions;
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Logged at UTC+1, reworded at UTC+9, as a phone with the offsets on pushes it.
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, resolved_at, reflection,
     title_edited_at, created_utc_offset_min, title_edited_utc_offset_min, updated_at)
  values
    ('verify-011-offsets', uid, 'Verify 011 offsets', 'work', 70, '2026-11-16T09:00:00.000Z',
     '2026-11-22T12:00:00.000Z', 'pending', null, null, '2026-11-17T09:00:00.000Z', 60, 540,
     '2026-11-19T10:00:00.000Z');

  -- A phone that knows neither offset answers it and pushes the whole row:
  -- both offsets null, the same two moments written in other zones.
  insert into public.predictions
    (id, user_id, title, category, confidence, created_at, due_date, status, resolved_at, reflection,
     title_edited_at, created_utc_offset_min, title_edited_utc_offset_min, updated_at)
  values
    ('verify-011-offsets', uid, 'Verify 011 offsets', 'work', 70, '2026-11-16T10:00:00.000+01:00',
     '2026-11-22T12:00:00.000Z', 'resolved_yes', '2026-11-19T10:04:00.000Z', null,
     '2026-11-17T18:00:00.000+09:00', null, null, '2026-11-19T10:05:00.000Z')
  on conflict (id) do update set
    title = excluded.title, category = excluded.category, confidence = excluded.confidence,
    created_at = excluded.created_at, due_date = excluded.due_date, status = excluded.status,
    resolved_at = excluded.resolved_at, reflection = excluded.reflection,
    title_edited_at = excluded.title_edited_at, created_utc_offset_min = excluded.created_utc_offset_min,
    title_edited_utc_offset_min = excluded.title_edited_utc_offset_min, updated_at = excluded.updated_at;
  select * into r from public.predictions where id = 'verify-011-offsets';
  if r.created_utc_offset_min is distinct from 60 or r.title_edited_utc_offset_min is distinct from 540
     or r.status <> 'resolved_yes' or r.updated_at <> '2026-11-19T10:05:00.000Z'::timestamptz then
    raise exception 'FAIL: after the null push: logged offset %, reworded offset %, status %, updated_at % (expected 60, 540, resolved_yes, 2026-11-19 10:05 UTC; rolled back)',
      r.created_utc_offset_min, r.title_edited_utc_offset_min, r.status, r.updated_at;
  end if;

  -- A known offset still replaces the stored one.
  update public.predictions set created_utc_offset_min = 120 where id = 'verify-011-offsets';
  select * into r from public.predictions where id = 'verify-011-offsets';
  if r.created_utc_offset_min is distinct from 120 then
    raise exception 'FAIL: a known offset did not replace the stored one: % (expected 120; rolled back)',
      r.created_utc_offset_min;
  end if;

  -- A moved logging time takes its null; the reword's moment is unchanged, so its offset stays.
  update public.predictions
     set created_at = created_at - interval '1 hour', created_utc_offset_min = null,
         title_edited_utc_offset_min = null
   where id = 'verify-011-offsets';
  select * into r from public.predictions where id = 'verify-011-offsets';
  if r.created_utc_offset_min is not null or r.title_edited_utc_offset_min is distinct from 540 then
    raise exception 'FAIL: after moving the logging time: logged offset %, reworded offset % (expected null and 540; rolled back)',
      r.created_utc_offset_min, r.title_edited_utc_offset_min;
  end if;

  -- New words with their own date take their null.
  update public.predictions
     set title = 'Verify 011 offsets, reworded', title_edited_at = '2026-11-18T09:00:00.000Z',
         title_edited_utc_offset_min = null
   where id = 'verify-011-offsets';
  select * into r from public.predictions where id = 'verify-011-offsets';
  if r.title_edited_utc_offset_min is not null
     or r.updated_at <> '2026-11-19T10:05:00.000Z'::timestamptz then
    raise exception 'FAIL: after new words: reworded offset %, updated_at % (expected null and 2026-11-19 10:05 UTC; rolled back)',
      r.title_edited_utc_offset_min, r.updated_at;
  end if;

  raise exception 'PASS: a null push kept both stored offsets and the rest landed; a known offset replaced one; a moved logging time and new words with their own date let the null through; updated_at untouched; rolled back';
end $$;
```

After 011, 010's T2 answers with this new message instead of its own; 010's T1, T3 and T4 are
unchanged. Then run 1d again: the numbers are the same as before the tests.

**The guest ceiling** can't be tested without 500,000 rows. This shows where the table stands
against it (read-only):

```sql
select (select reltuples::bigint from pg_class where oid = 'public.guest_analytics_events'::regclass)
         as estimated_rows,
       500000 as ceiling;
```

### 4. Enable pg_cron

Supabase dashboard → **Integrations → Cron**, and enable the `pg_cron` extension (Supabase's
[install page](https://supabase.com/docs/guides/cron/install), read 2026-11-19). The same page
gives a SQL route that does the same: `create extension pg_cron with schema pg_catalog;`, then
`grant usage on schema cron to postgres;` and
`grant all privileges on all tables in schema cron to postgres;`.

Then check it (read-only). Expect 1 row: `pg_cron`, its version, and `true`.

```sql
select e.extname, e.extversion, has_schema_privilege('cron', 'usage') as can_use_cron
  from pg_extension as e
 where e.extname = 'pg_cron';
```

Keep it enabled from now on. The same page warns that "Disabling the `pg_cron` extension will
permanently delete all Jobs", and without the job nothing deletes old usage counts.

### 5. Look first at 012 (read-only)

**5a. The most usage counts any one account holds.** Expect far under 100,000, the new cap.

```sql
select coalesce(max(n), 0) as most_events_one_account
  from (select count(*) as n from public.analytics_events group by user_id) as s;
```

**5b. What the first run would delete.** The same rule as the job, written out: rows received
before midnight UTC 13 months ago (on 2026-11-19, before `2025-10-19 00:00:00+00`). Expect
`would_delete` `0` on both rows: `oldest` is in 2026 on both, and nothing is deleted until 13
months after it. A number above 0 is a row whose `received_at` was set before 011 made it the
server's clock; tell the agent before applying 012 if you see one.

```sql
with c as (
  select ((date_trunc('day', now(), 'UTC') at time zone 'UTC') - interval '13 months')
         at time zone 'UTC' as cutoff
)
select 'analytics_events' as table_name, c.cutoff as deletes_received_before,
       count(a.id) filter (where a.received_at < c.cutoff) as would_delete,
       count(a.id) as rows_now, min(a.received_at) as oldest
  from c left join public.analytics_events as a on true
 group by c.cutoff
union all
select 'guest_analytics_events', c.cutoff,
       count(g.id) filter (where g.received_at < c.cutoff),
       count(g.id), min(g.received_at)
  from c left join public.guest_analytics_events as g on true
 group by c.cutoff;
```

**A backup?** 012 itself rewrites and deletes no row. The job it schedules deletes only rows
more than 13 months old, and 5b shows there are none yet.

### 6. Apply 012

Open `supabase/migrations/012_usage_counts_retention.sql`, paste the **whole file** into a new
query and run it. It runs as one transaction: all of it applies, or none of it.
**Expected:** "Success. No rows returned".

- `ERROR: P0001: Migration 012 needs migration 011 first…`: nothing was applied. Apply 011
  (steps 1–3), then 012.
- `ERROR: P0001: Migration 012 needs the pg_cron extension…`: nothing was applied. Do step 4,
  then run 012 again.
- `ERROR: P0001: Migration 012: pg_cron is enabled, but the role … cannot use the cron
  schema…`: nothing was applied. Run the two `grant` lines the message gives (step 4's SQL
  route), then 012 again.
- `ERROR: P0001: Migration 012 schedules a job that runs as the role applying it…`: nothing was
  applied. Run it from the SQL editor (role `postgres`); if it says this there, tell the agent.
- `ERROR: 55P03: canceling statement due to lock timeout`: nothing was applied. Run it again a
  minute later.

The job is live from here. Its first run is the next 09:17 UTC.

(As with 010 and 011, the CLI's migration history won't list 012 after the SQL editor; a later
`npx supabase db push --remote` runs it again, which is safe: it unschedules its job and
schedules it again. If that push stops at 012 with the message about the role, apply 012 from
the SQL editor instead.)

### 7. Check 012

**7a. The job.** Expect a row with `jobname` `purge-old-usage-counts`, `schedule`
`17 9 * * *`, `command` `call public.purge_old_usage_counts()`, `username` `postgres` and
`active` `true` (and any job you made yourself; there were none before).

```sql
select * from cron.job;
```

**7b. The rest of 012.** Expect 5 rows, every `ok` `true`. The third matters most: Postgres lets
a procedure commit between batches only when it has no `SET` clause and isn't `SECURITY
DEFINER`.

```sql
select 'trigger analytics_events_account_cap' as what,
       exists (select 1 from pg_trigger
                where tgrelid = 'public.analytics_events'::regclass
                  and tgname = 'analytics_events_account_cap' and tgenabled = 'O') as ok
union all
select 'index idx_analytics_events_received',
       to_regclass('public.idx_analytics_events_received') is not null
union all
select 'the purge can commit between batches',
       exists (select 1 from pg_proc
                where oid = 'public.purge_old_usage_counts()'::regprocedure
                  and prokind = 'p' and not prosecdef and proconfig is null)
union all
select 'the cap function belongs to the table owner',
       (select proowner from pg_proc where oid = 'public.analytics_events_account_cap()'::regprocedure)
         = (select relowner from pg_class where oid = 'public.analytics_events'::regclass)
union all
select 'anon and authenticated can run neither the purge nor the cutoff',
       not has_function_privilege('anon', 'public.purge_old_usage_counts()', 'execute')
       and not has_function_privilege('authenticated', 'public.purge_old_usage_counts()', 'execute')
       and not has_function_privilege('anon', 'public.usage_counts_cutoff(timestamptz)', 'execute')
       and not has_function_privilege('authenticated', 'public.usage_counts_cutoff(timestamptz)', 'execute');
```

If Supabase's Security Advisor lists `purge_old_usage_counts` under "Function Search Path
Mutable", that is expected: a procedure that commits can't carry a `SET search_path`, so it
names every table and function by schema instead, and only you (the owner) can run it.

**7c. Where 13 months ends.** Expect 4 columns, all `true`: the middle of a month; the day
after a leap February; a month too short for the day (it ends at the month's last day); and a
moment that is already the next day in Tokyo but not in UTC (the UTC day counts).

```sql
select public.usage_counts_cutoff('2026-11-19 12:00+00') = '2025-10-19 00:00+00' as mid_month,
       public.usage_counts_cutoff('2028-03-01 09:17+00') = '2027-02-01 00:00+00' as after_leap_february,
       public.usage_counts_cutoff('2027-12-31 23:59+00') = '2026-11-30 00:00+00' as short_month,
       public.usage_counts_cutoff('2027-01-01 03:00+09') = '2025-11-30 00:00+00' as utc_day;
```

**7d. What the first run will delete,** by the job's own rule. Expect the same numbers as 5b.
(After 09:17 UTC the first run is tomorrow's, with a cutoff a day later; rows received in that
one day, 13 months ago, are the only possible difference.)

```sql
with c as (select public.usage_counts_cutoff(now()) as cutoff)
select 'analytics_events' as table_name, c.cutoff as deletes_received_before,
       count(a.id) filter (where a.received_at < c.cutoff) as would_delete,
       count(a.id) as rows_now
  from c left join public.analytics_events as a on true
 group by c.cutoff
union all
select 'guest_analytics_events', c.cutoff,
       count(g.id) filter (where g.received_at < c.cutoff),
       count(g.id)
  from c left join public.guest_analytics_events as g on true
 group by c.cutoff;
```

**T13 (optional, up to a minute), the 100,000 cap.** As the phone of the oldest account (most
likely yours): 100 events go in under the cap; then, as you (not limited), the account is
filled to exactly 100,000; then, as the phone, one more is refused; then, as you, one more goes
in. Everything is then rolled back. Expected:
`ERROR: P0001: PASS: 100 events went in under the cap; at 100,000 one more was refused (PT429); your own insert past it wasn't limited; rolled back`.
It leaves about 100,000 dead rows that autovacuum clears by itself. If the editor times out
first, that says nothing about the cap; skip it. If your phone sends usage counts during the
test, the counts shift and it can fail: run it again.

```sql
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  had bigint;
  had_today bigint;
  under_cap text := 'not run';
  over_cap text := 'not refused';
  owner_past_cap boolean;
begin
  if uid is null then raise exception 'SKIP: no account to test with'; end if;
  select count(*) into had from public.analytics_events where user_id = uid;
  select count(*) into had_today from public.analytics_events
   where user_id = uid and received_at >= date_trunc('day', now(), 'UTC');
  if had > 99800 or had_today > 4800 then
    raise exception 'SKIP: the account holds % events, % of them today; the test needs fewer', had, had_today;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  -- The phone, under the cap: 100 events go in.
  set local role authenticated;
  begin
    insert into public.analytics_events (id, user_id, name, props, created_at)
    select 'verify-012-under-' || g, uid, 'warmup_started', '{}'::jsonb, now()
      from generate_series(1, 100) as g;
    under_cap := 'accepted';
  exception when sqlstate 'PT429' or sqlstate 'PT413' then under_cap := sqlerrm;
  end;

  -- You, not limited: the account filled to exactly 100,000 events.
  set local role none;
  insert into public.analytics_events (id, user_id, name, props, created_at)
  select 'verify-012-fill-' || g, uid, 'warmup_started', '{}'::jsonb, now()
    from generate_series(1, 100000 - had - 100) as g;

  -- The phone, at the cap: one more is refused.
  set local role authenticated;
  begin
    insert into public.analytics_events (id, user_id, name, props, created_at)
    values ('verify-012-over', uid, 'warmup_started', '{}'::jsonb, now());
  exception when sqlstate 'PT429' then over_cap := sqlerrm;
  end;

  -- You again: past the cap, not limited.
  set local role none;
  insert into public.analytics_events (id, user_id, name, props, created_at)
  values ('verify-012-owner', uid, 'warmup_started', '{}'::jsonb, now());
  owner_past_cap := (select count(*) from public.analytics_events where user_id = uid) = 100001;

  if under_cap = 'accepted'
     and over_cap = 'analytics_events: an account holds at most 100000 events'
     and owner_past_cap then
    raise exception 'PASS: 100 events went in under the cap; at 100,000 one more was refused (PT429); your own insert past it wasn''t limited; rolled back';
  end if;
  raise exception 'FAIL: under the cap: %; at the cap: %; your insert past it counted: % (rolled back)',
    under_cap, over_cap, owner_past_cap;
end $$;
```

Then 5a again: the number is the same as before the test.

**7e. The day after: the first run.** Expect one row per 09:17 UTC since you applied 012, each
with `status` `succeeded`. Until you have seen one, the 13 months isn't confirmed. A `failed`
row's `return_message` says why: tell the agent. A run that fails part-way keeps the batches it
had already committed and rolls back only the one in progress; the next night carries on.

```sql
select status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'purge-old-usage-counts')
 order by start_time desc
 limit 5;
```

### 8. Redeploy delete-account and revenuecat-webhook

From this branch's final commit:

```sh
npx supabase functions deploy delete-account
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

What changed: both import `npm:@supabase/supabase-js@2.106.2` (the version the app has
installed) instead of whatever 2.x was newest at deploy time, as `coach` already does; and
`delete-account` checks `Content-Length` before reading the body and stops reading past 4,000
bytes (it used to read the whole body, then check). `jose` stays `npm:jose@5`: no lock file in
the repo records the 5.x it resolves to, so it couldn't be pinned without guessing.

Check as on 2026-11-18: `npx supabase functions list` shows each one version higher, updated
today; RevenueCat → Project settings → Integrations → Webhooks → **Send test event** gives 200
with `{"ok":true,"action":"ignored",…}`; and
`curl -i -X POST https://<project-ref>.functions.supabase.co/delete-account` with no token gives
401. Steps 8 and 9 don't depend on 011 or 012; the checklist puts them after the migrations so
that one list does everything. To undo either deploy, deploy it again from `master`.

### 9. Redeploy coach

From the same final commit as step 8, with JWT verification on (no flag):

```sh
npx supabase functions deploy coach
```

**Never deploy `coach` from commit `6830354`** (round 4 of the review). That version rejects
the app's new pattern kinds, so the Coach would show "unavailable" to the most engaged users.
The live version 16 (deployed 2026-11-18) and this branch's final version both work with the
new app: if anything about the commit is in doubt, leaving version 16 live is safe, and
deploying from `6830354` is not. The deploy also gives `coach` the current
`_shared/revenuecatLookup.ts` (the 2026-11-18 section's step 3 says why that waited).

Check: `npx supabase functions list` shows `coach` one version higher than before (16 on
2026-11-18), updated today; `curl -i -X POST https://<project-ref>.functions.supabase.co/coach`
with no token gives 401; and in the app, signed in with Plus and with at least one scored
answer, Insights → Get feedback answers instead of saying it's unavailable.

To undo it, deploy `coach` again from `master`: that is step 189's code, which version 16 was
deployed from (`HANDOFF.md`; only comments changed on `master` since), and `6830354` is not on
`master`.

### 10. Then turn the offsets on in the app

Tell the agent "011 is live" once step 3's checks pass (3a's two rows are enough). The agent
then turns on `UTC_OFFSET_SYNC` in `src/constants/app.ts`, in a later build, and makes sure
that build sends only `created_utc_offset_min` and `title_edited_utc_offset_min`: 011 has no
`resolved_utc_offset_min` (the answer's offset isn't kept), and an upsert naming a column the
server doesn't have fails the whole batch. **Not before:** a phone that names those columns
while the server doesn't have them fails every sync. And once a build with it on is installed
anywhere, the columns must stay (step 12).

### 11. Sandbox Plus rows, after App Store approval (separate, later)

Your decision of 2026-11-19: TestFlight testers keep sandbox Plus through the beta. After App
Store approval you set RevenueCat → Project settings → **Sandbox Testing Access** to "Allowed
App User IDs only". RevenueCat's page on that setting says it then removes the entitlements
earlier sandbox purchases granted to anyone not on the list. It says nothing about webhooks,
so `public.entitlements` (which only the Coach's server-side Plus check reads; the app itself
asks RevenueCat) keeps whatever the webhook last wrote. A sandbox subscription's row lapses on
its own (its `expires_at` passes, and a row past its expiry reads as not Plus). A sandbox
**Lifetime** row (`is_plus` and no `expires_at`) never does. These steps clear those.

**Before switching, check one thing:** RevenueCat's page doesn't mention App Review. Apple's
reviewers buy in the sandbox, for every update too, and by the setting's own wording a
reviewer who isn't on the list gets no entitlement from that purchase. **Before you switch
Sandbox Testing Access, get RevenueCat's confirmation in writing that App Review purchases
still grant entitlements under "Allowed App User IDs only"** (their page doesn't say so). If
they don't confirm it, don't switch, and clear leftover TestFlight Lifetime rows only with the
explicit-list statement in 11a–11c.

**11a. List them (read-only).** One row per account the server counts as Plus for ever.

```sql
select user_id, source, updated_at, last_event_ms
  from public.entitlements
 where is_plus and expires_at is null
 order by updated_at;
```

**11b. Check each against RevenueCat first.** The table can't tell a sandbox purchase from a
real one. For every `user_id`, open RevenueCat → Customers, search that id (the App User ID is
the Supabase user id) and look at its purchases. **Keep every real Lifetime buyer off the
list**: a production Lifetime purchase is someone who paid $79.99. Only an id whose plus
entitlement came from sandbox purchases alone goes on the list. If RevenueCat still shows plus
as active for an id, leave it off: the Coach asks RevenueCat when its row doesn't say Plus,
and would write Plus back the next time that person asks it.

**11c. Clear them.** Paste the ids you checked between the brackets, each in single quotes,
separated by commas. It touches only those ids, and only while they are still Lifetime Plus;
it never takes "all rows". The cursor moves to now, so a retry of an old sandbox event can't
write Plus back, and anything RevenueCat sends from now on still applies. It returns one row
per id it changed: check that list against what you pasted.

```sql
update public.entitlements as e
   set is_plus = false,
       source = 'none',
       expires_at = null,
       updated_at = now(),
       last_event_ms = greatest(coalesce(e.last_event_ms, 0),
                                (extract(epoch from now()) * 1000)::bigint)
 where e.user_id = any (array[
         'PASTE-USER-ID-HERE'
       ]::uuid[])
   and e.is_plus
   and e.expires_at is null
returning e.user_id, e.is_plus, e.source, e.last_event_ms;
```

With the placeholder left in, it stops with `invalid input syntax for type uuid` and changes
nothing. To put one back (a mistake): RevenueCat is the source of truth, so a real buyer's
next Coach request writes their row again from RevenueCat; or set it directly with
`update public.entitlements set is_plus = true, source = 'lifetime' where user_id = '…';`.

### 12. Undo 011, if something goes wrong

If 012 is in and both are coming off, undo 012 first (step 13): its job deletes by
`received_at`, which only 011 keeps to the server's clock. The triggers, functions, byte limits
and index of 011 come off with this, in one run:

```sql
drop trigger if exists predictions_keep_answer on public.predictions;
drop trigger if exists predictions_keep_offsets on public.predictions;
drop trigger if exists predictions_insert_limits on public.predictions;
drop trigger if exists predictions_update_limits on public.predictions;
drop trigger if exists analytics_events_stamp_received on public.analytics_events;
drop trigger if exists analytics_events_limits on public.analytics_events;
drop trigger if exists guest_analytics_events_count_rows on public.guest_analytics_events;
drop trigger if exists guest_analytics_events_reset_count on public.guest_analytics_events;
drop function if exists public.predictions_keep_answer();
drop function if exists public.predictions_keep_offsets();
drop function if exists public.predictions_write_limits();
drop function if exists public.analytics_events_stamp_received();
drop function if exists public.analytics_events_limits();
drop function if exists public.guest_analytics_events_count_rows();
drop function if exists public.guest_analytics_events_reset_count();
alter table public.predictions
  drop constraint if exists predictions_title_bytes,
  drop constraint if exists predictions_reflection_bytes;
drop index if exists public.idx_analytics_events_user_received;
```

- **The two columns stay** (with their range checks): they're empty until the app sends
  them, and once a build with `UTC_OFFSET_SYNC` on is installed, dropping them fails every
  sync from it. Only if no build ever had it on:
  `alter table public.predictions drop column if exists created_utc_offset_min, drop column if exists title_edited_utc_offset_min;`
  (their checks go with them).
- **`predictions_keep_offsets` can stay with the columns**: it only stops a push that sends an
  offset as null from erasing one stored for the same moment. To keep it, leave out its
  `drop trigger` and `drop function` lines above.
- **The props rule** can stay: it refuses only numbers longer than 24 characters, which the
  app never sends. To put 010's back, run 010's first `create or replace function` again (lines
  67–121 of `010_public_key_limits.sql`); the CHECKs need nothing, since 010's rule takes
  everything 011's does.

To change one answer by hand on purpose (the trigger keeps it otherwise), in one run:
`begin; alter table public.predictions disable trigger predictions_keep_answer; update …; alter table public.predictions enable trigger predictions_keep_answer; commit;`.
To clear a stored offset by hand (an update that sets one to null for the same moment keeps
the stored value otherwise), the same with `predictions_keep_offsets`; setting one to a number
needs no such step.

### 13. Undo 012, if something goes wrong

The job, the cap, the procedure, the cutoff function and the index come off with this, in one
run. The job goes first, so no run can call a procedure that is gone:

```sql
select cron.unschedule(jobid) from cron.job where jobname = 'purge-old-usage-counts';
drop trigger if exists analytics_events_account_cap on public.analytics_events;
drop function if exists public.analytics_events_account_cap();
drop procedure if exists public.purge_old_usage_counts();
drop function if exists public.usage_counts_cutoff(timestamptz);
drop index if exists public.idx_analytics_events_received;
```

- If pg_cron has been disabled since, leave out the first line: disabling it deleted the job
  (and `cron.job` no longer exists, so the line would stop the run).
- Rows the job already deleted don't come back; each was more than 13 months old, which is
  what the job is for.
- To take off only the cap, run the second and third lines.
- To pause the job instead of removing it (Supabase's quickstart):
  `select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'purge-old-usage-counts'), active := false);`,
  and `active := true` to resume. While it's paused or gone, nothing deletes old usage counts,
  so "kept for 13 months" isn't true; a resumed job catches up in its batches.
- pg_cron itself can stay enabled.

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
  are in "2026-11-18: migration 010 and two redeploys" above.
- `migrations/011_offsets_answers_limits.sql` — security review rounds 5 and 6
  (2026-11-19), applied after 010: two `*_utc_offset_min` columns on
  `predictions`, the offsets when a prediction was logged and reworded (the app
  sends them once `UTC_OFFSET_SYNC` is on), with a trigger that keeps a stored
  offset when a push sends it as null for the same moment; a trigger
  that keeps an answered prediction whole when a stale phone pushes it back as
  open (or a Yes or No as "Can't tell"), with a later `updated_at`; per-account
  limits on signed-in writes (100 rows a request, 50,000 predictions, 25 MB of
  titles and notes, 5,000 events a UTC day, byte limits on title and
  reflection); a guest insert that
  stops at row 101 and a 500,000-row guest ceiling; numbers in `props` at most
  24 characters. **Not applied yet**: the steps are in "2026-11-19: migrations
  011 and 012, three redeploys, and the sandbox Plus rows" above.
- `migrations/012_usage_counts_retention.sql` — security review round 6
  (2026-11-19), applied after 011 and once `pg_cron` is enabled: a daily
  `pg_cron` job (09:17 UTC) that deletes usage counts (`analytics_events`,
  `guest_analytics_events`) once they are more than 13 months old by
  `received_at`, in committed batches; at most 100,000 `analytics_events` rows
  per account. **Not applied yet**: same section.
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
  Jest-tested (`deletionPlan.test.ts`); the capped body reader in `readBody.ts`
  (`readBody.test.ts`, 2026-11-19), a copy of the Coach's.
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
redeploy. Since then, for step 189 (2026-11-18, `HANDOFF.md`): `coach` version 16 and
`revenuecat-webhook` version 13 were deployed; the 2026-11-19 section's steps 8 and 9 redeploy
all three. `refine` is deliberately not deployed. The free-tier
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

Since 2026-11-19 (round 5): the body is read through `readBody.ts`, which refuses a
`Content-Length` over 4,000 bytes before reading and stops reading past 4,000 bytes (400
either way, as for any malformed body), and `supabase-js` is pinned to 2.106.2 here and in
`revenuecat-webhook`. `jose` is still `npm:jose@5`: no lock file records the version it
resolves to.

Smoke-tested locally under Deno 2 on 2026-09-25 against the live project's
auth: 401 without a header, 401 for a bogus token, 405 for GET.

## Notes for future schema changes

- The CHECK constraints in `001_predictions.sql` (the category check now in
  `006_custom_categories.sql`) mirror the union types in `src/types/index.ts`
  AND the SQLite CHECKs in `src/db/migrations/`. All three move together.
- Stats tables (`user_stats`, `category_stats`) intentionally do NOT live here
  — those are derived from predictions and rebuilt locally via
  `recomputeForUser` after every pull (`src/supabase/sync.ts`).
