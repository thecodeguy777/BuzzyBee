-- Clients + assignments
-- Foundation for the client switcher and everything per-client downstream
-- (timer, tasks, comms, playbook, EOD).

-- ---------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------
create table if not exists buzzybee.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preferred_channel text check (preferred_channel in ('slack', 'email')),
  slack_webhook_url text,
  email_to text,
  asana_project_id text,
  monthly_rate numeric,
  tier text check (tier in ('starter', 'professional', 'specialist')),
  hivemind_enabled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_idx on buzzybee.clients (status);

drop trigger if exists clients_set_updated_at on buzzybee.clients;
create trigger clients_set_updated_at
  before update on buzzybee.clients
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.clients enable row level security;

-- ---------------------------------------------------------------
-- assignments — links VAs to clients (with optional PM)
-- ---------------------------------------------------------------
create table if not exists buzzybee.assignments (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references buzzybee.profiles(id) on delete cascade,
  client_id uuid not null references buzzybee.clients(id) on delete cascade,
  pm_id uuid references buzzybee.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists assignments_va_idx on buzzybee.assignments (va_id);
create index if not exists assignments_client_idx on buzzybee.assignments (client_id);
create index if not exists assignments_pm_idx on buzzybee.assignments (pm_id);
create unique index if not exists assignments_va_client_active_uq
  on buzzybee.assignments (va_id, client_id)
  where status = 'active';

alter table buzzybee.assignments enable row level security;

-- ---------------------------------------------------------------
-- RLS — assignments
-- (write policies first because clients policies reference assignments)
-- ---------------------------------------------------------------

-- VA can see their own assignment rows.
drop policy if exists "assignments_va_select" on buzzybee.assignments;
create policy "assignments_va_select"
  on buzzybee.assignments for select
  to authenticated
  using (va_id = auth.uid());

-- PM can see assignments they manage.
drop policy if exists "assignments_pm_select" on buzzybee.assignments;
create policy "assignments_pm_select"
  on buzzybee.assignments for select
  to authenticated
  using (pm_id = auth.uid());

-- Admin: full access.
drop policy if exists "assignments_admin_all" on buzzybee.assignments;
create policy "assignments_admin_all"
  on buzzybee.assignments for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

-- PM can manage assignments where they are pm_id (insert/update/delete).
drop policy if exists "assignments_pm_write" on buzzybee.assignments;
create policy "assignments_pm_write"
  on buzzybee.assignments for all
  to authenticated
  using (pm_id = auth.uid() and buzzybee.current_role() in ('pm', 'admin'))
  with check (pm_id = auth.uid() and buzzybee.current_role() in ('pm', 'admin'));

-- ---------------------------------------------------------------
-- RLS — clients
-- ---------------------------------------------------------------

-- VA can see clients they are actively assigned to.
drop policy if exists "clients_va_select" on buzzybee.clients;
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

-- PM can see clients they manage (any assignment with pm_id = me).
drop policy if exists "clients_pm_select" on buzzybee.clients;
create policy "clients_pm_select"
  on buzzybee.clients for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = clients.id
        and a.pm_id = auth.uid()
    )
  );

-- Admin: full access on clients.
drop policy if exists "clients_admin_all" on buzzybee.clients;
create policy "clients_admin_all"
  on buzzybee.clients for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

-- PM can update clients they manage.
drop policy if exists "clients_pm_update" on buzzybee.clients;
create policy "clients_pm_update"
  on buzzybee.clients for update
  to authenticated
  using (
    buzzybee.current_role() in ('pm', 'admin') and exists (
      select 1 from buzzybee.assignments a
      where a.client_id = clients.id
        and a.pm_id = auth.uid()
    )
  );

-- PM/Admin can insert clients (admin policy already covers admin; this adds PM).
drop policy if exists "clients_pm_insert" on buzzybee.clients;
create policy "clients_pm_insert"
  on buzzybee.clients for insert
  to authenticated
  with check (buzzybee.current_role() in ('pm', 'admin'));

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
grant select, insert, update, delete on buzzybee.clients to authenticated;
grant select, insert, update, delete on buzzybee.assignments to authenticated;
