-- The real reason adding Mark as a PM has been failing: profiles RLS still
-- uses the literal 'admin' string, so superadmin doesn't bypass profile
-- visibility. Mark's profile is invisible to Jayson → picker comes back
-- empty → upsert never runs.
--
-- Fix:
--   1. profiles_admin_all uses buzzybee.is_admin() so admin AND superadmin
--      see everything.
--   2. NEW profiles_pm_see_pm — any pm/admin/superadmin can see profiles of
--      other pm/admin/superadmin users (they need each other to coordinate
--      on clients).
--   3. Promote Dennis to admin. The earlier seed migrations
--      (20260502_seed_pm_accounts.sql and 20260502e_unblock.sql) keep
--      forcing his role back to 'pm' on every re-run, which is why he kept
--      reverting.

-- 1. Admin policy → use the helper.
drop policy if exists "profiles_admin_all" on buzzybee.profiles;
create policy "profiles_admin_all"
  on buzzybee.profiles for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- 2. PMs can see other PMs (and admins).
drop policy if exists "profiles_pm_see_pm" on buzzybee.profiles;
create policy "profiles_pm_see_pm"
  on buzzybee.profiles for select
  to authenticated
  using (
    profiles.role in ('pm', 'admin', 'superadmin')
    and buzzybee.current_role() in ('pm', 'admin', 'superadmin')
  );

-- 3. Promote Dennis. Idempotent.
update buzzybee.profiles
   set role = 'admin'
 where email = 'dennis@buzzybee.ph';
