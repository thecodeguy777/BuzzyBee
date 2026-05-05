-- Recovery: clean-slate the clients RLS so superadmin override actually
-- applies. Likely cause of the 403 — stale literal-'admin' check on the
-- old `clients_admin_all` policy alongside the new is_admin()-based one,
-- where the OR isn't resolving the way it should in this project.

drop policy if exists "clients_va_select"   on buzzybee.clients;
drop policy if exists "clients_pm_select"   on buzzybee.clients;
drop policy if exists "clients_pm_update"   on buzzybee.clients;
drop policy if exists "clients_pm_insert"   on buzzybee.clients;
drop policy if exists "clients_admin_all"   on buzzybee.clients;

-- Admin / superadmin: full access. (FOR ALL covers select/insert/update/delete.)
create policy "clients_admin_all"
  on buzzybee.clients for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- VA: see clients they're actively assigned to.
create policy "clients_va_select"
  on buzzybee.clients for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = clients.id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

-- PM: see clients where they're listed in client_pms.
create policy "clients_pm_select"
  on buzzybee.clients for select
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), id));

-- PM: update clients they manage.
create policy "clients_pm_update"
  on buzzybee.clients for update
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), id))
  with check (buzzybee.is_client_pm(auth.uid(), id));

-- PM: create new clients (admin path also covered above).
create policy "clients_pm_insert"
  on buzzybee.clients for insert
  to authenticated
  with check (buzzybee.current_role() = 'pm' or buzzybee.is_admin());
