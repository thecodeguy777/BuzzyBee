-- CRM field parity + activity timeline groundwork (partner feedback):
-- HubSpot-style record fields on companies/contacts, Create/Last-Activity
-- dates, and company-level activities (notes, calls, meetings) — today
-- activities only hang off deals, so a company has no timeline of its own.

alter table buzzybee.crm_companies
  add column if not exists address          text,
  add column if not exists city             text,
  add column if not exists country          text,
  add column if not exists employees        integer,
  add column if not exists annual_revenue   numeric,
  add column if not exists linkedin         text,
  add column if not exists last_activity_at timestamptz;

-- role already covers "title"; created_at already covers "create date".
alter table buzzybee.crm_contacts
  add column if not exists address          text,
  add column if not exists city             text,
  add column if not exists country          text,
  add column if not exists last_activity_at timestamptz;

-- Generalize the activity log: every activity belongs to a company; deal_id
-- becomes optional (company-level notes/calls), contact_id optionally pins the
-- person it was with. Existing rows backfill company_id through their deal.
alter table buzzybee.crm_deal_activities
  add column if not exists company_id uuid references buzzybee.crm_companies(id) on delete cascade,
  add column if not exists contact_id uuid references buzzybee.crm_contacts(id) on delete set null;
alter table buzzybee.crm_deal_activities alter column deal_id drop not null;

update buzzybee.crm_deal_activities a
set company_id = d.company_id
from buzzybee.crm_deals d
where d.id = a.deal_id and a.company_id is null;

-- Deal-only inserts (existing client code) keep working: derive company_id
-- before the not-null check runs.
create or replace function buzzybee.crm_activity_fill_company()
returns trigger language plpgsql
set search_path to ''
as $$
begin
  if new.company_id is null and new.deal_id is not null then
    select d.company_id into new.company_id from buzzybee.crm_deals d where d.id = new.deal_id;
  end if;
  return new;
end $$;

drop trigger if exists crm_activity_fill_company on buzzybee.crm_deal_activities;
create trigger crm_activity_fill_company
before insert on buzzybee.crm_deal_activities
for each row execute function buzzybee.crm_activity_fill_company();

alter table buzzybee.crm_deal_activities alter column company_id set not null;

create index if not exists crm_acts_company_idx
  on buzzybee.crm_deal_activities(company_id, created_at desc);

-- Last Activity = most recent logged engagement. SECURITY DEFINER so the bump
-- isn't subject to the actor's row policies.
create or replace function buzzybee.crm_activity_touch()
returns trigger language plpgsql security definer
set search_path to ''
as $$
begin
  update buzzybee.crm_companies
    set last_activity_at = greatest(coalesce(last_activity_at, 'epoch'::timestamptz), new.created_at)
    where id = new.company_id;
  if new.contact_id is not null then
    update buzzybee.crm_contacts
      set last_activity_at = greatest(coalesce(last_activity_at, 'epoch'::timestamptz), new.created_at)
      where id = new.contact_id;
  end if;
  return null;
end $$;

drop trigger if exists crm_activity_touch on buzzybee.crm_deal_activities;
create trigger crm_activity_touch
after insert on buzzybee.crm_deal_activities
for each row execute function buzzybee.crm_activity_touch();

update buzzybee.crm_companies c
set last_activity_at = a.mx
from (select company_id, max(created_at) as mx
      from buzzybee.crm_deal_activities group by company_id) a
where a.company_id = c.id and c.last_activity_at is null;
