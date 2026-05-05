-- BuzzyBee Workstation — initial schema
-- Lives in shared Supabase project (alongside MikeSteelv2 in `public`).
-- All Workstation tables go in the `buzzybee` schema for clean isolation.

create schema if not exists buzzybee;
grant usage on schema buzzybee to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- profiles: extends auth.users with role + display info
-- ---------------------------------------------------------------
create table if not exists buzzybee.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'va' check (role in ('va', 'pm', 'admin')),
  timezone text default 'Asia/Manila',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on buzzybee.profiles (role);

alter table buzzybee.profiles enable row level security;

-- A user can read their own profile.
drop policy if exists "profiles_select_own" on buzzybee.profiles;
create policy "profiles_select_own"
  on buzzybee.profiles for select
  to authenticated
  using (auth.uid() = id);

-- A user can update their own profile (role changes blocked at app layer).
drop policy if exists "profiles_update_own" on buzzybee.profiles;
create policy "profiles_update_own"
  on buzzybee.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can see and manage all profiles.
drop policy if exists "profiles_admin_all" on buzzybee.profiles;
create policy "profiles_admin_all"
  on buzzybee.profiles for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from buzzybee.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- PMs can read all profiles (needed to manage their VAs).
drop policy if exists "profiles_pm_select_all" on buzzybee.profiles;
create policy "profiles_pm_select_all"
  on buzzybee.profiles for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.profiles p
      where p.id = auth.uid() and p.role in ('pm', 'admin')
    )
  );

-- ---------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists profiles_set_updated_at on buzzybee.profiles;
create trigger profiles_set_updated_at
  before update on buzzybee.profiles
  for each row execute function buzzybee.tg_set_updated_at();

-- ---------------------------------------------------------------
-- Auto-provision profile on auth.users insert.
-- Reads role + full_name from raw_user_meta_data when present.
-- ---------------------------------------------------------------
create or replace function buzzybee.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $fn$
declare
  meta_role text;
  meta_name text;
begin
  meta_role := nullif(new.raw_user_meta_data->>'role', '');
  meta_name := nullif(new.raw_user_meta_data->>'full_name', '');

  insert into buzzybee.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(meta_name, split_part(new.email, '@', 1)),
    coalesce(meta_role, 'va')
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

-- Trigger lives on auth.users. Drop-and-recreate is safe.
drop trigger if exists on_auth_user_created_buzzybee on auth.users;
create trigger on_auth_user_created_buzzybee
  after insert on auth.users
  for each row execute function buzzybee.handle_new_user();

-- ---------------------------------------------------------------
-- Grants for PostgREST (Supabase API exposure)
-- ---------------------------------------------------------------
grant select, insert, update, delete on all tables in schema buzzybee to authenticated;
grant select on all tables in schema buzzybee to anon;
alter default privileges in schema buzzybee
  grant select, insert, update, delete on tables to authenticated;
