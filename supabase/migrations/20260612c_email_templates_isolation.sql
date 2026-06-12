-- Templates are client-confidential. A template written for one client
-- (pricing, strategy, voice) must never surface in another client's workspace
-- — HiveMind workspaces can belong to different companies. Kills the
-- "shared across workspaces" option from 20260612b entirely:
--   • client_id becomes required
--   • reads need an active assignment on that client (admins excepted)
--   • writes are pm/admin, and PMs only within clients they're assigned to

delete from buzzybee.crm_email_templates where client_id is null;
alter table buzzybee.crm_email_templates alter column client_id set not null;

drop policy if exists crm_email_templates_read on buzzybee.crm_email_templates;
drop policy if exists crm_email_templates_write on buzzybee.crm_email_templates;

create policy crm_email_templates_read on buzzybee.crm_email_templates
  for select to authenticated using (
    exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
    or exists (
      select 1 from buzzybee.assignments a
      where a.client_id = crm_email_templates.client_id
        and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid())
    )
  );

create policy crm_email_templates_write on buzzybee.crm_email_templates
  for all to authenticated
  using (
    exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
    or (
      exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role = 'pm')
      and exists (
        select 1 from buzzybee.assignments a
        where a.client_id = crm_email_templates.client_id
          and a.status = 'active'
          and a.pm_id = auth.uid()
      )
    )
  )
  with check (
    exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))
    or (
      exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role = 'pm')
      and exists (
        select 1 from buzzybee.assignments a
        where a.client_id = crm_email_templates.client_id
          and a.status = 'active'
          and a.pm_id = auth.uid()
      )
    )
  );
