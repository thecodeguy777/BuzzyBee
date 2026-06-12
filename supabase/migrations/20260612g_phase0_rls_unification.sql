-- Phase 0 of the roles plan: ONE definition of "which clients can this user
-- touch" — buzzybee.accessible_client_ids() — applied to every table that
-- still had authenticated-wide reads (the CRM generation: companies, contacts,
-- deals, links, activities, campaigns, recipients, plus task_statuses).
--
-- Staff impact: admins unchanged. PMs/VAs now READ only their clients' CRM
-- (the UI already worked that way; the API no longer over-shares). PM writes
-- tighten from "any client" to "their clients". VAs GAIN the ability to log
-- CRM activities (calls/emails/notes) on assigned clients — their dials are
-- the activity stream.
--
-- Client-role groundwork: 'client' joins the role enum and profiles.client_id
-- maps a client user to their one workspace. No client users exist yet —
-- Phase 1 is purely additive on top of this.

-- ── 1. Client role exists in the schema ───────────────────────────────────────
alter table buzzybee.profiles drop constraint if exists profiles_role_check;
alter table buzzybee.profiles add constraint profiles_role_check
  check (role in ('va', 'pm', 'admin', 'superadmin', 'sales', 'client'));
alter table buzzybee.profiles
  add column if not exists client_id uuid references buzzybee.clients(id) on delete set null;
create index if not exists profiles_client_idx
  on buzzybee.profiles(client_id) where client_id is not null;

-- ── 2. The law of the land ────────────────────────────────────────────────────
create or replace function buzzybee.is_staff()
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$ select coalesce(buzzybee.current_role() in ('va','pm','admin','superadmin','sales'), false) $$;
grant execute on function buzzybee.is_staff() to authenticated;

-- Every workspace this user may touch. PM membership honors BOTH mapping
-- sources (assignments.pm_id and the older client_pms table).
create or replace function buzzybee.accessible_client_ids()
returns setof uuid
language sql stable security definer
set search_path = buzzybee, public
as $$
  select c.id from buzzybee.clients c
    where buzzybee.current_role() in ('admin', 'superadmin')
  union
  select a.client_id from buzzybee.assignments a
    where a.status = 'active' and (a.va_id = auth.uid() or a.pm_id = auth.uid())
  union
  select cp.client_id from buzzybee.client_pms cp
    where cp.pm_id = auth.uid()
  union
  select p.client_id from buzzybee.profiles p
    where p.id = auth.uid() and p.role = 'client' and p.client_id is not null
$$;
grant execute on function buzzybee.accessible_client_ids() to authenticated;

-- Manage = restructure data in a workspace: admins anywhere, PMs on theirs.
create or replace function buzzybee.can_manage_client(p_client uuid)
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$
  select buzzybee.is_admin()
      or buzzybee.is_client_pm(auth.uid(), p_client)
      or exists (select 1 from buzzybee.assignments a
                 where a.client_id = p_client and a.pm_id = auth.uid() and a.status = 'active')
$$;
grant execute on function buzzybee.can_manage_client(uuid) to authenticated;

-- ── 3. CRM: staff-only + accessible. Client users get a portal, never the
--        pipeline (it contains other prospects and their own deal record). ───

-- companies (client_id directly)
drop policy if exists crm_companies_read on buzzybee.crm_companies;
drop policy if exists crm_companies_write on buzzybee.crm_companies;
create policy crm_companies_read on buzzybee.crm_companies
  for select to authenticated
  using (buzzybee.is_staff() and client_id in (select buzzybee.accessible_client_ids()));
create policy crm_companies_write on buzzybee.crm_companies
  for all to authenticated
  using (buzzybee.can_manage_client(client_id))
  with check (buzzybee.can_manage_client(client_id));

-- deals (client_id directly)
drop policy if exists crm_deals_read on buzzybee.crm_deals;
drop policy if exists crm_deals_write on buzzybee.crm_deals;
create policy crm_deals_read on buzzybee.crm_deals
  for select to authenticated
  using (buzzybee.is_staff() and client_id in (select buzzybee.accessible_client_ids()));
create policy crm_deals_write on buzzybee.crm_deals
  for all to authenticated
  using (buzzybee.can_manage_client(client_id))
  with check (buzzybee.can_manage_client(client_id));

-- contacts (derive through the company; companies RLS scopes the subquery)
drop policy if exists crm_contacts_read on buzzybee.crm_contacts;
drop policy if exists crm_contacts_write on buzzybee.crm_contacts;
create policy crm_contacts_read on buzzybee.crm_contacts
  for select to authenticated
  using (buzzybee.is_staff()
         and exists (select 1 from buzzybee.crm_companies c where c.id = company_id));
create policy crm_contacts_write on buzzybee.crm_contacts
  for all to authenticated
  using (exists (select 1 from buzzybee.crm_companies c
                 where c.id = company_id and buzzybee.can_manage_client(c.client_id)))
  with check (exists (select 1 from buzzybee.crm_companies c
                      where c.id = company_id and buzzybee.can_manage_client(c.client_id)));

