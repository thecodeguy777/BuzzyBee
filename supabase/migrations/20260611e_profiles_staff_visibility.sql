-- VAs saw admins/superadmins (and unshared PMs) as "Member": profile reads were
-- limited to self + shares_active_client(), which only matches through
-- assignments rows — staff with no assignment touching the viewer's client were
-- invisible. Staff are internal; let every authenticated user read their
-- profiles. (VA↔VA visibility stays scoped to shared clients, as designed.)
-- Uses the candidate row's own role column — no profiles subquery, no recursion.

drop policy if exists profiles_select_staff on buzzybee.profiles;
create policy profiles_select_staff on buzzybee.profiles
  for select to authenticated
  using (role in ('pm', 'admin', 'superadmin', 'sales'));
