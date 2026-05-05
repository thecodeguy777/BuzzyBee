-- Add 'superadmin' as a valid profiles.role and a helper that treats both
-- 'admin' and 'superadmin' as equivalent for permission checks. This way
-- existing 'admin'-gated logic keeps working, and 'superadmin' is reserved
-- for the human(s) running the show.

-- ---------------------------------------------------------------
-- 1. Expand the role check constraint
-- ---------------------------------------------------------------
alter table buzzybee.profiles drop constraint if exists profiles_role_check;
alter table buzzybee.profiles
  add constraint profiles_role_check
  check (role in ('va', 'pm', 'admin', 'superadmin'));

-- ---------------------------------------------------------------
-- 2. is_admin() — true for admin OR superadmin. SECURITY DEFINER so it
-- skips the calling user's RLS, which keeps it usable inside policy USINGs
-- without recursion.
-- ---------------------------------------------------------------
create or replace function buzzybee.is_admin()
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $isadmin$
  select coalesce(
    (select role in ('admin', 'superadmin')
       from buzzybee.profiles
       where id = auth.uid()
       limit 1),
    false
  );
$isadmin$;

grant execute on function buzzybee.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------
-- 3. Replace tickets/ticket_comments admin policies to use the helper
-- so superadmins also get full access.
-- ---------------------------------------------------------------
drop policy if exists "tickets_admin_all" on buzzybee.tickets;
create policy "tickets_admin_all"
  on buzzybee.tickets for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

drop policy if exists "ticket_comments_admin_all" on buzzybee.ticket_comments;
create policy "ticket_comments_admin_all"
  on buzzybee.ticket_comments for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- ---------------------------------------------------------------
-- 4. Promote the founding superadmin. Edit the email if needed.
-- ---------------------------------------------------------------
update buzzybee.profiles
   set role = 'superadmin'
 where email = 'jayson.remigio7@gmail.com';
