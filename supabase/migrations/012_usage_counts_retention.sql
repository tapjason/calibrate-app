-- Usage counts kept for 13 months, a cap on one account's usage counts, and a
-- storage ceiling for the whole database (security review, round 6 and the
-- final server re-review, 2026-11-19). Apply AFTER 011, and only once the
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
--      deletes in batches of 5,000 rows, each committed on its own. It also
--      trims this file's two jobs' run history to 30 days.
--   3. A storage ceiling for the whole database (final server re-review A-1:
--      about 60 accounts, each at 011's caps, could take the free plan's
--      disk to read-only for everyone). A one-row flag, public.storage_ceiling,
--      is set every 5 minutes by a second pg_cron job from the database's
--      size against 400 MB, under the free plan's 500 MB database size quota
--      and far under the disk's read-only point. While it is set, statements
--      from the public key's roles that add rows or text are refused
--      (PT429): new predictions, a longer title or note, usage counts.
--      Answers, category moves and deletions still go through.
--
-- Nothing in the app changes: the jobs run on the server alone, and the cap
-- and the ceiling answer with a code the app already treats as "try later"
-- (sections 1 and 3).
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
--   - https://supabase.com/docs/guides/platform/database-size: "Free Plan
--     projects have a fixed disk size of 2 GB. The disk does not autoscale";
--     "When disk usage reaches 95%, Supabase puts your database into
--     read-only mode"; disk usage is the database plus WAL plus a small
--     "System" share, and "On a 2 GB disk, WAL can fill the disk even when
--     your database size is small". The 500 MB database size quota "does not
--     trigger" read-only mode: it "is a billing quota for your organization".
--   - https://supabase.com/docs/guides/platform/manage-your-usage/database-size:
--     past that quota the organization can be put under a Fair Use
--     restriction, where requests are answered with HTTP 402; the quota is
--     judged on the average daily database size over the billing period,
--     summed over the organization's projects (paraphrased).
-- And pg_cron's own README (https://github.com/citusdata/pg_cron): a job
-- runs in the database where it was scheduled, with the rights of the role
-- that scheduled it, one run of a job at a time; "The records in the table
-- are not cleaned automatically" (cron.job_run_details), and each role that
-- schedules jobs may delete its own.
-- And Postgres 15's trigger pages (sql-createtrigger, trigger-definition,
-- sql-insert): an INSERT ... ON CONFLICT DO UPDATE fires statement-level
-- BEFORE INSERT and BEFORE UPDATE triggers whatever rows it touches, and
-- row-level BEFORE INSERT triggers for rows that then meet their conflict;
-- "an INSERT trigger will see only the inserted rows, while an UPDATE
-- trigger will see only the updated rows" in its transition tables.
--
-- Safe on a live database: one index is built (on a small table, holding
-- inserts for a moment), one small table is made, five triggers (on all
-- three tables), five functions and one procedure are made, and two jobs are
-- scheduled. No existing row is rewritten, and no CHECK is added to an
-- existing table. Idempotent: the table and the index are made if missing,
-- each function and the procedure are replaced, each trigger is dropped if
-- it exists before it is made, the grants are revoked again, and a job of
-- the same name is unscheduled before each job is scheduled. The SQL editor
-- and `supabase db push` both run the file as one transaction: all of it
-- applies, or none. A later run of 010 or 011 leaves everything here in
-- place.

-- As in 011: a lock that can't be had within 10 s rolls the whole migration
-- back instead of queueing app requests behind it. Run it again a moment
-- later.
set local lock_timeout = '10s';