-- deal ↔ task links (derive through the deal)
drop policy if exists crm_deal_tasks_read on buzzybee.crm_deal_tasks;
drop policy if exists crm_deal_tasks_write on buzzybee.crm_deal_tasks;
create policy crm_deal_tasks_read on buzzybee.crm_deal_tasks
  for select to authenticated
  using (buzzybee.is_staff()
         and exists (select 1 from buzzybee.crm_deals d where d.id = deal_id));
create policy crm_deal_tasks_write on buzzybee.crm_deal_tasks
  for all to authenticated
  using (exists (select 1 from buzzybee.crm_deals d
                 where d.id = deal_id and buzzybee.can_manage_client(d.client_id)))
  with check (exists (select 1 from buzzybee.crm_deals d
                      where d.id = deal_id and buzzybee.can_manage_client(d.client_id)));

-- activities: reads for staff with access; INSERTS for any staff with access
-- (the VA carve-out — calls and emails ARE the activity stream); restructuring
-- (update/delete) stays with managers.
drop policy if exists crm_deal_activities_read on buzzybee.crm_deal_activities;
drop policy if exists crm_deal_activities_write on buzzybee.crm_deal_activities;
create policy crm_deal_activities_read on buzzybee.crm_deal_activities
  for select to authenticated
  using (buzzybee.is_staff()
         and exists (select 1 from buzzybee.crm_companies c where c.id = company_id));
create policy crm_deal_activities_insert on buzzybee.crm_deal_activities
  for insert to authenticated
  with check (buzzybee.is_staff()
              and exists (select 1 from buzzybee.crm_companies c
                          where c.id = company_id
                            and c.client_id in (select buzzybee.accessible_client_ids())));
create policy crm_deal_activities_update on buzzybee.crm_deal_activities
  for update to authenticated
  using (exists (select 1 from buzzybee.crm_companies c
                 where c.id = company_id and buzzybee.can_manage_client(c.client_id)))
  with check (exists (select 1 from buzzybee.crm_companies c
                      where c.id = company_id and buzzybee.can_manage_client(c.client_id)));
create policy crm_deal_activities_delete on buzzybee.crm_deal_activities
  for delete to authenticated
  using (exists (select 1 from buzzybee.crm_companies c
                 where c.id = company_id and buzzybee.can_manage_client(c.client_id)));

-- campaigns (client_id directly)
drop policy if exists crm_campaigns_read on buzzybee.crm_campaigns;
drop policy if exists crm_campaigns_write on buzzybee.crm_campaigns;
create policy crm_campaigns_read on buzzybee.crm_campaigns
  for select to authenticated
  using (buzzybee.is_staff() and client_id in (select buzzybee.accessible_client_ids()));
create policy crm_campaigns_write on buzzybee.crm_campaigns
  for all to authenticated
  using (buzzybee.can_manage_client(client_id))
  with check (buzzybee.can_manage_client(client_id));

-- recipients (derive through the campaign)
drop policy if exists crm_campaign_recipients_read on buzzybee.crm_campaign_recipients;
drop policy if exists crm_campaign_recipients_write on buzzybee.crm_campaign_recipients;
create policy crm_campaign_recipients_read on buzzybee.crm_campaign_recipients
  for select to authenticated
  using (buzzybee.is_staff()
         and exists (select 1 from buzzybee.crm_campaigns c where c.id = campaign_id));
create policy crm_campaign_recipients_write on buzzybee.crm_campaign_recipients
  for all to authenticated
  using (exists (select 1 from buzzybee.crm_campaigns c
                 where c.id = campaign_id and buzzybee.can_manage_client(c.client_id)))
  with check (exists (select 1 from buzzybee.crm_campaigns c
                      where c.id = campaign_id and buzzybee.can_manage_client(c.client_id)));

-- email templates: unify onto the same helpers (the 20260612c policies missed
-- PMs mapped via client_pms).
drop policy if exists crm_email_templates_read on buzzybee.crm_email_templates;
drop policy if exists crm_email_templates_write on buzzybee.crm_email_templates;
create policy crm_email_templates_read on buzzybee.crm_email_templates
  for select to authenticated
  using (buzzybee.is_staff() and client_id in (select buzzybee.accessible_client_ids()));
create policy crm_email_templates_write on buzzybee.crm_email_templates
  for all to authenticated
  using (buzzybee.can_manage_client(client_id))
  with check (buzzybee.can_manage_client(client_id));

-- ── 4. task_statuses: was readable by ANY authenticated user (qual: true) —
--        column labels leak workspace context. Scope through projects RLS. ───
drop policy if exists task_statuses_select on buzzybee.task_statuses;
create policy task_statuses_select on buzzybee.task_statuses
  for select to authenticated
  using (exists (select 1 from buzzybee.projects p where p.id = project_id));
