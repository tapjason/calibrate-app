-- Limits on what the public key can write (security review, 2026-11-18).
--
-- The project URL and the anon key ship inside the app, so anyone can call
-- the Data API with them: as a guest (role anon), or with an account they
-- made themselves (role authenticated). Row-level security already decides
-- WHOSE rows a caller can touch. This migration adds what RLS can't say:
--
--   1. guest_analytics_events, where anon may insert (migration 007):
--      - one insert statement holds at most 100 rows, the app's own batch
--        (BATCH_SIZE in src/analytics/flush.ts);
--      - the whole table takes at most 20,000 rows a day (UTC);
--      - props hold only what the app sends (below);
--      - no two rows can be tied together by time. received_at was now(),
--        the same microsecond for every row of one batch, and the event id
--        the phone makes begins with the millisecond it was made
--        (`<Date.now() in base36>-<random>`, src/analytics/track.ts). The
--        privacy policy says a guest's counts can't be linked "to each
--        other". So received_at and created_at are kept to the day, and the
--        id is replaced by a hash of itself: still the same for a retried
--        row (the duplicate-key answer the phone counts as delivered), no
--        longer a timestamp. Rows already stored are rewritten the same way;
--        that rewrite is one-way, on purpose.
--   2. analytics_events and predictions (signed in): size limits on ids and
--      text, the same props rule, and a shape for event names.
--   3. Grants: anon and authenticated keep exactly what the app uses (listed
--      at section 3), instead of Supabase's default of every privilege on
--      every table; apply_entitlement_event is granted to service_role
--      explicitly, as bump_coach_usage is (002).
--
-- The props rule (analytics_props_ok), from src/analytics/events.ts, where
-- EVENT_PROPS has only ever grown, so every build ever shipped sends a subset:
--   - an object of at most 4 keys (the most any event declares:
--     purchase_completed's plan_annual, plan_monthly, plan_lifetime, trial);
--   - each key one of the 15 declared anywhere in EVENT_PROPS;
--   - each value a boolean, a number between -1e9 and 1e9, or one of the 10
--     declared enum words (PAYWALL_SOURCES and SHARE_SURFACES). No other
--     string: sanitizeProps (events.ts) drops anything else before a row is
--     queued, since the first analytics build (2026-09-07).
--
-- Safe on a live table: the new CHECKs are added NOT VALID, so rows already
-- stored can't make the migration fail; each is then validated in its own
-- block that turns a failure into a NOTICE naming the constraint (the rule
-- still applies to every new or updated row). Idempotent: every object is
-- dropped if it exists before it is made, and the backfill skips rows it
-- already rewrote. The SQL editor and `supabase db push` both run the file as
-- one transaction: all of it applies, or none.
--
-- What a refused guest insert means for the phone (src/analytics/flush.ts,
-- src/db/analytics.ts): the rows stay queued and the next sweep retries them,
-- and the queue is capped at 2,000 rows, oldest dropped first, so a refusal
-- can't grow it without bound. A batch of 100 or fewer is never refused for
-- its size, and a row the app builds always passes the props rule, so the
-- only refusal a legitimate row can meet is the day's budget, which ends at
-- midnight UTC.
--
-- Applied migrations are never edited; this file only adds.

-- ---------------------------------------------------------------------------
-- 1. Functions
-- ---------------------------------------------------------------------------

-- The props rule, shared by both analytics tables' CHECKs. IMMUTABLE and
-- invoker's rights. A CHECK runs as the role inserting the row, which needs
-- EXECUTE on it; that is granted to anon and authenticated at the end, not
-- left to defaults. Called through the API on its own (/rpc/), it only
-- answers true or false about the object it is given.
create or replace function public.analytics_props_ok(p_props jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  prop record;
  key_count integer := 0;
begin
  if p_props is null or jsonb_typeof(p_props) <> 'object' then
    return false;
  end if;

  for prop in select e.key, e.value from jsonb_each(p_props) as e loop
    key_count := key_count + 1;
    if key_count > 4 then
      return false;
    end if;

    -- Every key declared in EVENT_PROPS (src/analytics/events.ts).
    if prop.key not in (
      'score', 'question_count', 'surface', 'confidence', 'integrity_bonus',
      'correct', 'source', 'plan_annual', 'plan_monthly', 'plan_lifetime',
      'trial', 'buckets_used', 'hour', 'insight_count', 'row_count'
    ) then
      return false;
    end if;

    case jsonb_typeof(prop.value)
      when 'boolean' then
        null;
      when 'number' then
        -- The largest real value is a CSV export's row count.
        if abs((prop.value)::numeric) > 1000000000 then
          return false;
        end if;
      when 'string' then
        -- PAYWALL_SOURCES and SHARE_SURFACES: the only strings the app sends.
        if (prop.value #>> '{}') not in (
          'stats', 'stats_coach', 'stats_trends', 'share_theme', 'settings',
          'deep_link', 'card', 'weekly', 'yearly', 'warmup'
        ) then
          return false;
        end if;
      else
        -- null, an object or an array.
        return false;
    end case;
  end loop;

  return true;
end;
$$;

comment on function public.analytics_props_ok(jsonb) is
  'True when an analytics props object holds only what the app sends: at most '
  '4 declared keys, each a boolean, a number from -1e9 to 1e9 or a declared enum '
  'word (src/analytics/events.ts). Migration 010.';

-- A guest row, as it is written: the id the phone made is checked, then
-- replaced by 'h_' and 32 hex characters of its SHA-256 (a retry of the same
-- row still collides on the primary key, and the stored id no longer starts
-- with a timestamp); created_at is cut to its UTC day; received_at is today
-- (UTC), whatever the caller sent. Invoker's rights: it reads no table.
create or replace function public.guest_analytics_events_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The limit migration 007 put on the id, now checked before the hash,
  -- since the stored id is always 34 characters.
  if new.id is null or length(new.id) < 1 or length(new.id) > 64 then
    raise exception using
      errcode = 'check_violation',
      message = 'guest_analytics_events: id must be 1 to 64 characters';
  end if;

  new.id := 'h_' || left(encode(sha256(convert_to(new.id, 'UTF8')), 'hex'), 32);
  new.created_at := date_trunc('day', new.created_at, 'UTC');
  new.received_at := date_trunc('day', now(), 'UTC');
  return new;
end;
$$;

comment on function public.guest_analytics_events_normalize() is
  'BEFORE INSERT on guest_analytics_events: hashes the client id and keeps '
  'created_at and received_at to the UTC day, so rows can''t be tied together '
  'by time. Migration 010.';

-- After each insert statement: at most 100 rows in it, and at most 20,000
-- rows received today (UTC) in the whole table, this statement's included.
-- Either refusal rolls the whole statement back.
--
-- The day's budget, 20,000 rows: a guest's heaviest real day is about 50
-- funnel events (the Warm-up's 2, a few dozen logs and answers, practice's 2,
-- a few shares), so 20,000 is 400 such guests, eight times the open beta's
-- 50 testers at that rate (2,500). The cost if someone spends it on junk
-- every day: at most about 0.7 KB a row (a 512-character props object, a
-- 34-character id, two timestamps, three index entries), so about 14 MB a
-- day. To change it, edit max_rows_per_day below and run this
-- `create or replace function` again.
--
-- Concurrent inserts each count what is committed plus their own rows, so a
-- burst arriving together can overshoot the budget by at most one batch per
-- open connection. That is fine for a budget.
--
-- SECURITY DEFINER, because it counts the table and anon can't read it; owned
-- by the role that runs this migration, which owns the table (the check at
-- the end of the README section says so). The refusals carry PostgREST's
-- PTxyz codes, so the phone gets HTTP 413 or 429 with code PT413 or PT429.
-- No EXECUTE is revoked: a trigger function can't be called on its own
-- ("trigger functions can only be called as triggers"), and Postgres checks
-- EXECUTE on it only when a trigger is created, not when it fires.
create or replace function public.guest_analytics_events_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows_per_insert constant integer := 100;
  max_rows_per_day    constant integer := 20000;
  inserted bigint;
  received_today bigint;
begin
  select count(*) into inserted from new_rows;
  if inserted > max_rows_per_insert then
    raise exception using
      errcode = 'PT413',
      message = format('guest_analytics_events: at most %s rows per insert', max_rows_per_insert);
  end if;

  select count(*) into received_today
    from public.guest_analytics_events
   where received_at = date_trunc('day', now(), 'UTC');
  if received_today > max_rows_per_day then
    raise exception using
      errcode = 'PT429',
      message = 'guest_analytics_events: today''s budget is used up; try again after midnight UTC';
  end if;

  return null;
end;
$$;

comment on function public.guest_analytics_events_limits() is
  'AFTER INSERT (per statement) on guest_analytics_events: at most 100 rows '
  'per insert and 20,000 rows per UTC day. Migration 010.';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2a. guest_analytics_events -------------------------------------------------

-- Rewrite the rows already stored, as the trigger will write new ones. Before
-- any new CHECK is added: an UPDATE is held to NOT VALID constraints too, and
-- this one must not fail on an old row. A row the trigger wrote (or a re-run
-- already rewrote) has an id of the hashed shape and day timestamps, and is
-- left alone. The app's ids never start with 'h_' (src/analytics/track.ts).
update public.guest_analytics_events
   set id = case
              when id ~ '^h_[0-9a-f]{32}$' then id
              else 'h_' || left(encode(sha256(convert_to(id, 'UTF8')), 'hex'), 32)
            end,
       created_at  = date_trunc('day', created_at, 'UTC'),
       received_at = date_trunc('day', received_at, 'UTC')
 where id !~ '^h_[0-9a-f]{32}$'
    or created_at  <> date_trunc('day', created_at, 'UTC')
    or received_at <> date_trunc('day', received_at, 'UTC');

alter table public.guest_analytics_events
  alter column received_at set default date_trunc('day', now(), 'UTC');

-- Makes the day's count an index scan over today's rows only.
create index if not exists idx_guest_analytics_events_received_day
  on public.guest_analytics_events (received_at);

drop trigger if exists guest_analytics_events_normalize on public.guest_analytics_events;
create trigger guest_analytics_events_normalize
  before insert on public.guest_analytics_events
  for each row execute function public.guest_analytics_events_normalize();

drop trigger if exists guest_analytics_events_limits on public.guest_analytics_events;
create trigger guest_analytics_events_limits
  after insert on public.guest_analytics_events
  referencing new table as new_rows
  for each statement execute function public.guest_analytics_events_limits();

alter table public.guest_analytics_events
  drop constraint if exists guest_analytics_events_props_allowed;
alter table public.guest_analytics_events
  add constraint guest_analytics_events_props_allowed
  check (public.analytics_props_ok(props)) not valid;

-- 2b. analytics_events (signed in) ------------------------------------------

-- The app's ids are about 17 characters (track.ts).
alter table public.analytics_events
  drop constraint if exists analytics_events_id_length;
alter table public.analytics_events
  add constraint analytics_events_id_length
  check (length(id) between 1 and 64) not valid;

-- Every declared name is lowercase words joined by underscores
-- (EVENT_NAMES in src/analytics/events.ts; the longest has 23 characters).
-- A shape, not the list, so a new event in a later build isn't refused for
-- ever before a migration lands.
alter table public.analytics_events
  drop constraint if exists analytics_events_name_shape;
alter table public.analytics_events
  add constraint analytics_events_name_shape
  check (name ~ '^[a-z][a-z0-9_]{0,47}$') not valid;

-- 005's header said no free text could go in; until now any string could.
alter table public.analytics_events
  drop constraint if exists analytics_events_props_allowed;
alter table public.analytics_events
  add constraint analytics_events_props_allowed
  check (public.analytics_props_ok(props)) not valid;

-- 2c. predictions (signed in) -----------------------------------------------

-- The app's ids are about 17 characters (`<ts>-<rand>`, predictionStore.ts);
-- demo data's are under 40.
alter table public.predictions
  drop constraint if exists predictions_id_length;
alter table public.predictions
  add constraint predictions_id_length
  check (length(id) between 1 and 128) not valid;

-- The app caps a title at 200 characters as a person sees them, with a hard
-- stop of 2,400 UTF-16 units against a pasted emoji run (TextField's
-- unitBackstop, src/engine/graphemes.ts), so no title from the app is longer
-- than 2,400 characters here. 8,000 is over three times that.
alter table public.predictions
  drop constraint if exists predictions_title_length;
alter table public.predictions
  add constraint predictions_title_length
  check (length(title) <= 8000) not valid;

-- A reflection: 500 as a person sees them, hard stop 6,000 units. 20,000 is
-- over three times that.
alter table public.predictions
  drop constraint if exists predictions_reflection_length;
alter table public.predictions
  add constraint predictions_reflection_length
  check (reflection is null or length(reflection) <= 20000) not valid;

-- 2d. Validate what is already stored ---------------------------------------

-- Each constraint in its own block: a row that breaks one leaves that one
-- NOT VALID (still applied to every new or updated row) and raises a NOTICE
-- naming it, and the migration goes on. The README's query finds the rows.
do $$
declare
  c record;
begin
  for c in
    select t.tbl, t.con
      from (values
        ('public.guest_analytics_events', 'guest_analytics_events_props_allowed'),
        ('public.analytics_events',       'analytics_events_id_length'),
        ('public.analytics_events',       'analytics_events_name_shape'),
        ('public.analytics_events',       'analytics_events_props_allowed'),
        ('public.predictions',            'predictions_id_length'),
        ('public.predictions',            'predictions_title_length'),
        ('public.predictions',            'predictions_reflection_length')
      ) as t(tbl, con)
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.con);
    exception
      when check_violation then
        raise notice 'Constraint % on % left NOT VALID: rows already stored break it (%). New and updated rows are still checked.',
          c.con, c.tbl, sqlerrm;
      when others then
        raise notice 'Constraint % on % left NOT VALID (%): %. New and updated rows are still checked.',
          c.con, c.tbl, sqlstate, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
--
-- Supabase grants anon and authenticated every privilege on every table in
-- public by default, TRUNCATE included, which RLS doesn't govern. Each table
-- below is reset to exactly what the app does with it (read 2026-11-18):
--
--   predictions             authenticated: select (pull), insert + update
--                           (the upsert in pushDirty), delete (pushDeletions),
--                           all under RLS to its own rows (src/supabase/sync.ts).
--                           anon: nothing; a guest never syncs.
--   entitlements            authenticated: select of its own row (003's
--                           policy; the app reads RevenueCat, not this table).
--                           Written by the service role only.
--   coach_usage             nobody; the coach function's service role only (002).
--   analytics_events        authenticated: insert (flush.ts), and select of
--                           its own rows (005's policy). No update, no delete:
--                           a log the client can rewrite is not a log.
--   guest_analytics_events  anon: insert (flush.ts, a guest). Nothing else
--                           for anyone but the service role.
--
-- service_role, which the Edge Functions use, and the table owner keep every
-- privilege: nothing here touches them. A revoke and its grant run in the
-- same transaction, so there is no moment without either.

revoke all on table public.predictions from anon, authenticated;
grant select, insert, update, delete on table public.predictions to authenticated;

revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;

revoke all on table public.coach_usage from anon, authenticated;

revoke all on table public.analytics_events from anon, authenticated;
grant select, insert on table public.analytics_events to authenticated;

revoke all on table public.guest_analytics_events from anon, authenticated;
grant insert on table public.guest_analytics_events to anon;

-- 004 revoked apply_entitlement_event from everyone and never granted it
-- back; the webhook has worked because Supabase's default privileges grant
-- service_role EXECUTE on new functions. Explicit now, as 002 does for
-- bump_coach_usage, and the revokes are repeated so a re-run can't widen them.
revoke all on function public.apply_entitlement_event(uuid, boolean, text, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_entitlement_event(uuid, boolean, text, timestamptz, bigint)
  to service_role;

revoke all on function public.bump_coach_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_coach_usage(uuid) to service_role;

-- Needed, not optional: both analytics tables' CHECKs call it as the role
-- inserting the row.
grant execute on function public.analytics_props_ok(jsonb) to anon, authenticated, service_role;
