-- 0001_profiles.sql
-- One profile row per auth user. RLS is the single authorization layer:
-- a user can read and write ONLY their own profile. profiles.id IS the auth
-- user id (so auth.uid() = id), which is already the primary key = indexed.

create table public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- (select auth.uid()) — parenthesised so Postgres caches it per-statement (docs: ~95-99% faster).
create policy "read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- No DELETE policy on purpose: profiles are removed only by the auth.users cascade.

-- REQUIRED under Supabase's always-revoked API-exposure default: policies alone do
-- NOT grant access — without GRANTs the authenticated role gets "permission denied".
-- The GRANT list matches the policy operations (no delete policy → no delete grant).
grant select, insert, update on public.profiles to authenticated;

-- Auto-create the profile row when a new auth user signs up.
-- security definer + empty search_path per Supabase hardening guidance.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest on every write.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.created_at = old.created_at; -- system-managed: clients cannot rewrite it via RLS
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Trigger functions run inside the trigger with the owner's privileges, never via
-- the API. Revoke EXECUTE so they are not exposed as PostgREST RPC endpoints —
-- get_advisors flags a public SECURITY DEFINER function callable by anon/authenticated.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
