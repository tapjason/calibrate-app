-- Per-user daily Coach call ledger (COACH_AGENT.md §5.7, "per-user daily cost
-- ceiling").
--
-- Why a table and not an in-memory counter like the refine rate limiter: that
-- limiter is per-isolate and best-effort, which is fine for blunting a burst
-- but useless as a *cost* ceiling — Supabase may run several isolates, so the
-- effective ceiling is an unknown multiple, and it resets whenever an isolate
-- recycles. A spend cap that resets on deploy is not a spend cap.
--
-- Written only by the coach Edge Function using the service role, so RLS is
-- enabled with no policies at all: the service role bypasses RLS, and every
-- other client is denied by default. Users never read their own row.

create table if not exists public.coach_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  calls   integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);

alter table public.coach_usage enable row level security;

-- Atomic increment-and-read. Doing this in one statement rather than
-- read-then-write closes the race where two concurrent requests both observe
-- the same count and both pass the ceiling check.
--
-- Returns the call count INCLUDING this one, so the caller compares against
-- the ceiling directly.
create or replace function public.bump_coach_usage(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.coach_usage (user_id, day, calls)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set calls = public.coach_usage.calls + 1
  returning calls;
$$;

revoke all on function public.bump_coach_usage(uuid) from public, anon, authenticated;

-- Granted back explicitly rather than relying on inherited defaults. CREATE
-- FUNCTION grants EXECUTE to PUBLIC, and the revoke above takes that away — if
-- service_role's access came via PUBLIC rather than its own grant, every
-- bump_coach_usage call would fail with "permission denied", the coach
-- function's fail-closed branch would turn that into a 500, and Coach would be
-- 100% dead in production with nothing but a server-side console.error to say
-- so. Not worth leaving to a default that may or may not have applied.
grant execute on function public.bump_coach_usage(uuid) to service_role;
