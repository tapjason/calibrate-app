-- Postgres mirror of the local SQLite predictions table.
--
-- CHECK constraints are duplicated from src/db/migrations/001_initial.ts so
-- the database rejects values the TypeScript layer also rejects. Keep them in
-- sync if either side changes.
--
-- Sync strategy: predictions are last-write-wins by updated_at, set on the
-- client. updated_at defaults to now() only as a safety net for direct edits
-- in the Supabase dashboard.

create table if not exists public.predictions (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  category        text not null check (category in
                    ('work','health','finance','social','personal')),
  confidence      integer not null check (confidence between 0 and 100),
  created_at      timestamptz not null,
  due_date        timestamptz not null,
  status          text not null check (status in
                    ('pending','resolved_yes','resolved_no','skipped')),
  resolved_at     timestamptz,
  reflection      text,
  integrity_bonus boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- Drives the pull cursor query: WHERE user_id = ? AND updated_at > cursor.
create index if not exists idx_predictions_user_updated
  on public.predictions(user_id, updated_at);

-- Row-level security: every row is private to its owning user. Without these
-- policies an authenticated client would see all rows in the table.
alter table public.predictions enable row level security;

drop policy if exists "users read own predictions"   on public.predictions;
drop policy if exists "users insert own predictions" on public.predictions;
drop policy if exists "users update own predictions" on public.predictions;
drop policy if exists "users delete own predictions" on public.predictions;

create policy "users read own predictions"
  on public.predictions for select
  using (auth.uid() = user_id);

create policy "users insert own predictions"
  on public.predictions for insert
  with check (auth.uid() = user_id);

create policy "users update own predictions"
  on public.predictions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own predictions"
  on public.predictions for delete
  using (auth.uid() = user_id);