-- Each refusal names what is missing. Raised before anything is made, and the
-- file is one transaction, so a refusal applies nothing.
do $$
begin
  -- 011 as it was finally written: its row counters (K) included.
  if to_regprocedure('public.analytics_events_limits()') is null
     or to_regprocedure('public.analytics_events_stamp_received()') is null
     or to_regprocedure('public.analytics_events_count_rows()') is null
     or to_regprocedure('public.predictions_count_rows()') is null then
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

  -- The jobs run as the role that schedules them: the purge deletes from both
  -- usage tables, and the ceiling's job writes public.storage_ceiling, which
  -- this file makes, so that role owns it. The owner of the usage tables
  -- (postgres, 010's check 2e) has every right on them for as long as they
  -- exist; a temporary role would not.
  if exists (select 1
               from pg_catalog.pg_class as c
              where c.oid in ('public.analytics_events'::regclass,
                              'public.guest_analytics_events'::regclass)
                and pg_catalog.pg_get_userbyid(c.relowner) <> current_user) then
    raise exception 'Migration 012 schedules jobs that run as the role applying it (%), which must own public.analytics_events and public.guest_analytics_events. Run this file from the Supabase SQL editor, where the role is postgres. Nothing was applied.',
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
-- bounds that (as 011 says of predictions), and section 3's ceiling is what
-- bounds the whole database.
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
-- test relies on. A statement of more than 100 rows never gets here: 011's
-- analytics_events_count_rows stops it at row 101, before that row is
-- written and before any AFTER trigger. One past the day's cap pays one
-- capped count first: at most 100,001 index entries.
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
-- count (010 grants no UPDATE), so nothing else waits. No trigger fires on
-- these deletes (none of this file's or 010's or 011's is ON DELETE).
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
-- Last, this file's two jobs' run history (cron.job_run_details) older than
-- 30 days, which pg_cron never deletes by itself: the ceiling's job (section
-- 3) adds 288 rows a day, roughly 18 MB a year left alone (an estimate of
-- about 170 bytes a row with its index). Matched by the
-- jobs' commands, so the rows of an earlier run of this file's jobs (which a
-- re-run unschedules and schedules again under new ids) go too, and no other
-- job's rows are touched. 30 days keeps more than the README's checks read.
-- In its own block, so nothing there can fail the run: the purge above has
-- committed by then, and an error there (pg_cron changed, say) is passed
-- over with a WARNING in the database log. That block holds no COMMIT
-- (Postgres refuses COMMIT inside a block with an exception handler).
--
-- A procedure, called with CALL, because only a procedure can COMMIT between
-- batches. Postgres refuses COMMIT in a procedure that is SECURITY DEFINER or
-- has a SET clause (CREATE PROCEDURE, "Notes"), so this one has neither: it
-- runs with the rights of its caller, the job's role, which owns both tables
-- (the first block checks it), and every table and function in it is
-- schema-qualified instead of relying on a search_path. Its operators are
-- the built-in ones from pg_catalog, which Postgres searches first unless a
-- search_path names it later, and only the owner may call it (section 4), so
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
  history_kept constant interval := interval '30 days';
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

  -- This file's jobs' run history, kept 30 days (above).
  begin
    delete from cron.job_run_details as d
     where d.end_time < pg_catalog.clock_timestamp() - history_kept
       and d.command in ('call public.purge_old_usage_counts()',
                         'select public.refresh_storage_ceiling()');
  exception
    when others then
      raise warning 'purge_old_usage_counts: run history not trimmed (%): %', sqlstate, sqlerrm;
  end;
end;
$$;

comment on procedure public.purge_old_usage_counts() is
  'Deletes analytics_events and guest_analytics_events rows received before '
  'usage_counts_cutoff(now()), in committed batches of 5,000, at most 200 '
  'batches or 25 seconds per table; then this migration''s two jobs'' run '
  'history older than 30 days. Called daily by the pg_cron job '
  'purge-old-usage-counts. Migration 012.';

-- ---------------------------------------------------------------------------
-- 3. A storage ceiling for the whole database
-- ---------------------------------------------------------------------------

-- 3a. The flag ------------------------------------------------------------------

-- One row (id is always true), read by the triggers in 3c and written only by
-- refresh_storage_ceiling (3b), which the job in section 5 runs every 5
-- minutes and this file runs once at its end. reached is the flag; the other
-- columns say what it was set from, for the README's checks. Row-level
-- security on, no policy, and no grant to anon, authenticated or
-- service_role (section 4): nothing reaches it through the API. The triggers
-- read it as its owner (SECURITY DEFINER), whom RLS doesn't hold.
create table if not exists public.storage_ceiling (
  id              boolean primary key default true,
  reached         boolean not null default false,
  database_bytes  bigint,
  threshold_bytes bigint,
  checked_at      timestamptz,
  constraint storage_ceiling_one_row check (id)
);

alter table public.storage_ceiling enable row level security;

comment on table public.storage_ceiling is
  'One row: reached is true while this database''s size is at or over the '
  'threshold, as of checked_at; signed-in and guest writes that add rows or '
  'text are refused then. Written by refresh_storage_ceiling() every 5 '
  'minutes (pg_cron job refresh-storage-ceiling). Migration 012.';

-- 3b. The refresh ---------------------------------------------------------------

-- Sets the flag from the database's size now: reached while
-- pg_database_size(current_database()) is at or over the threshold. Returns
-- the flag.
--
-- The threshold, 400 MB (400,000,000 bytes; the main session's decision of
-- 2026-11-19, the safe direction). It sits under both of the free plan's
-- limits (header):
--   - the 500 MB database size quota: a billing quota judged on the month's
--     average size, summed over the organization's projects, past which
--     Supabase can restrict the whole organization (every request answered
--     with HTTP 402). 400 MB leaves 100 MB (500 - 400) for the cluster's
--     other databases, which the quota counts and this size doesn't (the
--     README's step 5c shows them), and for what arrives between two checks.
--     Any other project in the same organization counts against the same
--     500 MB and comes out of that margin too.
--   - read-only at 95% of the fixed 2 GB disk, for every writer: at 1.9 GB
--     (2 GB x 0.95). Disk use is the databases plus WAL plus a small system
--     share, and on a 2 GB disk WAL alone can be large; 400 MB leaves 1.5 GB
--     (1.9 - 0.4) for it.
-- In decimal bytes, the smaller reading of "MB" and "GB": if Supabase means
-- binary units, each margin is larger (500 MiB is 524,288,000 bytes, a
-- margin of about 124 MB).
--
-- Why a ceiling at all: 011 and section 1 hold one account to about 32 MB of
-- predictions (25 MB of text, and row overhead at the 50,000-row cap) and
-- about 60 MB of usage counts (100,000 rows, at most 2.75 MB a day). About 60
-- accounts at their prediction caps (1.9 GB / 32 MB) could take the disk to
-- read-only, which stops every write for every user; WAL can still grow
-- after that, and a disk that fills completely stops Postgres until the plan
-- is upgraded. About 16 (500 MB / 32 MB), held there for long enough, could
-- push the month's average past the quota. Sign-up bounds how many accounts
-- one person holds; nothing else bounded their sum.
--
-- Real use is far below it: a heavy account adds a few MB a year (about a
-- thousand predictions with short titles and some notes, and a few thousand
-- usage counts, which section 2 deletes after 13 months; an estimate). When
-- real use nears 400 MB, the plan has to grow anyway (the database-size page:
-- the Pro Plan "gives an 8 GB autoscaling disk"): raise the threshold then,
-- to fit that plan's quota (below).
--
-- What the size counts: every file of this database (tables, TOAST, indexes,
-- and the room dead rows leave, which Postgres reuses but seldom gives
-- back), so a fill shows in it whether its rows are still there or deleted.
-- Not WAL, and not the cluster's other databases, which the app never
-- writes.
--
-- Once reached, the flag stays until the size is under the threshold at a
-- check: deleting rows makes room inside the files for new rows but seldom
-- shrinks them (VACUUM FULL does, holding the table while it runs), or until
-- the threshold is raised (after an upgrade, say). The next check then
-- clears it: within 5 minutes, or at once with
-- `select public.refresh_storage_ceiling();`. The README says what to do.
--
-- Between two checks the flag can trail the size by up to 5 minutes. The
-- 100 MB margin under the quota holds what about three accounts can add at
-- their prediction caps in that time (100 MB / 32 MB; usage counts add at
-- most 2.75 MB a day each, nothing in 5 minutes); a faster fill by more
-- accounts can pass the threshold before the next check, and is stopped at
-- that check. Passing 500 MB for a while isn't itself a restriction (the
-- quota is the month's average), so there is time to make room; reaching
-- read-only from here would take about 46 accounts filling to their caps
-- within the 5 minutes (1.5 GB / 32 MB). pg_database_size reads the size of
-- each of the database's files, a few milliseconds for a database this
-- small (an estimate, not measured here), so checking every 5 minutes costs
-- little.
--
-- If the job stops (pg_cron disabled, the job paused or failing), the flag
-- keeps its last value: set, writes that add stay refused; clear, the
-- ceiling does nothing. The README's weekly check looks at both jobs.
--
-- To change the threshold, edit it below, run this `create or replace
-- function` again, then `select public.refresh_storage_ceiling();`.
--
-- Invoker's rights: it runs as the job's role, which owns the table (it made
-- it, in this file); only the owner may run it (section 4).
-- pg_database_size needs CONNECT on the database, which every role has by
-- default (Postgres's docs, "Database Object Management Functions").
create or replace function public.refresh_storage_ceiling()
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  threshold constant bigint := 400000000; -- 400 MB
  size_now  bigint;
begin
  size_now := pg_catalog.pg_database_size(pg_catalog.current_database());

  insert into public.storage_ceiling
    (id, reached, database_bytes, threshold_bytes, checked_at)
  values
    (true, size_now >= threshold, size_now, threshold, pg_catalog.now())
  on conflict (id) do update
    set reached         = excluded.reached,
        database_bytes  = excluded.database_bytes,
        threshold_bytes = excluded.threshold_bytes,
        checked_at      = excluded.checked_at;

  return size_now >= threshold;
end;
$$;

comment on function public.refresh_storage_ceiling() is
  'Sets public.storage_ceiling.reached from pg_database_size(current_database()) '
  'against 400 MB (400,000,000 bytes); returns it. Run every 5 minutes by '
  'the pg_cron job refresh-storage-ceiling. Migration 012.';

-- 3c. Refusing at the ceiling ---------------------------------------------------

-- While the flag is set, a statement from the public key's roles that adds
-- rows or text is refused with PT429; one that adds neither goes through.
-- The same exemption as 011's limits and section 1: the owner's statements in
-- the SQL editor (no SET ROLE, so the setting reads 'none') and the service
-- role's are not refused, so the owner can still clean up and delete-account
-- still works (it deletes, which nothing here refuses anyway).
--
--   - analytics_events and guest_analytics_events: every insert adds rows,
--     so every insert is refused, by a BEFORE ... FOR EACH STATEMENT trigger:
--     before any row is counted, stamped, hashed or written. The app's flush
--     treats PT429 as 'stop' (src/analytics/flush.ts, outcomeOf): the sweep
--     ends and the rows stay queued, at most 2,000, oldest dropped first, as
--     for 011's caps.
--   - predictions: an insert is refused when it inserted a row, and an update
--     when it adds text (its rows' titles and notes after, less before, over
--     the statement, as 011's text budget reckons it). That needs the rows
--     each kind of trigger sees (transition tables), which only an AFTER
--     trigger has: the app's push is an upsert, which fires the BEFORE
--     INSERT statement trigger whatever it touches and the BEFORE INSERT row
--     trigger for rows that turn out to exist already (header), so a BEFORE
--     trigger would refuse every answer. So the
--     statement is done, then refused and rolled back; 011's counters hold it
--     to 100 rows first, and autovacuum makes the room its dead rows take
--     reusable. What goes through: an answer (its status and time), a
--     category move, a shorter note, 011's keep-answer and keep-offsets
--     corrections, and deletions (no trigger here fires on DELETE). An answer
--     that brings a new note adds text, and waits as a new prediction does.
--     The app's push tries a refused batch again one row at a time, so the
--     rows that add nothing still land; a row refused alone waits an hour on
--     the phone and is counted as unsynced (src/supabase/sync.ts, pushDirty).
--
-- If public.storage_ceiling is missing (dropped by hand), the triggers do
-- nothing rather than fail every write with "relation does not exist": the
-- ceiling is a safeguard, and sync isn't to stop because it is gone. A
-- missing row reads as not reached (the job's next run writes it again).
--
-- Fire order: statement-level BEFORE triggers fire before any row trigger,
-- so an insert at the ceiling stops before 011's counters and 010's hashing.
-- On predictions, predictions_insert_ceiling and predictions_update_ceiling
-- sort before 011's predictions_insert_limits and predictions_update_limits,
-- so a refusal at the ceiling carries its own message.
--
-- Kept out of 011's functions on purpose: replacing them here would leave
-- two copies to keep in step, and running 011 again after this file would
-- quietly take the ceiling away; 011 reading a table that only this file
-- makes would tie the earlier file to the later one. Here, the ceiling is
-- made, checked and undone in one file, and a re-run of 010 or 011 leaves it
-- in place.
--
-- SECURITY DEFINER, so the flag is read whatever the caller may see; owned by
-- the role that runs this file, which owns the table. No EXECUTE is revoked,
-- as for 011's trigger functions.
create or replace function public.storage_ceiling_refuse_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_ceiling boolean;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return null;
  end if;
  if pg_catalog.to_regclass('public.storage_ceiling') is null then
    return null;
  end if;

  select s.reached into at_ceiling from public.storage_ceiling as s where s.id;
  if coalesce(at_ceiling, false) then
    raise exception using
      errcode = 'PT429',
      message = format('%s: the database is at its storage ceiling; new rows wait until there is room',
                       tg_table_name);
  end if;

  return null;
end;
$$;

comment on function public.storage_ceiling_refuse_rows() is
  'BEFORE INSERT (per statement) on analytics_events and guest_analytics_events: '
  'refuses the insert (PT429) while public.storage_ceiling is reached, for the '
  'public key''s roles only. Migration 012.';

create or replace function public.predictions_storage_ceiling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_ceiling boolean;
  added bigint;
  removed bigint;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return null;
  end if;
  if pg_catalog.to_regclass('public.storage_ceiling') is null then
    return null;
  end if;

  select s.reached into at_ceiling from public.storage_ceiling as s where s.id;
  if not coalesce(at_ceiling, false) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    -- Only the rows actually inserted: an upsert's rows that took the update
    -- are in the UPDATE trigger's tables instead.
    if exists (select 1 from new_rows) then
      raise exception using
        errcode = 'PT429',
        message = 'predictions: the database is at its storage ceiling; new predictions wait until there is room';
    end if;
    return null;
  end if;

  -- An update: the text its rows hold now, less what they held before
  -- (old_rows exists only on the UPDATE trigger, and is read only here).
  select coalesce(sum(octet_length(n.title) + coalesce(octet_length(n.reflection), 0)), 0)
    into added
    from new_rows as n;
  select coalesce(sum(octet_length(o.title) + coalesce(octet_length(o.reflection), 0)), 0)
    into removed
    from old_rows as o;
  if added - removed > 0 then
    raise exception using
      errcode = 'PT429',
      message = 'predictions: the database is at its storage ceiling; changes that add text wait until there is room';
  end if;

  return null;
end;
$$;

comment on function public.predictions_storage_ceiling() is
  'AFTER INSERT and AFTER UPDATE (per statement) on predictions: while '
  'public.storage_ceiling is reached, refuses (PT429) a statement that inserted '
  'a row or added text to titles and notes, for the public key''s roles only. '
  'Migration 012.';

drop trigger if exists analytics_events_ceiling on public.analytics_events;
create trigger analytics_events_ceiling
  before insert on public.analytics_events
  for each statement execute function public.storage_ceiling_refuse_rows();

drop trigger if exists guest_analytics_events_ceiling on public.guest_analytics_events;
create trigger guest_analytics_events_ceiling
  before insert on public.guest_analytics_events
  for each statement execute function public.storage_ceiling_refuse_rows();

drop trigger if exists predictions_insert_ceiling on public.predictions;
create trigger predictions_insert_ceiling
  after insert on public.predictions
  referencing new table as new_rows
  for each statement execute function public.predictions_storage_ceiling();

-- The rows before the update too, for the text the statement adds.
drop trigger if exists predictions_update_ceiling on public.predictions;
create trigger predictions_update_ceiling
  after update on public.predictions
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.predictions_storage_ceiling();

-- ---------------------------------------------------------------------------
-- 4. Who may run them
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE on a new function or procedure to PUBLIC, and
-- Supabase's default privileges grant it to anon, authenticated and
-- service_role as well. Only the owner, which runs the jobs, needs any of
-- these. None could do much harm through the API (the cutoff only computes a
-- date; the procedure would delete as its caller, and anon and authenticated
-- have no DELETE on these tables since 010; the refresh only sets the flag
-- to what the size says), but none is the API's to call, and the refresh
-- would let anyone make the server read every file's size as often as they
-- liked.
revoke all on function public.usage_counts_cutoff(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on procedure public.purge_old_usage_counts()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_storage_ceiling()
  from public, anon, authenticated, service_role;

-- Supabase's default privileges also grant every privilege on a new table in
-- public to anon, authenticated and service_role. The flag is the owner's
-- alone: read by the triggers as its owner, written by the job as its owner.
revoke all on table public.storage_ceiling
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The jobs
-- ---------------------------------------------------------------------------

-- purge-old-usage-counts: every day at 09:17 UTC (pg_cron's schedules are in
-- GMT unless cron.timezone says otherwise): about 1 am in California, 4 am in
-- New York, 9 am in London. Away from midnight UTC, when 010's and 011's day
-- budgets start again and queued phones send. Off the hour, so it doesn't
-- start with every other job on the hour.
--
-- refresh-storage-ceiling: every 5 minutes (section 3b), the step syntax
-- pg_cron's README shows ('*/5 * * * *', "every 5 minutes"). A run is a few
-- milliseconds; pg_cron runs one at a time of each job.
--
-- Idempotent: a job of either name is unscheduled first (cron.schedule would
-- also replace it, by Supabase's quickstart). cron.job shows a role only its
-- own jobs, so this finds the ones this role scheduled on an earlier run.
-- The jobs run as the role applying this file (the first block made sure it
-- owns both usage tables; it made storage_ceiling), in this database.
--
-- Then the flag is set from the size now, so the ceiling holds from this
-- commit rather than from the job's first run. If the database is already
-- over the threshold, every write that adds rows or text is refused from
-- here: the README's step 5c looks first.
do $$
declare
  job record;
begin
  for job in
    select j.jobid
      from cron.job as j
     where j.jobname in ('purge-old-usage-counts', 'refresh-storage-ceiling')
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  perform cron.schedule(
    'purge-old-usage-counts',
    '17 9 * * *',
    'call public.purge_old_usage_counts()'
  );

  perform cron.schedule(
    'refresh-storage-ceiling',
    '*/5 * * * *',
    'select public.refresh_storage_ceiling()'
  );

  perform public.refresh_storage_ceiling();
end;
$$;
