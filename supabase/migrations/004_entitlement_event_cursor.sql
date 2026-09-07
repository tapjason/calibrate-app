-- Out-of-order protection for the RevenueCat webhook.
--
-- RevenueCat retries failed deliveries and does not promise ordering, so a
-- RENEWAL from 10:00 can arrive after the EXPIRATION from 10:05. Without a
-- cursor the later-arriving-but-older event wins and a lapsed user keeps Plus
-- (or, worse, a paying one loses it) until the next event happens to land.
--
-- last_event_ms is the RevenueCat event_timestamp_ms of the event that last
-- wrote this row. The webhook's upsert refuses to apply anything older.
-- Nullable, because rows written before this migration have no cursor and
-- should accept the next event whatever its timestamp.

alter table public.entitlements
  add column if not exists last_event_ms bigint;

comment on column public.entitlements.last_event_ms is
  'RevenueCat event_timestamp_ms of the last event applied to this row. '
  'Guards against out-of-order webhook delivery.';

-- The webhook's write path.
--
-- A function rather than a plain upsert because the guard is conditional:
-- PostgREST cannot express "update only if the incoming event is newer", and
-- doing it as read-then-write in the Edge Function would race two deliveries
-- against each other.
--
-- SECURITY DEFINER so the service role's call runs with the owner's rights;
-- the entitlements table has no write policy at all, by design (a user who can
-- write this table can grant themselves Plus).
create or replace function public.apply_entitlement_event(
  p_user_id    uuid,
  p_is_plus    boolean,
  p_source     text,
  p_expires_at timestamptz,
  p_event_ms   bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (
    user_id, is_plus, source, expires_at, updated_at, last_event_ms
  )
  values (p_user_id, p_is_plus, p_source, p_expires_at, now(), p_event_ms)
  on conflict (user_id) do update
    set is_plus       = excluded.is_plus,
        source        = excluded.source,
        expires_at    = excluded.expires_at,
        updated_at    = now(),
        last_event_ms = excluded.last_event_ms
    -- <= rather than <, so a retried delivery of the same event is
    -- idempotent instead of being dropped as "not newer".
    where entitlements.last_event_ms is null
       or entitlements.last_event_ms <= excluded.last_event_ms;
exception
  when foreign_key_violation then
    -- The event names a user that no longer exists (deleted account). Nothing
    -- to record. Swallowing it keeps the webhook from returning 500 and
    -- putting RevenueCat into a retry loop that can never succeed.
    raise notice 'entitlement event for unknown user %', p_user_id;
end;
$$;

-- Callable by the service role only. The anon and authenticated roles must
-- never reach it: it writes the table that decides who is Plus.
revoke all on function public.apply_entitlement_event(
  uuid, boolean, text, timestamptz, bigint
) from public, anon, authenticated;
