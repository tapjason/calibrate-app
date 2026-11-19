-- Usage counts kept for 13 months, and a cap on one account's usage counts
-- (security review, round 6, 2026-11-19). Apply AFTER 011, and only once the
-- pg_cron extension is enabled (Supabase dashboard -> Integrations -> Cron):
-- the first block refuses to run otherwise, and nothing is applied.
--
--   1. At most 100,000 rows of analytics_events per account (server
--      re-review LOW-H): 011's day cap of 5,000 rows alone let one account
--      add about 2.75 MB a day for ever.
--   2. Rows of analytics_events and guest_analytics_events are deleted once
--      they are more than 13 months old by received_at (the owner's decision
--      of 2026-11-19, D69). received_at is the server's clock on both: 011
--      stamps it on every signed-in row, and 010 cuts a guest row's to its UTC
--      day. A pg_cron job calls a procedure every day at 09:17 UTC that
--      deletes in batches of 5,000 rows, each committed on its own.
--
-- Nothing in the app changes: the job runs on the server alone, by the
-- server's time of receipt, and the cap answers with a code the app already
-- treats as "try later" (section 1).
--
-- Supabase's documentation, read 2026-11-19:
--   - https://supabase.com/docs/guides/cron/install: enabled from the
--     dashboard (Integrations -> Cron), or with
--     `create extension pg_cron with schema pg_catalog;` and the grants on
--     schema cron to postgres. "Disabling the pg_cron extension will
--     permanently delete all Jobs."
--   - https://supabase.com/docs/guides/cron/quickstart:
--     cron.schedule(job_name, schedule, command), in GMT; a second job of
--     the same name "will overwrite the first Job"; cron.unschedule; a job
--     may `CALL` a procedure; cron.alter_job(job_id, ..., active).
--   - https://supabase.com/docs/guides/cron: jobs live in cron.job, each run
--     in cron.job_run_details; "Each Job should run no more than 10 minutes."
--   - https://supabase.com/docs/guides/database/postgres/timeouts: the
--     postgres role has no statement timeout of its own, "capped by default
--     global timeout to be 2min".
-- And pg_cron's own README (https://github.com/citusdata/pg_cron): a job
-- runs in the database where it was scheduled, with the rights of the role
-- that scheduled it, one run of a job at a time.
--
-- Safe on a live database: one index is built (on a small table, holding
-- inserts for a moment), one trigger, two functions and one procedure are
-- made, and the job is scheduled. No row is rewritten, and no CHECK is added.
-- Idempotent: the index is made if missing, each function and the procedure
-- are replaced, the trigger is dropped if it exists before it is made, and a
-- job of the same name is unscheduled before the job is scheduled. The SQL
-- editor and `supabase db push` both run the file as one transaction: all of
-- it applies, or none. A later run of 010 or 011 leaves everything here in
-- place.

-- As in 011: a lock that can't be had within 10 s rolls the whole migration
-- back instead of queueing app requests behind it. Run it again a moment
-- later.
set local lock_timeout = '10s';

