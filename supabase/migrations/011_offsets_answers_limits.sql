-- Logging zones, answers that stay answered, and per-account write limits
-- (security review, rounds 5 and 6, 2026-11-19). Apply AFTER 010: the block
-- below refuses to run without 010's functions.
--
--   1. predictions gains two nullable columns: the phone's UTC offset, in
--      minutes east of UTC (-getTimezoneOffset(), src/types/index.ts), when
--      the prediction was logged and when it was reworded. The owner decided
--      2026-11-19 (D69 (f), as refined after the re-review) that a same-day
--      answer (D41) is judged only in the zone the prediction was logged in,
--      or reworded in (D45), so moving the phone to another zone before
--      answering can't turn a same-day answer into a scored one
--      (src/engine/sameDay.ts). The answer's own offset is not kept: there
--      is no column for it. Older rows and older builds leave both null. The
--      app sends them only once UTC_OFFSET_SYNC (src/constants/app.ts) is
--      turned on, after this migration is live: an upsert naming a column
--      the server doesn't have fails whole, so the flag must wait for the
--      columns, and the build that turns it on must name only these two. A
--      push that names an offset as null, for the same moment as the stored
--      row's, keeps the stored offset (section 1, predictions_keep_offsets):
--      a null says the phone doesn't know the zone, never that there was
--      none.
--   2. No answer goes back to open through sync (CLAUDE.md: "There is no way
--      to put any answer back to open"; a Yes or No never becomes "Can't
--      tell", D34). A phone that hadn't pulled could push its open copy of a
--      prediction answered elsewhere, and last-write-wins reopened the answer
--      for every phone. A trigger now keeps the answered row whole, all but
--      a later updated_at (below, 2).
--   3. Limits on what one signed-in account can write (server re-review
--      MEDIUM-A: one account could upsert enough rows to push a free-plan
--      database to read-only for everyone): at most 100 rows per request on
--      predictions and analytics_events, a larger request stopped at row 101
--      before the rest is written (final server re-review, K), at most 50,000
--      predictions per account, at most 25 MB of titles and notes per account,
--      at most 5,000 events per account per UTC day, and byte limits on a
--      title and a reflection.
--   4. The guest table (server re-review LOW-C, D, F): an oversized insert
--      stops at row 101 before doing the work, the whole table has a ceiling,
--      and a number in props is at most 24 characters long.
--
-- What a refusal means for the phone. Every one carries a PostgREST code the
-- app already knows: PT413 (HTTP 413) for too many rows in one request, PT429
-- (HTTP 429) for a cap reached.
--   - Analytics (src/analytics/flush.ts, outcomeOf): both are 'stop'. The
--     sweep ends, every row stays queued for a later sweep, and the queue is
--     capped at 2,000 rows (oldest dropped first). The app sends at most 100
--     rows a request, so PT413 never reaches it; PT429 lifts at midnight UTC.
--   - Predictions (src/supabase/sync.ts, pushDirty): at most 100 rows per
--     upsert (PUSH_BATCH_SIZE), oldest change first, so PT413 never reaches
--     it. Any refused batch is tried once more one row at a time, and a row
--     refused alone stays dirty for the next sweep (sign-out counts it as
--     unsynced and asks before discarding it). Past the 50,000 cap, each new
--     row is refused (PT429) on every sweep and stays on the phone; changes
--     to existing rows still go through. Past the 25 MB text budget, a row
--     that adds text is refused (PT429) on every sweep and stays on the
--     phone; answers and other changes that add no text still go through.
--
-- Safe on a live database: the new columns are nullable with no default (no
-- table rewrite); every new CHECK is added NOT VALID, then validated in its
-- own block that turns a failure into a NOTICE naming the constraint (the
-- rule still holds for every new or updated row). Idempotent: columns are
-- added if missing, and every function, trigger, constraint and index is
-- replaced or dropped-if-exists before it is made. The SQL editor and
-- `supabase db push` both run the file as one transaction: all of it
-- applies, or none.
--
-- Applied migrations are never edited. This file replaces two of 010's
-- objects with stricter ones: analytics_props_ok (section 4) and, with it,
-- the two props CHECKs that call it. If 010 is ever run again, run 011 again
-- after it, or 010's looser props rule comes back.

-- A lock that can't be had within 10 s rolls the whole migration back,
-- instead of queueing every app request behind a waiting ALTER TABLE. Run it
-- again a moment later.
set local lock_timeout = '10s';

do $$
begin
  if to_regprocedure('public.analytics_props_ok(jsonb)') is null
     or to_regprocedure('public.guest_analytics_events_limits()') is null
     or to_regprocedure('public.guest_analytics_events_normalize()') is null then
    raise exception 'Migration 011 needs migration 010 first: apply 010_public_key_limits.sql, then run this file again.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The UTC offsets
-- ---------------------------------------------------------------------------

-- The logging and rewording moments only: same-day is judged in that zone
-- alone, so no offset is kept for the moment of the answer (header, 1).
-- Nullable, no default: adding them rewrites nothing and older builds, which
-- never name them, leave them as they are (an upsert only sets the columns
-- it names).
alter table public.predictions
  add column if not exists created_utc_offset_min      integer,
  add column if not exists title_edited_utc_offset_min integer;

comment on column public.predictions.created_utc_offset_min is
  'Minutes east of UTC on the phone when the prediction was logged; null when unknown. Migration 011.';
comment on column public.predictions.title_edited_utc_offset_min is
  'Minutes east of UTC on the phone when title_edited_at was set; null when unknown. Migration 011.';

-- UTC-12:00 to UTC+14:00 is -720 to 840 minutes; -840 to 840 holds every
-- zone in use with room, and is the app's UTC_OFFSET_LIMIT_MIN. NULL passes.
alter table public.predictions
  drop constraint if exists predictions_created_utc_offset_min_range;
alter table public.predictions
  add constraint predictions_created_utc_offset_min_range
  check (created_utc_offset_min between -840 and 840) not valid;

alter table public.predictions
  drop constraint if exists predictions_title_edited_utc_offset_min_range;
alter table public.predictions
  add constraint predictions_title_edited_utc_offset_min_range
  check (title_edited_utc_offset_min between -840 and 840) not valid;

-- Before each update of a prediction: a null offset sent over a stored one,
-- for the same moment, keeps the stored one. Once UTC_OFFSET_SYNC is on, the
-- app names both columns on every row it pushes, null included (rowToWire,
-- src/db/predictions.ts). A phone that doesn't hold a moment's offset (a row
-- it pulled while the app sent none, or one logged before the app kept them)
-- then pushes the whole row with that offset null, and last-write-wins would
-- erase the offset another phone sent for that very moment, so a same-day
-- answer (D41) would be read in whatever zone each phone is in. A null says
-- the sender doesn't know the zone, never that the moment had none: the same
-- rule as the app's pull (upsertPredictionFromRemote, src/db/predictions.ts).
-- Each offset is judged on its own moment:
--   - created_utc_offset_min, when the update leaves created_at the same
--     instant. timestamptz compares instants, so '...10:00+01:00' and
--     '...09:00Z' are the same moment however a phone writes it; created_at
--     is NOT NULL (migration 001), so = is exact. The app never moves
--     created_at. A push that does (defined, not expected) is another moment,
--     and the null it brings lands.
--   - title_edited_utc_offset_min, when title_edited_at is not distinct from
--     the stored one (null and null included). New words come with their own
--     date (D45), another moment: a null with them lands, since the stored
--     zone was the old words'.
-- A known offset always lands, as every column does (last write wins). A
-- build that doesn't name the columns at all never needed this: an upsert
-- sets only the columns it names. Never raises, and writes nothing but the
-- two offsets: updated_at and every other column stay as the update set
-- them. Applies to every role, as predictions_keep_answer does; to clear an
-- offset by hand, the README's step 12 says how.
--
-- Firing order: Postgres fires the BEFORE ROW triggers of one event in name
-- order, each given the row the one before it returned, so this one runs
-- after predictions_keep_answer (section 2; '_keep_a' sorts before
-- '_keep_o'). The order changes nothing, so it is not relied on. When
-- keep_answer keeps an answered row, it hands on the stored row, all but
-- updated_at: its offsets are the stored ones, so wherever one is null the
-- stored one is null too, and this one changes nothing. Run the other way
-- round, keep_answer would replace whatever this one did with the stored row
-- anyway. And keep_answer reads only status, which this one never writes, so
-- neither decides whether the other acts.
--
-- Invoker's rights: it reads no table.
create or replace function public.predictions_keep_offsets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_utc_offset_min is null
     and new.created_at = old.created_at then
    new.created_utc_offset_min := old.created_utc_offset_min;
  end if;
  if new.title_edited_utc_offset_min is null
     and new.title_edited_at is not distinct from old.title_edited_at then
    new.title_edited_utc_offset_min := old.title_edited_utc_offset_min;
  end if;
  return new;
end;
$$;

comment on function public.predictions_keep_offsets() is
  'BEFORE UPDATE on predictions: a null UTC offset sent over a stored one keeps '
  'the stored one while its moment is unchanged (created_at the same instant; '
  'title_edited_at not distinct). Never raises; writes nothing else. Migration 011.';

drop trigger if exists predictions_keep_offsets on public.predictions;
create trigger predictions_keep_offsets
  before update on public.predictions
  for each row execute function public.predictions_keep_offsets();

-- ---------------------------------------------------------------------------
-- 2. No answer back to open
-- ---------------------------------------------------------------------------

-- Before each update of a prediction: when the row is answered (Yes, No or
-- "Can't tell") and the update would make it open, or the row is a Yes or No
-- and the update would make it "Can't tell", the update comes from a phone
-- that hadn't pulled the answer, and none of it lands: the whole row stays as
-- it was (status, resolved_at, reflection, title, category, due_date,
-- title_edited_at, the two offsets, every column), all but updated_at
-- (main session decision, 2026-11-19, the same rule as the app's pull merge,
-- upsertPredictionFromRemote in src/db/predictions.ts). An open copy's edits
-- never reach an answered prediction: the app itself lets no answered
-- prediction be reworded or re-dated. Yes <-> No goes through ("Change
-- answer"), and so does "Can't tell" -> Yes or No (a skip answered later). It
-- never raises: an error would fail the whole batch an older build sends and
-- leave its row stuck, retried on every sweep.
--
-- updated_at moves forward, strictly past both the stored row's and the open
-- copy's, so every phone pulls the answered row. A phone pulls rows whose
-- updated_at is past its cursor, the latest updated_at it has pulled (its own
-- pushes included: they come back on its next pull), and writes a pulled row
-- only when it is strictly newer than its own copy (equal times are skipped),
-- comparing the two times as text. The open copy was stamped when the stale
-- phone edited it, possibly hours before it came online, so that time can be
-- behind other phones' cursors. The kept row takes the latest of the stored
-- row's time, the open copy's time and the server's clock now (all
-- timestamptz), cut to whole milliseconds, plus 1 ms: later than both copies,
-- so the phone that pushed the open copy takes the answer back on its next
-- pull, and past the server's clock, so past every cursor a phone with a
-- right clock has stamped (the app does the same, laterThan in
-- src/db/predictions.ts). Whole milliseconds: the app writes its times with
-- milliseconds and compares them as text, and a time with microseconds
-- ('…00.123456+00:00') sorts before the same instant written '…00.123Z'.
-- Cutting to the millisecond and adding one keeps it strictly later than all
-- three.
--
-- Invoker's rights: it reads no table.
create or replace function public.predictions_keep_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  later timestamptz;
begin
  if (old.status in ('resolved_yes', 'resolved_no', 'skipped') and new.status = 'pending')
     or (old.status in ('resolved_yes', 'resolved_no') and new.status = 'skipped') then
    later := date_trunc('milliseconds', greatest(old.updated_at, new.updated_at, now()))
             + interval '1 millisecond';
    new := old;
    new.updated_at := later;
  end if;
  return new;
end;
$$;

comment on function public.predictions_keep_answer() is
  'BEFORE UPDATE on predictions: an update that would put an answered row back '
  'to open, or a Yes or No to Can''t tell, changes nothing but updated_at, which '
  'moves past both copies'' times. Never raises. Migration 011.';

drop trigger if exists predictions_keep_answer on public.predictions;
create trigger predictions_keep_answer
  before update on public.predictions
  for each row execute function public.predictions_keep_answer();

-- ---------------------------------------------------------------------------
-- 3. Per-account limits on signed-in writes
-- ---------------------------------------------------------------------------

-- 3a. predictions --------------------------------------------------------------

-- The app caps a title at 200 characters as a person sees them, with a hard
-- stop of 2,400 UTF-16 units (unitBackstop, src/engine/graphemes.ts), and a
-- reflection or note at 500, hard stop 6,000 units. One UTF-16 unit is at
-- most 3 bytes of UTF-8 (a character outside the BMP is 2 units and 4
-- bytes), so no title from the app is over 7,200 bytes and no reflection
-- over 18,000. 010's limits count characters, and a character can be 4
-- bytes: 8,000 characters could be 32,000 bytes. These count bytes.
alter table public.predictions
  drop constraint if exists predictions_title_bytes;
alter table public.predictions
  add constraint predictions_title_bytes
  check (octet_length(title) <= 8000) not valid;

alter table public.predictions
  drop constraint if exists predictions_reflection_bytes;
alter table public.predictions
  add constraint predictions_reflection_bytes
  check (reflection is null or octet_length(reflection) <= 20000) not valid;

-- Before each row an insert or update statement writes: count the
-- statement's rows in a transaction-local setting and stop at row 101,
-- before that row is checked, changed or written (final server re-review,
-- K). The AFTER triggers below refuse more than 100 rows too, but only once
-- every row is written: a request of 10,000 rows did all of that work first.
--
-- Inserts and updates are counted apart, in fs.prediction_inserts and
-- fs.prediction_updates. The app's push is an upsert (INSERT ... ON CONFLICT
-- DO UPDATE), and Postgres fires BEFORE INSERT for every row the statement
-- proposes, one that then meets its conflict included ("the effects of all
-- per-row BEFORE INSERT triggers are reflected in excluded values", the
-- INSERT page), then BEFORE UPDATE for each row that takes the update. One
-- count would reach 200 on the app's batch of 100 rows it had pushed before.
-- So an upsert stops at its 101st row, new or not, and an update at its
-- 101st changed row. The app sends at most 100 rows a request
-- (PUSH_BATCH_SIZE, src/supabase/sync.ts), so neither stop reaches it. An
-- upsert of 101 rows that the AFTER triggers alone would have let through
-- (some new, some changed, neither over 100) is now refused: the app never
-- sends one.
--
-- The counts start again at each statement (predictions_reset_counts, below)
-- and are gone at the end of the transaction; a refused statement's count is
-- rolled back with it. A value that isn't a plain count reads as no count, as
-- for the guest table (section 4): the AFTER triggers stay the exact check
-- either way. The setting each call writes is not the one its SET clause
-- names (search_path), so it outlives the call, to the end of the
-- transaction, as section 4 says of fs.guest_rows.
--
-- The same exemption as the AFTER triggers below: the owner's statements in
-- the SQL editor and the service role's are not counted, so a backfill over
-- every row isn't stopped and the README's tests can fill an account as the
-- owner. An exempt row is handed on unchanged (a BEFORE ROW trigger that
-- returned null would skip it).
--
-- Fires first among the BEFORE ROW triggers of each event (name order:
-- '_count_rows' sorts before '_keep_answer' and '_keep_offsets'), so row 101
-- is stopped before either runs. Invoker's rights: it reads no table.
create or replace function public.predictions_count_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows_per_statement constant integer := 100;
  setting_name text;
  counted text;
  seen integer;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    setting_name := 'fs.prediction_inserts';
  else
    setting_name := 'fs.prediction_updates';
  end if;

  counted := pg_catalog.current_setting(setting_name, true);
  if counted is not null and counted ~ '^[0-9]{1,9}$' then
    seen := counted::integer + 1;
  else
    seen := 1;
  end if;

  if seen > max_rows_per_statement then
    raise exception using
      errcode = 'PT413',
      message = format('predictions: stopped at row %s; at most %s %s in one request',
                       seen, max_rows_per_statement,
                       case when tg_op = 'INSERT' then 'rows' else 'changed rows' end);
  end if;

  perform pg_catalog.set_config(setting_name, seen::text, true);
  return new;
