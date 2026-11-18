-- Discard the name and picture a sign-in provider sends (step 192, decided by
-- the owner 2026-11-18; docs/design/research/sign-in-providers-2026-11.md §3).
--
-- Google sign-in asks Google for `email` and `profile`, and Supabase can't be
-- told to leave `profile` out. So on every Google sign-in Supabase writes the
-- person's name and a picture URL into auth.users.raw_user_meta_data and
-- auth.identities.identity_data. Nothing in the app reads either. The two
-- triggers below remove those keys from each row as it is written, so they
-- are never kept, and App Privacy's Name row can stay No.
--
-- Removed: name, full_name, picture, avatar_url, given_name, family_name,
-- nickname, preferred_username, user_name. Everything else stays (iss, sub,
-- email, email_verified, phone_verified, provider_id, …):
-- auth.identities.email is generated from identity_data's email, and Supabase
-- finds an identity again by its provider id.
--
-- Two promises:
--   1. It never blocks a sign-in. The function catches every error and
--      returns the row as it came.
--   2. It applies even if the hosted project refuses a trigger on an auth
--      table. Each trigger is created in its own block, which catches the
--      refusal and raises a NOTICE naming the trigger that wasn't created, so
--      `db push` succeeds either way. The query at the end says which exist.
--
-- Both triggers fire on update as well as insert: Supabase rewrites both
-- columns from the provider's answer on every sign-in, so a row written
-- before this migration loses the keys at that account's next sign-in.
--
-- SECURITY DEFINER with an empty search_path, like Supabase's own examples
-- of triggers on auth tables: it runs with its owner's rights whichever role
-- Supabase Auth writes as, and every name it uses comes from pg_catalog. A
-- trigger function can't be called on its own ("trigger functions can only
-- be called as triggers"), so nothing is exposed through the API. Execute
-- isn't revoked: if the role that fires the trigger ever needed it, a revoke
-- would turn the promise above into a failed sign-in.
--
-- Not applied to the live project yet. GOOGLE_SIGN_IN_ENABLED in
-- src/constants/app.ts stays false until the owner has set Google up.

create or replace function public.strip_provider_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_keys constant text[] := array[
    'name', 'full_name', 'picture', 'avatar_url', 'given_name',
    'family_name', 'nickname', 'preferred_username', 'user_name'
  ];
  stripped jsonb;
begin
  begin
    if tg_table_schema = 'auth' and tg_table_name = 'users' then
      if jsonb_typeof(new.raw_user_meta_data) = 'object' then
        stripped := new.raw_user_meta_data - profile_keys;
        new.raw_user_meta_data := stripped;
      end if;
    elsif tg_table_schema = 'auth' and tg_table_name = 'identities' then
      if jsonb_typeof(new.identity_data) = 'object' then
        stripped := new.identity_data - profile_keys;
        new.identity_data := stripped;
      end if;
    end if;
  exception
    when others then
      -- Never block a sign-in. The new value is assigned only once it is
      -- built, as the last step of each branch, so on any error the row goes
      -- in as it came.
      return new;
  end;
  return new;
end;
$$;

comment on function public.strip_provider_profile() is
  'Removes the name and picture keys a sign-in provider sends from '
  'auth.users.raw_user_meta_data and auth.identities.identity_data. '
  'Never raises (step 192, migration 009).';

-- auth.users: the account's metadata.
do $$
begin
  drop trigger if exists users_strip_provider_profile on auth.users;
  create trigger users_strip_provider_profile
    before insert or update on auth.users
    for each row execute function public.strip_provider_profile();
exception
  when insufficient_privilege then
    raise notice 'Trigger users_strip_provider_profile on auth.users was not created (insufficient privilege): %', sqlerrm;
  when others then
    raise notice 'Trigger users_strip_provider_profile on auth.users was not created (%): %', sqlstate, sqlerrm;
end;
$$;

-- auth.identities: each provider's copy of what it sent.
do $$
begin
  drop trigger if exists identities_strip_provider_profile on auth.identities;
  create trigger identities_strip_provider_profile
    before insert or update on auth.identities
    for each row execute function public.strip_provider_profile();
exception
  when insufficient_privilege then
    raise notice 'Trigger identities_strip_provider_profile on auth.identities was not created (insufficient privilege): %', sqlerrm;
  when others then
    raise notice 'Trigger identities_strip_provider_profile on auth.identities was not created (%): %', sqlstate, sqlerrm;
end;
$$;

-- Verification, for the owner (Supabase dashboard → SQL Editor). Keys only:
-- none of these queries shows a value.
--
-- 1. Which of the two triggers exist. Two rows, each with tgenabled 'O', means
--    both are on; a missing row means the project refused it, and `db push`
--    printed a NOTICE naming it.
--
--   select tgrelid::regclass as on_table, tgname, tgenabled
--     from pg_trigger
--    where tgname in ('users_strip_provider_profile',
--                     'identities_strip_provider_profile');
--
-- 2. After a test Google sign-in: the keys kept for the latest Google
--    identity and its account. Neither list should hold name, full_name,
--    picture, avatar_url, given_name, family_name, nickname,
--    preferred_username or user_name.
--
--   with g as (
--     select i.user_id, i.identity_data
--       from auth.identities i
--      where i.provider = 'google'
--      order by i.created_at desc
--      limit 1
--   )
--   select 'auth.users.raw_user_meta_data' as kept_in,
--          array(select jsonb_object_keys(u.raw_user_meta_data) order by 1) as keys
--     from g join auth.users u on u.id = g.user_id
--   union all
--   select 'auth.identities.identity_data (google)',
--          array(select jsonb_object_keys(g.identity_data) order by 1)
--     from g;
--
-- 3. Across every account: how many rows still hold any of those keys.
--    Expect 0 and 0 (a row written before the migration is cleaned at that
--    account's next sign-in).
--
--   select
--     (select count(*) from auth.users
--       where raw_user_meta_data ?| array['name', 'full_name', 'picture',
--         'avatar_url', 'given_name', 'family_name', 'nickname',
--         'preferred_username', 'user_name']) as users_with_profile_keys,
--     (select count(*) from auth.identities
--       where identity_data ?| array['name', 'full_name', 'picture',
--         'avatar_url', 'given_name', 'family_name', 'nickname',
--         'preferred_username', 'user_name']) as identities_with_profile_keys;