-- Each refusal names what is missing. Raised before anything is made, and the
-- file is one transaction, so a refusal applies nothing.
do $$
begin
  if to_regprocedure('public.analytics_events_limits()') is null
     or to_regprocedure('public.analytics_events_stamp_received()') is null then
    raise exception 'Migration 012 needs migration 011 first: apply 011_offsets_answers_limits.sql, then run this file again. Nothing was applied.';
  end if;

  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'Migration 012 needs the pg_cron extension, which is not enabled. In the Supabase dashboard, open Integrations -> Cron and enable pg_cron, then run this file again. Nothing was applied.';
  end if;

  -- Two checks, not one OR: has_schema_privilege raises on a schema that
  -- doesn't exist, and SQL doesn't promise to evaluate an OR left to right.
  if pg_catalog.to_regnamespace('cron') is null then
    raise exception 'Migration 012: pg_cron is listed as enabled, but there is no cron schema. Disable and enable pg_cron again (Integrations -> Cron), then run this file again. Nothing was applied.';
  end if;
  if not pg_catalog.has_schema_privilege('cron', 'USAGE') then
    raise exception 'Migration 012: pg_cron is enabled, but the role % cannot use the cron schema. Supabase''s pg_cron install page gives the grants: grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres; Then run this file again. Nothing was applied.',
      current_user;
  end if;

  -- The job runs as the role that schedules it, and it deletes from both
  -- tables. The owner of the tables (postgres, 010's check 2e) has every
  -- right on them for as long as they exist; a temporary role would not.
  if exists (select 1
               from pg_catalog.pg_class as c
              where c.oid in ('public.analytics_events'::regclass,
                              'public.guest_analytics_events'::regclass)
                and pg_catalog.pg_get_userbyid(c.relowner) <> current_user) then
    raise exception 'Migration 012 schedules a job that runs as the role applying it (%), which must own public.analytics_events and public.guest_analytics_events. Run this file from the Supabase SQL editor, where the role is postgres. Nothing was applied.',
      current_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. At most 100,000 usage counts per account
-- ---------------------------------------------------------------------------

-- After each insert statement on analytics_events: at most 100,000 rows per
-- account, this statement's included. Counted on an index whose first column
-- is user_id (idx_analytics_events_user_received, 011, or
-- idx_analytics_events_user_time, 005; the planner picks), and only up to
-- 100,001, so a count never reads more than that: a scan of the account's
-- own index entries, about a millisecond or less for a real account of a few
-- thousand rows (an estimate from Postgres's costs, not measured here).
--
-- Why 100,000. A real account's busiest day is about 300 events (011's count
-- for the day cap), and most days are far fewer: tens of events, a few
-- thousand a year. With section 2 deleting rows once they are 13 months old,
-- the cap is reached only by keeping up about 250 events a day for 13 months,
-- every day. The worst one account now costs: 100,000 rows of at most about
-- 0.6 KB with their five indexes (011's 0.55 KB with four, plus section 2's
-- index on received_at, about 30 bytes a row), about 60 MB, instead of
-- 2.75 MB a day without end. Many accounts can each spend it; sign-up is what
-- bounds that (as 011 says of predictions).
--
-- What a refusal means for the phone: PT429, which src/analytics/flush.ts
-- treats as 'stop' (outcomeOf), as for 011's day cap: the sweep ends and the
-- rows stay queued, at most 2,000 of them, oldest dropped first. Unlike the
-- day cap it doesn't lift at midnight UTC, only as section 2's job deletes
-- the account's oldest rows. Nothing the person sees depends on it.
--
-- Fires before 011's analytics_events_limits (AFTER triggers of the same kind
-- fire in name order: _account_cap sorts before _limits), so a refusal at the
-- cap carries its own message whatever the day's count, which the README's
-- test relies on. A statement 011 would refuse anyway (more than 100 rows,
-- or past the day's cap) pays one capped count first: at most 100,001 index
-- entries.
--
-- Concurrent inserts each count what is committed plus their own rows, so a
-- burst can pass the cap by at most one batch (100 rows) per open
-- connection.
--
-- The same exemption as 011: only the roles the public key reaches are
-- limited. The owner's statements in the SQL editor (no SET ROLE, so the
-- setting reads 'none') and the service role's are not.
--
-- SECURITY DEFINER, so the count sees every row of the account whatever RLS
-- says; owned by the role that runs this migration, which owns the table (the
-- block above checks it). No EXECUTE is revoked, as for 011's trigger
-- functions: a trigger function can't be called on its own.
create or replace function public.analytics_events_account_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows_per_account constant integer := 100000;
  account uuid;
  held bigint;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return null;
  end if;

  for account in select distinct n.user_id from new_rows as n loop
    select count(*) into held
      from (select 1
              from public.analytics_events as e
             where e.user_id = account
             limit max_rows_per_account + 1) as capped;
    if held > max_rows_per_account then
      raise exception using
        errcode = 'PT429',
        message = format('analytics_events: an account holds at most %s events', max_rows_per_account);
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.analytics_events_account_cap() is
  'AFTER INSERT (per statement) on analytics_events: at most 100,000 rows per '
  'account (PT429), for the public key''s roles only. Migration 012.';