end;
$$;

comment on function public.predictions_count_rows() is
  'BEFORE INSERT OR UPDATE (per row) on predictions: stops a statement at its '
  '101st proposed row (insert or upsert) or 101st changed row (PT413), before '
  'that row is written; inserts and updates counted apart. Not for the owner '
  'or the service role. Migration 011.';

-- After each insert or update statement: that event's count starts again, so
-- a transaction with several statements (the README's tests) has each
-- counted alone. An upsert fires both (AFTER UPDATE, then AFTER INSERT, per
-- Postgres's trigger page), so both counts start again after it. When an
-- AFTER trigger refuses the statement, the settings are rolled back with it.
create or replace function public.predictions_reset_counts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_catalog.set_config('fs.prediction_inserts', '0', true);
  else
    perform pg_catalog.set_config('fs.prediction_updates', '0', true);
  end if;
  return null;
end;
$$;

comment on function public.predictions_reset_counts() is
  'AFTER INSERT OR UPDATE (per statement) on predictions: the matching count of '
  'predictions_count_rows starts again. Migration 011.';

drop trigger if exists predictions_count_rows on public.predictions;
create trigger predictions_count_rows
  before insert or update on public.predictions
  for each row execute function public.predictions_count_rows();

drop trigger if exists predictions_reset_counts on public.predictions;
create trigger predictions_reset_counts
  after insert or update on public.predictions
  for each statement execute function public.predictions_reset_counts();

-- After each insert or update statement on predictions:
--   - at most 100 rows in it (predictions_count_rows, above, stops a larger
--     statement at row 101 first; this stays as the exact count of the rows
--     actually inserted or changed). Postgres hands an INSERT trigger only
--     the rows inserted and an UPDATE trigger only the rows updated, and
--     refuses one trigger with a transition table on both events, so an
--     upsert (the app's push is INSERT ... ON CONFLICT DO UPDATE) is held to
--     at most 100 new rows and at most 100 changed ones. 100 is the
--     analytics batch (BATCH_SIZE, src/analytics/flush.ts); one request then
--     carries at most 100 x 28 KB of text. See the header for what the app's
--     push does with a refusal today.
--   - on insert, at most 50,000 predictions per account, this statement's
--     included. Counted on idx_predictions_user_updated (migration 001,
--     user_id first), and only up to 50,001, so a count never reads more
--     than that. 50,000 is 13 years of ten a day; the heaviest real use is a
--     few thousand a year. Updates of existing rows are never refused for
--     it. On its own it would still let one account store 50,000 x about
--     28 KB (a title of 8,000 bytes and a reflection of 20,000, which don't
--     compress if they are junk), about 1.4 GB: hence the budget below.
--   - on insert or update, a text budget of 25 MB (26,214,400 bytes) per
--     account: octet_length(title) + octet_length(reflection) summed over
--     the account's predictions (main session decision, 2026-11-19, closing
--     MEDIUM-A). A statement is refused (PT429) only when it adds text to an
--     account (the inserted rows' text, or the updated rows' text after
--     minus before, from the transition tables) and the account's total after
--     it passes the budget. A statement that adds nothing (an answer, a
--     category, a shorter note, the keep-answer trigger above) always goes
--     through, so an account somehow over the budget can still answer, trim
--     and sync. The arithmetic: the app writes at most 7,200 bytes of title
--     and 18,000 of note per prediction (section 3a), about 25 KB; a heavy
--     real user logs about 1,000 a year, so 25 MB in a year only if every
--     title and note were at their maximum. Typical text is a title of about
--     50 bytes and a note on some answers: a few hundred KB a year. The worst
--     one account now costs: 25 MB of text plus about 7 MB of row overhead at
--     the 50,000-row cap, about 32 MB instead of 1.4 GB. Many accounts can
--     each spend it; sign-up is what bounds that.
--     The cost: the total is summed over that account's rows only, found on
--     idx_predictions_user_updated (user_id first), one heap fetch per row;
--     octet_length reads a stored value's length from its header without
--     decompressing or fetching it from TOAST. About 1,000 rows: about a
--     millisecond; 10,000 rows: about 5 to 10 ms (estimates from Postgres's
--     costs, not measured here). Only statements that add text pay it, and
--     the app sends a few per sweep.
-- Concurrent writes each count what is committed plus their own rows, so a
-- burst can pass the row cap by at most one batch per open connection, and
-- the text budget by at most one batch's text (2.8 MB) per connection.
--
-- Only for the roles the public key reaches (anon, authenticated): the
-- owner's own statements in the SQL editor (no SET ROLE, so the setting
-- reads 'none') and the service role's are not limited, so a backfill the
-- owner runs over every row isn't refused. PostgREST sets the role per
-- request (SET LOCAL ROLE), and SECURITY DEFINER doesn't change the setting.
--
-- SECURITY DEFINER, so the count sees every row of the account whatever RLS
-- says; owned by the role that runs this migration, which owns the table
-- (the README's check says so). No EXECUTE is revoked: a trigger function
-- can't be called on its own, and Postgres checks EXECUTE on it only when a
-- trigger is created.
create or replace function public.predictions_write_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows_per_statement constant integer := 100;
  max_rows_per_account   constant integer := 50000;
  max_text_per_account   constant bigint  := 26214400; -- 25 MB
  written bigint;
  account uuid;
  held bigint;
  added bigint;
  removed bigint;
  held_text bigint;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return null;
  end if;

  select count(*) into written from new_rows;
  if written > max_rows_per_statement then
    raise exception using
      errcode = 'PT413',
      message = format('predictions: at most %s %s rows in one request',
                       max_rows_per_statement,
                       case when tg_op = 'INSERT' then 'new' else 'changed' end);
  end if;

  for account in select distinct n.user_id from new_rows as n loop
    if tg_op = 'INSERT' then
      select count(*) into held
        from (select 1
                from public.predictions as p
               where p.user_id = account
               limit max_rows_per_account + 1) as capped;
      if held > max_rows_per_account then
        raise exception using
          errcode = 'PT429',
          message = format('predictions: an account holds at most %s predictions', max_rows_per_account);
      end if;
    end if;

    -- The text this statement adds to the account: what its rows hold now,
    -- less what the updated ones held before (old_rows exists only on the
    -- UPDATE trigger, and is read only there).
    select coalesce(sum(octet_length(n.title) + coalesce(octet_length(n.reflection), 0)), 0)
      into added
      from new_rows as n
     where n.user_id = account;
    if tg_op = 'UPDATE' then
      select coalesce(sum(octet_length(o.title) + coalesce(octet_length(o.reflection), 0)), 0)
        into removed
        from old_rows as o
       where o.user_id = account;
      added := added - removed;
    end if;

    if added > 0 then
      select coalesce(sum(octet_length(p.title) + coalesce(octet_length(p.reflection), 0)), 0)
        into held_text
        from public.predictions as p
       where p.user_id = account;
      if held_text > max_text_per_account then
        raise exception using
          errcode = 'PT429',
          message = format('predictions: an account holds at most %s bytes of titles and notes',
                           max_text_per_account);
      end if;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.predictions_write_limits() is
  'AFTER INSERT and AFTER UPDATE (per statement) on predictions: at most 100 '
  'new and 100 changed rows per statement (PT413), at most 50,000 predictions '
  'per account (PT429, inserts only), and at most 25 MB of titles and notes per '
  'account (PT429, only for a statement that adds text). Migration 011.';

drop trigger if exists predictions_insert_limits on public.predictions;
create trigger predictions_insert_limits
  after insert on public.predictions
  referencing new table as new_rows
  for each statement execute function public.predictions_write_limits();

-- The rows before the update too, for the text the statement adds.
drop trigger if exists predictions_update_limits on public.predictions;
create trigger predictions_update_limits
  after update on public.predictions
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.predictions_write_limits();

-- 3b. analytics_events ---------------------------------------------------------

-- received_at is the server's clock (migration 005), but a client could send
-- its own and so step around the day's cap below. It is now always set here.
-- The app never sends it (toWire, src/analytics/flush.ts). Invoker's rights:
-- it reads no table.
create or replace function public.analytics_events_stamp_received()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

comment on function public.analytics_events_stamp_received() is
  'BEFORE INSERT on analytics_events: received_at is the server''s clock, '
  'whatever the client sent. Migration 011.';

drop trigger if exists analytics_events_stamp_received on public.analytics_events;
create trigger analytics_events_stamp_received
  before insert on public.analytics_events
  for each row execute function public.analytics_events_stamp_received();

-- Before each row an insert writes: count the statement's rows in a
-- transaction-local setting, fs.event_rows, and stop at row 101, before that
-- row is stamped or written (final server re-review, K), as
-- predictions_count_rows (3a) and the guest table's counter (section 4) do.
-- Every proposed row is counted, one that then meets a duplicate key
-- included (the app's flush inserts, and counts a duplicate as delivered).
-- The app sends at most 100 rows a request (BATCH_SIZE,
-- src/analytics/flush.ts), so this stop never reaches it. The count starts
-- again at each statement (analytics_events_reset_count, below), is rolled
-- back with a refused statement, and reads a value that isn't a plain count
-- as no count; analytics_events_limits, below, stays the exact check. The
-- same exemption as analytics_events_limits (the owner and the service
-- role), so the README's tests can fill an account as the owner. Fires
-- before analytics_events_stamp_received (name order: '_count_rows' sorts
-- first). Invoker's rights: it reads no table.
create or replace function public.analytics_events_count_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows_per_insert constant integer := 100;
  counted text;
  seen integer;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return new;
  end if;

  counted := pg_catalog.current_setting('fs.event_rows', true);
  if counted is not null and counted ~ '^[0-9]{1,9}$' then
    seen := counted::integer + 1;
  else
    seen := 1;
  end if;

  if seen > max_rows_per_insert then
    raise exception using
      errcode = 'PT413',
      message = format('analytics_events: stopped at row %s; at most %s rows per insert',
                       seen, max_rows_per_insert);
  end if;

  perform pg_catalog.set_config('fs.event_rows', seen::text, true);
  return new;
end;
$$;

comment on function public.analytics_events_count_rows() is
  'BEFORE INSERT (per row) on analytics_events: stops a statement at row 101 '
  '(PT413), before that row is written. Not for the owner or the service role. '
  'Migration 011.';

-- After each insert statement: the count starts again.
create or replace function public.analytics_events_reset_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('fs.event_rows', '0', true);
  return null;
end;
$$;

comment on function public.analytics_events_reset_count() is
  'AFTER INSERT (per statement) on analytics_events: the row count of '
  'analytics_events_count_rows starts again. Migration 011.';

drop trigger if exists analytics_events_count_rows on public.analytics_events;
create trigger analytics_events_count_rows
  before insert on public.analytics_events
  for each row execute function public.analytics_events_count_rows();

drop trigger if exists analytics_events_reset_count on public.analytics_events;
create trigger analytics_events_reset_count
  after insert on public.analytics_events
  for each statement execute function public.analytics_events_reset_count();

-- Makes the day's count below an index scan over one account's rows from
-- today. The table is small (the beta); building it holds inserts for a
-- moment, inside this transaction.
create index if not exists idx_analytics_events_user_received
  on public.analytics_events (user_id, received_at);

-- After each insert statement on analytics_events: at most 100 rows in it
-- (the app's BATCH_SIZE, src/analytics/flush.ts, never more since the first
-- analytics build; analytics_events_count_rows, above, stops a larger
-- statement at row 101 first, and this stays as the exact count), and at
-- most 5,000 rows received today (UTC) per account, this statement's
-- included, counted only up to 5,001.
--
-- The day's cap. The catalogue (src/analytics/events.ts) has 16 events, and
-- most fire once per thing a person does: prediction_logged and
-- prediction_resolved one per log or answer (a very heavy day: 100 of each),
-- share_opened, share_completed and paywall_viewed a few dozen at most,
-- coverage_nudge_shown a few (it has a cooldown), practice_started and
-- practice_completed once each a day, warmup_*, purchase_*,
-- coverage_nudge_accepted, practice_reminder_set and data_exported a
-- handful, coach_requested at most 25 (the Coach's DAILY_CALL_CEILING): about
-- 300. On top of that a phone sends what it queued offline, at most
-- MAX_QUEUED = 2,000 rows (src/db/analytics.ts; a guest's queue joins the
-- account at sign-in the same way). 2,300 is the most a real account sends
-- in a day; 5,000 is twice that. The worst a misused account costs: 5,000
-- rows of at most about 0.55 KB with their four indexes (a 64-character id, a
-- 48-character name, the largest props section 4's rule allows), about
-- 2.75 MB a day.
--
-- For the public key's roles only, and SECURITY DEFINER for the count, both
-- as for predictions above.
create or replace function public.analytics_events_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows_per_insert constant integer := 100;
  max_rows_per_day    constant integer := 5000;
  inserted bigint;
  account uuid;
  received_today bigint;
begin
  if pg_catalog.current_setting('role', true) in ('none', 'service_role') then
    return null;
  end if;

  select count(*) into inserted from new_rows;
  if inserted > max_rows_per_insert then
    raise exception using
      errcode = 'PT413',
      message = format('analytics_events: at most %s rows per insert', max_rows_per_insert);
  end if;

  for account in select distinct n.user_id from new_rows as n loop
    select count(*) into received_today
      from (select 1
              from public.analytics_events as e
             where e.user_id = account
               and e.received_at >= date_trunc('day', now(), 'UTC')
             limit max_rows_per_day + 1) as capped;
    if received_today > max_rows_per_day then
      raise exception using
        errcode = 'PT429',
        message = format('analytics_events: an account sends at most %s events a day; try again after midnight UTC',
                         max_rows_per_day);
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.analytics_events_limits() is
  'AFTER INSERT (per statement) on analytics_events: at most 100 rows per '
  'insert (PT413) and 5,000 rows per account per UTC day (PT429). Migration 011.';

drop trigger if exists analytics_events_limits on public.analytics_events;
create trigger analytics_events_limits
  after insert on public.analytics_events
  referencing new table as new_rows
  for each statement execute function public.analytics_events_limits();

-- ---------------------------------------------------------------------------
-- 4. The guest table, and the props rule
-- ---------------------------------------------------------------------------

-- Before each guest row: count the statement's rows in a transaction-local
-- setting, fs.guest_rows, and stop at row 101, before the 101st row is hashed
-- and indexed. 010's AFTER trigger already refuses more than 100 rows, but
-- only once every row is written; this one stops a request of 10,000 rows
-- at row 101. The setting starts again at each statement (the AFTER trigger
-- below) and is gone at the end of the transaction; a PostgREST request is
-- one statement in one transaction. A value that isn't a plain count is read
-- as no count, never as an error: an error here would be a refused row the
-- app drops (22P02 is in flush.ts's DROP_CODES). 010's trigger stays as the
-- exact check either way.
--
-- On the first row of each statement, a ceiling for the whole table, read
-- from the planner's estimate (pg_class.reltuples, no scan; -1 before the
-- table was first analyzed, which passes). 500,000 rows: a guest row with
-- its three indexes takes about 0.3 KB as the app writes it (a 34-character
-- hashed id, a short name, a props object of a few dozen bytes, two
-- timestamps) and at most about 0.4 KB (four of the longest keys, numbers
-- of 24 characters), so about 150 MB, 200 MB at worst; the free plan's
-- database size quota is 500 MB (a billing quota on a 2 GB disk; migration
-- 012, section 3, says more). The estimate is refreshed by autovacuum and
-- autoanalyze and can trail the true count by about a fifth (autovacuum's
-- default insert threshold is 20% of the table), so inserts stop somewhere
-- between 500,000 and about 600,000 rows (240 MB at worst). At 010's day
-- budget of 20,000 rows, filling it with junk takes at least 25 days. The
-- 2,000,000 first suggested would be about 600 to 800 MB, over the free
-- plan. Real use: a guest's heaviest day is about 50 funnel events (010), a
-- few hundred over months. To raise it with the plan, edit max_table_rows
-- and run this `create or replace function` again. PT429, so the phone stops
-- the sweep and keeps its rows queued (flush.ts).
--
-- SECURITY DEFINER, so the estimate is read whatever anon may see. The
-- setting it writes is not the one its SET clause names (search_path), so it
-- outlives the function call, to the end of the transaction, as a
-- transaction-local setting does.
create or replace function public.guest_analytics_events_count_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows_per_insert constant integer := 100;
  max_table_rows      constant real    := 500000;
  counted text := pg_catalog.current_setting('fs.guest_rows', true);
  seen integer;
  estimated real;
begin
  if counted is not null and counted ~ '^[0-9]{1,9}$' then
    seen := counted::integer + 1;
  else
    seen := 1;
  end if;

  if seen > max_rows_per_insert then
    raise exception using
      errcode = 'PT413',
      message = format('guest_analytics_events: stopped at row %s; at most %s rows per insert',
                       seen, max_rows_per_insert);
  end if;

  if seen = 1 then
    select c.reltuples into estimated
      from pg_catalog.pg_class as c
     where c.oid = tg_relid;
    if estimated > max_table_rows then
      raise exception using
        errcode = 'PT429',
        message = 'guest_analytics_events: the table is at its ceiling; nothing more is counted until it is raised or rows are removed';
    end if;
  end if;

  perform pg_catalog.set_config('fs.guest_rows', seen::text, true);
  return new;
end;
$$;

comment on function public.guest_analytics_events_count_rows() is
  'BEFORE INSERT (per row) on guest_analytics_events: stops a statement at row '
  '101 (PT413), and refuses inserts once the table''s estimated rows pass '
  '500,000 (PT429). Migration 011.';

-- After each insert statement: the count starts again, so a transaction with
-- several inserts (the README's tests, 010's T4) has each counted alone.
-- When 010's limits trigger (which fires first: same timing, name sorts
-- first) refuses the statement, the setting is rolled back with it.
create or replace function public.guest_analytics_events_reset_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('fs.guest_rows', '0', true);
  return null;
end;
$$;

comment on function public.guest_analytics_events_reset_count() is
  'AFTER INSERT (per statement) on guest_analytics_events: the row count of '
  'guest_analytics_events_count_rows starts again. Migration 011.';

-- Before-row triggers fire in name order: _count_rows before 010's
-- _normalize, so row 101 is stopped before it is hashed.
drop trigger if exists guest_analytics_events_count_rows on public.guest_analytics_events;
create trigger guest_analytics_events_count_rows
  before insert on public.guest_analytics_events
  for each row execute function public.guest_analytics_events_count_rows();

drop trigger if exists guest_analytics_events_reset_count on public.guest_analytics_events;
create trigger guest_analytics_events_reset_count
  after insert on public.guest_analytics_events
  for each statement execute function public.guest_analytics_events_reset_count();

-- The props rule, 010's with one more limit: a number is at most 24
-- characters as Postgres writes it. 010 allowed any number between -1e9 and
-- 1e9, which can carry hundreds of digits after the point: a channel for
-- text written as digits. jsonb keeps a number as numeric, written out in
-- full (1e-7 is 0.0000001), never with an exponent.
--
-- Every number the app has ever sent (src/analytics/events.ts and its
-- history, read 2026-11-19; EVENT_PROPS has only grown): question_count,
-- confidence, buckets_used, hour, insight_count, row_count and
-- practice_completed's correct are whole numbers, at most 10 digits under
-- 010's 1e9; warmup_completed's score is a JavaScript number from 0 to 100
-- (the Warmup's mini score, src/engine/warmup.ts), which JavaScript writes
-- without an exponent from 1e-6 up and in at most 17 significant digits, so
-- at most 24 characters (0.00000 and 17 digits); the engine never makes one
-- between 0 and 1e-6 (its confidences are whole numbers from 50 to 100, ten
-- at a time). Booleans (integrity_bonus, prediction_resolved's correct, the
-- plan_* and trial flags) and the 10 enum words are as in 010. Shapes the
-- README checks: {}, {score, question_count}, {surface} for each of card,
-- weekly, yearly, warmup, {confidence, integrity_bonus}, {confidence,
-- correct}, {source}, {plan_annual, plan_monthly, plan_lifetime, trial},
-- {buckets_used}, {correct, question_count}, {hour}, {insight_count},
-- {row_count}.
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
        -- The length first: it is cheap, and it keeps a huge number from
        -- reaching the cast.
        if length((prop.value)::text) > 24 then
          return false;
        end if;
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
  '4 declared keys, each a boolean, a number from -1e9 to 1e9 written in at '
  'most 24 characters, or a declared enum word (src/analytics/events.ts). '
  'Migrations 010 and 011.';

-- A CHECK's "validated" is only true for the rule it was validated under.
-- With the function's body stricter, both props CHECKs are made again, NOT
-- VALID, and validated below against the new rule: a row stored under 010's
-- rule that breaks this one leaves its CHECK NOT VALID with a NOTICE instead
-- of a constraint that claims what isn't so (and that a restore from a dump
-- would then fail on).
alter table public.analytics_events
  drop constraint if exists analytics_events_props_allowed;
alter table public.analytics_events
  add constraint analytics_events_props_allowed
  check (public.analytics_props_ok(props)) not valid;

alter table public.guest_analytics_events
  drop constraint if exists guest_analytics_events_props_allowed;
alter table public.guest_analytics_events
  add constraint guest_analytics_events_props_allowed
  check (public.analytics_props_ok(props)) not valid;

-- ---------------------------------------------------------------------------
-- 5. Validate what is already stored
-- ---------------------------------------------------------------------------

-- Each constraint in its own block, as in 010: a row that breaks one leaves
-- that one NOT VALID (still applied to every new or updated row) and raises
-- a NOTICE naming it, and the migration goes on. The README's queries find
-- the rows.
do $$
declare
  c record;
begin
  for c in
    select t.tbl, t.con
      from (values
        ('public.predictions',            'predictions_created_utc_offset_min_range'),
        ('public.predictions',            'predictions_title_edited_utc_offset_min_range'),
        ('public.predictions',            'predictions_title_bytes'),
        ('public.predictions',            'predictions_reflection_bytes'),
        ('public.analytics_events',       'analytics_events_props_allowed'),
        ('public.guest_analytics_events', 'guest_analytics_events_props_allowed')
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
-- 6. Grants
-- ---------------------------------------------------------------------------

-- `create or replace` keeps a function's grants; repeated so a re-run can't
-- lose the one both props CHECKs need (they call it as the role inserting).
grant execute on function public.analytics_props_ok(jsonb) to anon, authenticated, service_role;
