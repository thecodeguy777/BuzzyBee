-- Bootstrap fixes for the PM ↔ client relationship:
--   1. Let superadmins (not just 'admin' literal) create clients.
--   2. Let a user self-add as primary PM when a client has no primary yet —
--      otherwise the very first PM could never claim a freshly-created
--      client (only an admin could).

drop policy if exists "clients_pm_insert" on buzzybee.clients;
create policy "clients_pm_insert"
  on buzzybee.clients for insert
  to authenticated
  with check (buzzybee.current_role() = 'pm' or buzzybee.is_admin());

drop policy if exists "client_pms_self_bootstrap" on buzzybee.client_pms;
create policy "client_pms_self_bootstrap"
  on buzzybee.client_pms for insert
  to authenticated
  with check (
    pm_id = auth.uid()
    and is_primary = true
    and not exists (
      select 1 from buzzybee.client_pms cp
      where cp.client_id = client_pms.client_id
        and cp.is_primary
    )
  );
