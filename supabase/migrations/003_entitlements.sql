-- Server-side entitlement mirror.
--
-- Until this existed, the Plus gate lived ONLY in src/ai/coach.ts. The coach
-- Edge Function verified a JWT but never asked whether that user had paid, so
-- any signed-in free user — or anyone posting to the endpoint directly — got
-- the Plus feature and burned OpenAI tokens up to the daily ceiling. A client
-- -side check on a paid inference endpoint is a suggestion, not a gate.
--
-- Shape mirrors the Entitlement type in src/types/index.ts and the local
-- SQLite mirror in src/db/migrations/004_entitlements.ts. RevenueCat remains
-- the source of truth; this table is what the server can consult synchronously.
-- It is written by the service role (a RevenueCat webhook, when billing lands),
-- never by the client — otherwise a user could grant themselves Plus.
--
-- Absence of a row means FREE, matching the cardinal rule in CLAUDE.md: the
-- app fails to free, never to Plus.

create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  is_plus    boolean not null default false,
  source     text not null default 'none'
               check (source in ('none','trial','monthly','annual','lifetime')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

drop policy if exists "users read own entitlement" on public.entitlements;

-- Read-only to the owning user. There is deliberately no insert/update/delete
-- policy: writes come from the service role alone.
create policy "users read own entitlement"
  on public.entitlements for select
  using (auth.uid() = user_id);
