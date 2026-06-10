-- CRM module: companies (accounts), contacts (people), deals (pipeline),
-- deal↔task links, and a unified activity timeline. Internal team data — wired
-- into the existing ecosystem via clients/channels/tasks/profiles FKs.

create table if not exists buzzybee.crm_companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  site        text,
  color       text,
  is_client   boolean not null default false,
  client_id   uuid references buzzybee.clients(id)  on delete set null,
  channel_id  uuid references buzzybee.channels(id) on delete set null,
  created_by  uuid references buzzybee.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists buzzybee.crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references buzzybee.crm_companies(id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  color       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists buzzybee.crm_deals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  company_id  uuid not null references buzzybee.crm_companies(id) on delete cascade,
  stage       text not null default 'lead',
  value       numeric not null default 0,
  owner_id    uuid references buzzybee.profiles(id)  on delete set null,
  close_on    text,
  source      text,
  health      text default 'warm',
  priority    text default 'Medium',
  channel_id  uuid references buzzybee.channels(id)  on delete set null,
  sort        numeric not null default 0,
  created_by  uuid references buzzybee.profiles(id),
  won_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists buzzybee.crm_deal_tasks (
  deal_id     uuid not null references buzzybee.crm_deals(id) on delete cascade,
  task_id     uuid not null references buzzybee.tasks(id)     on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (deal_id, task_id)
);

create table if not exists buzzybee.crm_deal_activities (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references buzzybee.crm_deals(id) on delete cascade,
  type        text not null,
  actor_id    uuid references buzzybee.profiles(id) on delete set null,
  body        text not null,
  meta        text,
  created_at  timestamptz not null default now()
);

create index if not exists crm_companies_client_idx on buzzybee.crm_companies(client_id);
create index if not exists crm_contacts_company_idx  on buzzybee.crm_contacts(company_id);
create index if not exists crm_deals_company_idx     on buzzybee.crm_deals(company_id);
create index if not exists crm_deals_stage_idx       on buzzybee.crm_deals(stage);
create index if not exists crm_deal_tasks_deal_idx   on buzzybee.crm_deal_tasks(deal_id);
create index if not exists crm_acts_deal_idx         on buzzybee.crm_deal_activities(deal_id, created_at);

-- RLS: internal CRM — any authenticated team member can read & manage.
alter table buzzybee.crm_companies        enable row level security;
alter table buzzybee.crm_contacts         enable row level security;
alter table buzzybee.crm_deals            enable row level security;
alter table buzzybee.crm_deal_tasks       enable row level security;
alter table buzzybee.crm_deal_activities  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts','crm_deals','crm_deal_tasks','crm_deal_activities']
  loop
    execute format('drop policy if exists %I_all on buzzybee.%I', t, t);
    execute format(
      'create policy %I_all on buzzybee.%I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)',
      t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts','crm_deals','crm_deal_tasks','crm_deal_activities']
  loop
    begin
      execute format('alter publication supabase_realtime add table buzzybee.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
