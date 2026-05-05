-- Time & Attendance — clock in/out ledger.
-- Privacy-first: stores timestamps only. No screenshots, no keystrokes,
-- no app names. active/idle seconds are populated only when the Tauri
-- desktop wrap ships OS-level idle detection.

create table if not exists buzzybee.time_entries (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references buzzybee.profiles(id) on delete cascade,
  client_id uuid not null references buzzybee.clients(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'running' check (status in ('running', 'closed')),
  notes text,
  active_seconds integer not null default 0,
  idle_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_ended_after_started check (ended_at is null or ended_at >= started_at),
  constraint time_entries_closed_has_ended check (status = 'running' or ended_at is not null)
);

-- A VA can only have one running entry at a time.
create unique index if not exists time_entries_one_running_per_va
  on buzzybee.time_entries (va_id)
  where status = 'running';

create index if not exists time_entries_va_started_idx
  on buzzybee.time_entries (va_id, started_at desc);

create index if not exists time_entries_client_started_idx
  on buzzybee.time_entries (client_id, started_at desc);

drop trigger if exists time_entries_set_updated_at on buzzybee.time_entries;
create trigger time_entries_set_updated_at
  before update on buzzybee.time_entries
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.time_entries enable row level security;

-- VA owns their own time entries (read + write).
drop policy if exists "time_entries_va_all" on buzzybee.time_entries;
create policy "time_entries_va_all"
  on buzzybee.time_entries for all
  to authenticated
  using (va_id = auth.uid())
  with check (va_id = auth.uid());

-- PM can see entries for clients they manage.
drop policy if exists "time_entries_pm_select" on buzzybee.time_entries;
create policy "time_entries_pm_select"
  on buzzybee.time_entries for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = time_entries.client_id
        and a.pm_id = auth.uid()
    )
  );

-- Admin: full access.
drop policy if exists "time_entries_admin_all" on buzzybee.time_entries;
create policy "time_entries_admin_all"
  on buzzybee.time_entries for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.time_entries to authenticated;
