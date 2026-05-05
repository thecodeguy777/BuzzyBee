-- Fix infinite recursion in profiles RLS.
-- The previous admin/PM policies queried buzzybee.profiles inside their USING
-- clause, which re-triggered the same policy. We replace them with a
-- SECURITY DEFINER helper that reads the role outside RLS.

create or replace function buzzybee.current_role()
returns text
language sql
stable
security definer
set search_path = buzzybee, public
as $fn$
  select role from buzzybee.profiles where id = auth.uid() limit 1;
$fn$;

grant execute on function buzzybee.current_role() to authenticated, anon;

drop policy if exists "profiles_admin_all" on buzzybee.profiles;
create policy "profiles_admin_all"
  on buzzybee.profiles for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

drop policy if exists "profiles_pm_select_all" on buzzybee.profiles;
create policy "profiles_pm_select_all"
  on buzzybee.profiles for select
  to authenticated
  using (buzzybee.current_role() in ('pm', 'admin'));
