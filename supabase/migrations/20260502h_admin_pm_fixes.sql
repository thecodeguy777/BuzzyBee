-- Consolidated admin-role + PM-assignment fixes.
--
-- Symptoms this resolves:
--   1. Searching for a PM in the Client drawer only returns the superadmin
--      themselves — Mark/Dennis don't appear. Cause: profiles_admin_all
--      and/or profiles_pm_see_pm not in place, so the superadmin can't
--      read other profiles.
--   2. Admins/superadmins can't write to buzzybee.projects or
--      buzzybee.project_members. Cause: those policies still hard-code
--      role = 'admin' instead of using is_admin().
--
-- All idempotent.

-- ---------------------------------------------------------------
-- 1. profiles RLS — admin/superadmin full access + PM↔PM visibility.
-- ---------------------------------------------------------------
drop policy if exists "profiles_admin_all" on buzzybee.profiles;
create policy "profiles_admin_all"
  on buzzybee.profiles for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

drop policy if exists "profiles_pm_see_pm" on buzzybee.profiles;
create policy "profiles_pm_see_pm"
  on buzzybee.profiles for select
  to authenticated
  using (
    profiles.role in ('pm', 'admin', 'superadmin')
    and buzzybee.current_role() in ('pm', 'admin', 'superadmin')
  );

-- ---------------------------------------------------------------
-- 2. projects RLS — admin/superadmin full access via is_admin().
-- ---------------------------------------------------------------
drop policy if exists "projects_admin_all" on buzzybee.projects;
create policy "projects_admin_all"
  on buzzybee.projects for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- ---------------------------------------------------------------
-- 3. project_members RLS — admin/superadmin full access via is_admin().
-- ---------------------------------------------------------------
drop policy if exists "project_members_admin_all" on buzzybee.project_members;
create policy "project_members_admin_all"
  on buzzybee.project_members for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- ---------------------------------------------------------------
-- 4. Make sure Mark + Dennis are present with correct roles. The earlier
--    seed migrations sometimes lose to a manual role change; re-asserting
--    here is safe (idempotent).
-- ---------------------------------------------------------------
update buzzybee.profiles set role = 'pm'
  where email = 'mark@buzzybee.ph' and role not in ('pm', 'admin', 'superadmin');

update buzzybee.profiles set role = 'admin'
  where email = 'dennis@buzzybee.ph' and role not in ('admin', 'superadmin');

update buzzybee.profiles set role = 'superadmin'
  where email = 'jayson.remigio7@gmail.com';
