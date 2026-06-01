-- HiveMind Dialer — Phase 0 schema
-- Tables: dialer_phone_numbers (DID inventory), dialer_calls (call log)
-- See electron/main/dialer/README.md for architecture, roadmap, and cost model.

-- ---------------------------------------------------------------
-- dialer_phone_numbers — DID inventory, optional per-agent assignment
-- ---------------------------------------------------------------
create table if not exists buzzybee.dialer_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  e164 text not null unique,
  telnyx_phone_id text,
  label text,
  assigned_to_user_id uuid references buzzybee.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dialer_phone_numbers_assigned_idx
  on buzzybee.dialer_phone_numbers (assigned_to_user_id)
  where assigned_to_user_id is not null;

-- ---------------------------------------------------------------
-- dialer_calls — one row per call attempt (outbound today, inbound Phase 4)
-- ---------------------------------------------------------------
create table if not exists buzzybee.dialer_calls (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null references buzzybee.profiles(id) on delete restrict,
  direction text not null check (direction in ('outbound', 'inbound')),
  from_e164 text not null,
  to_e164 text not null,
  status text not null check (status in (
    'initiated', 'ringing', 'answered', 'completed',
    'failed', 'no-answer', 'busy', 'canceled'
  )),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  hangup_cause text,
  telnyx_call_id text unique,
  recording_url text,
  recording_duration_sec integer,
  client_id uuid references buzzybee.clients(id) on delete set null,
  ticket_id uuid references buzzybee.tickets(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dialer_calls_agent_started_idx
  on buzzybee.dialer_calls (agent_user_id, started_at desc);

create index if not exists dialer_calls_client_idx
  on buzzybee.dialer_calls (client_id, started_at desc)
  where client_id is not null;

create index if not exists dialer_calls_ticket_idx
  on buzzybee.dialer_calls (ticket_id, started_at desc)
  where ticket_id is not null;

create index if not exists dialer_calls_telnyx_id_idx
  on buzzybee.dialer_calls (telnyx_call_id)
  where telnyx_call_id is not null;

-- ---------------------------------------------------------------
-- updated_at triggers (matches buzzybee.touch_*_updated_at convention)
-- ---------------------------------------------------------------
create or replace function buzzybee.touch_dialer_phone_numbers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dialer_phone_numbers_touch_updated_at
  on buzzybee.dialer_phone_numbers;
create trigger dialer_phone_numbers_touch_updated_at
  before update on buzzybee.dialer_phone_numbers
  for each row execute function buzzybee.touch_dialer_phone_numbers_updated_at();

create or replace function buzzybee.touch_dialer_calls_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dialer_calls_touch_updated_at on buzzybee.dialer_calls;
create trigger dialer_calls_touch_updated_at
  before update on buzzybee.dialer_calls
  for each row execute function buzzybee.touch_dialer_calls_updated_at();

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table buzzybee.dialer_phone_numbers enable row level security;
alter table buzzybee.dialer_calls enable row level security;

-- Phone numbers: agents see their own assigned DID + unassigned pool;
-- admins/superadmins see and manage all.
drop policy if exists dialer_phone_numbers_select on buzzybee.dialer_phone_numbers;
create policy dialer_phone_numbers_select on buzzybee.dialer_phone_numbers
  for select to authenticated
  using (
    assigned_to_user_id = auth.uid()
    or assigned_to_user_id is null
    or buzzybee.is_admin()
  );

drop policy if exists dialer_phone_numbers_admin_write on buzzybee.dialer_phone_numbers;
create policy dialer_phone_numbers_admin_write on buzzybee.dialer_phone_numbers
  for all to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- Calls: agents see/edit their own; admins/superadmins see all.
drop policy if exists dialer_calls_select_own_or_admin on buzzybee.dialer_calls;
create policy dialer_calls_select_own_or_admin on buzzybee.dialer_calls
  for select to authenticated
  using (agent_user_id = auth.uid() or buzzybee.is_admin());

drop policy if exists dialer_calls_insert_own on buzzybee.dialer_calls;
create policy dialer_calls_insert_own on buzzybee.dialer_calls
  for insert to authenticated
  with check (agent_user_id = auth.uid());

drop policy if exists dialer_calls_update_own_or_admin on buzzybee.dialer_calls;
create policy dialer_calls_update_own_or_admin on buzzybee.dialer_calls
  for update to authenticated
  using (agent_user_id = auth.uid() or buzzybee.is_admin())
  with check (agent_user_id = auth.uid() or buzzybee.is_admin());

drop policy if exists dialer_calls_admin_delete on buzzybee.dialer_calls;
create policy dialer_calls_admin_delete on buzzybee.dialer_calls
  for delete to authenticated
  using (buzzybee.is_admin());

-- ---------------------------------------------------------------
-- Realtime: agents watch their call status + recording_url updates
-- (guarded so re-running the migration doesn't error)
-- ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'dialer_calls'
  ) then
    alter publication supabase_realtime add table buzzybee.dialer_calls;
  end if;
end $$;
