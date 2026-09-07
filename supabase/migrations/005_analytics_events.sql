-- Product analytics events.
--
-- GROWTH_AND_MONETIZATION.md §7 names four metrics and §8 says the freemium
-- premise stands or falls on share rate. This table is what makes those
-- answerable; BUILD_PLAN.md's validation checkpoint reads from it.
--
-- What lands here is a closed list of event names with a small property bag of
-- numbers, booleans and declared enum values. The client enforces that in
-- src/analytics/events.ts, and the CHECK below enforces the shape of the bag
-- again here, because the client is a suggestion once a row is in flight.
--
-- Deliberately NOT here: prediction titles, reflections, any freetext at all.
-- There is no column one could go in.

create table if not exists public.analytics_events (
  -- Client-generated id, so a retried push is idempotent on the primary key.
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  -- Server clock, for spotting devices with wrong clocks and for retention
  -- windows that shouldn't trust client time.
  received_at timestamptz not null default now(),

  constraint analytics_events_props_is_object
    check (jsonb_typeof(props) = 'object'),
  -- A property bag is a handful of counters. Anything larger is either a bug
  -- or an attempt to use this table as a freetext channel.
  constraint analytics_events_props_small
    check (length(props::text) <= 512)
);

create index if not exists idx_analytics_events_user_time
  on public.analytics_events (user_id, created_at desc);

create index if not exists idx_analytics_events_name_time
  on public.analytics_events (name, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "users insert own events" on public.analytics_events;
drop policy if exists "users read own events" on public.analytics_events;

-- Insert-only for the owning user. No update and no delete policy: an event
-- log a client can rewrite is not a log.
create policy "users insert own events"
  on public.analytics_events for insert
  with check (auth.uid() = user_id);

-- Read-back exists so a user can see exactly what was collected about them,
-- and so the client's idempotent upsert can resolve a conflict on its own row.
create policy "users read own events"
  on public.analytics_events for select
  using (auth.uid() = user_id);
