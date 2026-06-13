-- Import the dialer's leads (buzzybee.dialer_leads, ~6.3k rows) into the web CRM
-- under the HiveMind client so the full pipeline is visible in the new deals
-- table. dialer_leads is the dialer's own pipeline (it carries stage, value,
-- won/lost), so each lead maps to: a company (deduped by name) + a contact
-- (carries phone/email) + a deal.
--
-- Idempotent + reversible via the dialer_lead_id provenance column:
--   delete from buzzybee.crm_contacts where dialer_lead_id is not null;
--   delete from buzzybee.crm_deals    where dialer_lead_id is not null;
--   -- then optionally drop now-empty imported companies.
-- Safe to re-run: WHERE NOT EXISTS guards skip already-imported rows.
-- The crm_announce_deal trigger no-ops here because we never set channel_id.

-- ── provenance ───────────────────────────────────────────────────────────────
alter table buzzybee.crm_deals    add column if not exists dialer_lead_id uuid;
alter table buzzybee.crm_contacts add column if not exists dialer_lead_id uuid;
create unique index if not exists crm_deals_dialer_lead_id_uidx
  on buzzybee.crm_deals(dialer_lead_id) where dialer_lead_id is not null;
create unique index if not exists crm_contacts_dialer_lead_id_uidx
  on buzzybee.crm_contacts(dialer_lead_id) where dialer_lead_id is not null;

-- ── 1) Companies (one per case-insensitive name; blank company → person name) ─
with names as (
  select min(nm) as name,
         lower(nm) as lname,
         max(coalesce(last_called_at, updated_at)) as last_act
  from (
    select coalesce(nullif(btrim(company), ''), btrim(full_name)) as nm,
           last_called_at, updated_at
    from buzzybee.dialer_leads
    where coalesce(nullif(btrim(full_name), ''), '') <> ''
  ) s
  where nm is not null and nm <> ''
  group by lower(nm)
)
insert into buzzybee.crm_companies (name, client_id, color, last_activity_at, created_at, updated_at)
select n.name,
       '70e887f4-3d2c-4342-84f9-1c592441e13b'::uuid,
       (array['#7b2d86','#2f6fed','#0d9488','#c2700c','#d6336c','#4f46e5','#15803d','#475569'])
         [1 + ((hashtext(n.lname) % 8) + 8) % 8],
       n.last_act, now(), now()
from names n
where not exists (
  select 1 from buzzybee.crm_companies c
  where c.client_id = '70e887f4-3d2c-4342-84f9-1c592441e13b'::uuid
    and lower(c.name) = n.lname
);

-- ── 2) Deals (one per lead) ──────────────────────────────────────────────────
insert into buzzybee.crm_deals
  (title, company_id, stage, value, owner_id, source, sort, created_by, won_at, client_id, dialer_lead_id, created_at, updated_at)
select
  btrim(dl.full_name),
  c.id,
  case dl.stage
    when 'lead' then 'lead'
    when 'contacted' then 'contacted'
    when 'qualified' then 'contacted'
    when 'discovery' then 'contacted'
    when 'proposal' then 'proposal'
    when 'negotiation' then 'negotiation'
    when 'closed-won' then 'won'
    when 'closed-lost' then 'lost'
    else 'lead'
  end,
  coalesce(dl.deal_value_cents, 0) / 100.0,
  (select p.id from buzzybee.profiles p where p.id = coalesce(dl.assigned_to_user_id, dl.created_by_user_id)),
  dl.source,
  0,
  (select p.id from buzzybee.profiles p where p.id = dl.created_by_user_id),
  case when dl.stage = 'closed-won' then coalesce(dl.stage_changed_at, dl.updated_at) end,
  '70e887f4-3d2c-4342-84f9-1c592441e13b'::uuid,
  dl.id,
  dl.created_at, dl.updated_at
from buzzybee.dialer_leads dl
join buzzybee.crm_companies c
  on c.client_id = '70e887f4-3d2c-4342-84f9-1c592441e13b'::uuid
 and lower(c.name) = lower(coalesce(nullif(btrim(dl.company), ''), btrim(dl.full_name)))
where coalesce(nullif(btrim(dl.full_name), ''), '') <> ''
  and not exists (select 1 from buzzybee.crm_deals d where d.dialer_lead_id = dl.id);

-- ── 3) Contacts (one per lead — carries phone + email) ───────────────────────
insert into buzzybee.crm_contacts
  (company_id, name, phone, email, is_primary, dialer_lead_id, created_at)
select
  c.id, btrim(dl.full_name), dl.phone_e164, dl.email, false, dl.id, dl.created_at
from buzzybee.dialer_leads dl
join buzzybee.crm_companies c
  on c.client_id = '70e887f4-3d2c-4342-84f9-1c592441e13b'::uuid
 and lower(c.name) = lower(coalesce(nullif(btrim(dl.company), ''), btrim(dl.full_name)))
where coalesce(nullif(btrim(dl.full_name), ''), '') <> ''
  and not exists (select 1 from buzzybee.crm_contacts ct where ct.dialer_lead_id = dl.id);
