-- Usage events from people who haven't signed in (decided 2026-11-03, D43).
--
-- Until now a guest's events waited on the phone and went up only with an
-- account, so the funnel (warmup_completed / warmup_started, and the share
-- rate) measured the signed-in, which reads high. These rows count the rest.
--
-- Nothing here identifies anyone: no user id, no install id, no device id.
-- A row is an event name, its small bag of numbers, and when it happened.
-- Two rows can't be tied to the same person, so a guest's rows can't be
-- deleted on request either, and there is nothing to tie them to.
-- The client sends only the funnel events (GUEST_EVENT_NAMES in
-- src/analytics/events.ts); the CHECK below holds the same list.
--
-- Anyone with the public anon key can insert. That's the price of counting
-- people with no account. The checks keep a row tiny and on the list, and
-- nobody but the service role can read the table back.
--
-- Not applied to the live project yet. GUEST_ANALYTICS in
-- src/constants/app.ts stays false until it is.

create table if not exists public.guest_analytics_events (
  -- Client-generated, so a retried push is idempotent on the primary key.
  -- Random, and carries nothing about the person (src/analytics/track.ts).
  id          text primary key,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null,
  received_at timestamptz not null default now(),

  constraint guest_analytics_events_id_short
    check (length(id) <= 64),
  constraint guest_analytics_events_known_name
    check (name in (
      'warmup_started', 'warmup_completed',
      'prediction_logged', 'prediction_resolved',
      'share_opened', 'share_completed',
      'practice_started', 'practice_completed'
    )),
  constraint guest_analytics_events_props_is_object
    check (jsonb_typeof(props) = 'object'),
  constraint guest_analytics_events_props_small
    check (length(props::text) <= 512)
);

create index if not exists idx_guest_analytics_events_name_time
  on public.guest_analytics_events (name, created_at desc);

alter table public.guest_analytics_events enable row level security;

drop policy if exists "guests insert events" on public.guest_analytics_events;

-- Insert only, and only for a caller with no session. A signed-in person's
-- events belong in analytics_events, under their account. No select, update
-- or delete policy: the client can neither read the table nor rewrite it.
create policy "guests insert events"
  on public.guest_analytics_events for insert
  to anon
  with check (true);