drop trigger if exists analytics_events_account_cap on public.analytics_events;
create trigger analytics_events_account_cap
  after insert on public.analytics_events
  referencing new table as new_rows
  for each statement execute function public.analytics_events_account_cap();

-- ---------------------------------------------------------------------------
-- 2. Usage counts are kept for 13 months
-- ---------------------------------------------------------------------------

-- 2a. The index the job reads ---------------------------------------------------

-- The job finds the oldest rows by received_at. No index of analytics_events
-- starts with it (011's starts with user_id), so without this one each batch
-- would read the whole table. About 30 bytes a row. Building it holds inserts
-- for a moment, inside this transaction, as 011's index did; the table is
-- small (the beta). guest_analytics_events already has one
-- (idx_guest_analytics_events_received_day, 010).
create index if not exists idx_analytics_events_received
  on public.analytics_events (received_at);

-- 2b. Where 13 months ends ------------------------------------------------------

-- The first moment that is kept, for a run at p_at: midnight UTC on p_at's
-- UTC day, less 13 calendar months. Rows received before it are deleted.
-- Worked out on the UTC calendar whatever the session's TimeZone (a
-- timestamptz less a month is reckoned in the session's zone, a timestamp
-- less a month is not). A month too short for the day ends at its last day:
-- 2027-12-31 less 13 months is 2026-11-30, and 2028-03-01 less 13 months is
-- 2027-02-01.
--
-- So a row is kept at least 13 months, and at most about a day and a half
-- more (longer only if a night's run is missed or stops early). A signed-in
-- row received at instant t goes in the first run on a day whose midnight,
-- less 13 months, is past t, which is after t plus 13 months (a month cut
-- short at its end only moves the cutoff earlier, never later). A guest row's
-- received_at is the midnight that began the UTC day it arrived (010), so it
-- goes the same night as a signed-in row from that day, also at least 13
-- months after it arrived.
--
-- A function so the job and the README's checks use the same rule. STABLE:
-- it reads no table, and nothing needs it IMMUTABLE (no index or CHECK uses
-- it).
create or replace function public.usage_counts_cutoff(p_at timestamptz)
returns timestamptz
language sql
stable
parallel safe
set search_path = ''
as $$
  select ((pg_catalog.date_trunc('day', p_at, 'UTC') at time zone 'UTC')
          - interval '13 months') at time zone 'UTC'
$$;

comment on function public.usage_counts_cutoff(timestamptz) is
  'Midnight UTC of the given moment''s UTC day, less 13 months: usage counts '
  'received before it are deleted by purge_old_usage_counts. Migration 012.';

-- 2c. The purge -----------------------------------------------------------------

-- Deletes the rows received before usage_counts_cutoff(now()) from both
-- tables, oldest first, 5,000 rows per batch, each batch committed on its
-- own: a batch holds its rows' locks for a moment, never the whole run. A
-- DELETE takes only ROW EXCLUSIVE on the table, which doesn't block reads or
-- the app's inserts; the rows' own locks matter only to something touching
-- the same old rows, such as delete-account's cascade for that account,
-- which then waits for one batch at most. The app never updates a usage
-- count (010 grants no UPDATE), so nothing else waits.
--
-- Bounded twice per table, so a large first run (after the project was
-- paused, say) is spread over days: at most 200 batches (1,000,000 rows),
-- and no new batch once 25 seconds have passed on that table. The whole run
-- is then about 50 seconds at most, plus one batch per table, under the
-- 2 minutes Supabase allows a statement as postgres (the job's CALL is one
-- statement) and under its 10 minutes per job. What is left goes the next
-- day. If a run is ever stopped part-way (a timeout, a restart), the batches
-- already committed stay deleted, only the batch in progress rolls back, and
-- the next run carries on. To change the sizes, edit the constants and run
-- this `create or replace procedure` again.
--
-- A procedure, called with CALL, because only a procedure can COMMIT between
-- batches. Postgres refuses COMMIT in a procedure that is SECURITY DEFINER or
-- has a SET clause (CREATE PROCEDURE, "Notes"), so this one has neither: it
-- runs with the rights of its caller, the job's role, which owns both tables
-- (the first block checks it), and every table and function in it is
-- schema-qualified instead of relying on a search_path. Its operators are
-- the built-in ones from pg_catalog, which Postgres searches first unless a
-- search_path names it later, and only the owner may call it (section 3), so
-- no other role's search_path ever applies. The job's command is a single
-- CALL, which pg_cron sends as a statement of its own, where a procedure may
-- commit.
create or replace procedure public.purge_old_usage_counts()
language plpgsql
as $$
declare
  batch_size  constant integer  := 5000;
  max_batches constant integer  := 200;
  time_budget constant interval := interval '25 seconds';
  -- Worked out once, before the first commit: each commit starts a new
  -- transaction, and now() with it.
  cutoff   timestamptz := public.usage_counts_cutoff(pg_catalog.now());
  deadline timestamptz;
  batches  integer;
  deleted  bigint;
begin
  -- Signed-in usage counts.
  batches := 0;
  deadline := pg_catalog.clock_timestamp() + time_budget;
  loop
    delete from public.analytics_events
     where id in (select e.id
                    from public.analytics_events as e
                   where e.received_at < cutoff
                   order by e.received_at
                   limit batch_size);
    get diagnostics deleted = row_count;
    commit;
    batches := batches + 1;
    exit when deleted < batch_size
           or batches >= max_batches
           or pg_catalog.clock_timestamp() >= deadline;
  end loop;

  -- Guests' usage counts.
  batches := 0;
  deadline := pg_catalog.clock_timestamp() + time_budget;
  loop
    delete from public.guest_analytics_events
     where id in (select g.id
                    from public.guest_analytics_events as g
                   where g.received_at < cutoff
                   order by g.received_at
                   limit batch_size);
    get diagnostics deleted = row_count;
    commit;
    batches := batches + 1;
    exit when deleted < batch_size
           or batches >= max_batches
           or pg_catalog.clock_timestamp() >= deadline;
  end loop;
end;
$$;

comment on procedure public.purge_old_usage_counts() is
  'Deletes analytics_events and guest_analytics_events rows received before '
  'usage_counts_cutoff(now()), in committed batches of 5,000, at most 200 '
  'batches or 25 seconds per table. Called daily by the pg_cron job '
  'purge-old-usage-counts. Migration 012.';

-- ---------------------------------------------------------------------------
-- 3. Who may run them
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE on a new function or procedure to PUBLIC, and
-- Supabase's default privileges grant it to anon, authenticated and
-- service_role as well. Only the owner, which runs the job, needs either.
-- Neither could do harm through the API (the cutoff only computes a date;
-- the procedure would delete as its caller, and anon and authenticated have
-- no DELETE on these tables since 010), but neither is the API's to call.
revoke all on function public.usage_counts_cutoff(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on procedure public.purge_old_usage_counts()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The daily job
-- ---------------------------------------------------------------------------

-- Every day at 09:17 UTC (pg_cron's schedules are in GMT unless
-- cron.timezone says otherwise): about 1 am in California, 4 am in New York,
-- 9 am in London. Away from midnight UTC, when 010's and 011's day budgets
-- start again and queued phones send. Off the hour, so it doesn't start with
-- every other job on the hour.
--
-- Idempotent: a job of the same name is unscheduled first (cron.schedule
-- would also replace it, by Supabase's quickstart). cron.job
-- shows a role only its own jobs, so this finds the one this role scheduled
-- on an earlier run. The job runs as the role applying this file (the first
-- block made sure it owns both tables), in this database.
do $$
declare
  job record;
begin
  for job in
    select j.jobid from cron.job as j where j.jobname = 'purge-old-usage-counts'
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  perform cron.schedule(
    'purge-old-usage-counts',
    '17 9 * * *',
    'call public.purge_old_usage_counts()'
  );
end;
$$;
