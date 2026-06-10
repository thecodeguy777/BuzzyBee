-- CRM is a per-client workspace feature (each client gets their own CRM, like
-- their tracker + comms). Scope CRM records to the owning client. crm_companies
-- already has client_id (repurposed here as the owning workspace); add it to
-- crm_deals (denormalized for cheap scoped queries).
alter table buzzybee.crm_deals add column if not exists client_id uuid references buzzybee.clients(id) on delete cascade;
create index if not exists crm_deals_client_idx on buzzybee.crm_deals(client_id);
