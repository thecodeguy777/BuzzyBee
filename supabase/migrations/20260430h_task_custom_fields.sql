-- Per-client custom fields on tasks (Asana custom-fields pattern).
-- Definitions live in task_field_defs (per client_id).
-- Values live as a JSONB column on tasks, keyed by task_field_defs.key.

-- ---------------------------------------------------------------
-- task_field_defs
-- ---------------------------------------------------------------
create table if not exists buzzybee.task_field_defs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references buzzybee.clients(id) on delete cascade,
  key text not null,                    -- slug: 'stage', 'estimate_hours'
  label text not null,                  -- 'Stage', 'Estimate (hrs)'
  field_type text not null check (field_type in (
    'text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'url'
  )),
  options jsonb not null default '[]'::jsonb,
  -- for select/multi_select: [{ value: "draft", label: "Draft", color: "amber" }, ...]
  required boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, key)
);

create index if not exists task_field_defs_client_order_idx
  on buzzybee.task_field_defs (client_id, display_order);

drop trigger if exists task_field_defs_set_updated_at on buzzybee.task_field_defs;
create trigger task_field_defs_set_updated_at
  before update on buzzybee.task_field_defs
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.task_field_defs enable row level security;

-- VA: see + write definitions for clients they're assigned to.
drop policy if exists "task_field_defs_va_select" on buzzybee.task_field_defs;
create policy "task_field_defs_va_select"
  on buzzybee.task_field_defs for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = task_field_defs.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists "task_field_defs_va_write" on buzzybee.task_field_defs;
create policy "task_field_defs_va_write"
  on buzzybee.task_field_defs for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = task_field_defs.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = task_field_defs.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists "task_field_defs_pm_all" on buzzybee.task_field_defs;
create policy "task_field_defs_pm_all"
  on buzzybee.task_field_defs for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = task_field_defs.client_id
        and a.pm_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = task_field_defs.client_id
        and a.pm_id = auth.uid()
    )
  );

drop policy if exists "task_field_defs_admin_all" on buzzybee.task_field_defs;
create policy "task_field_defs_admin_all"
  on buzzybee.task_field_defs for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.task_field_defs to authenticated;

-- ---------------------------------------------------------------
-- tasks.custom_fields
-- ---------------------------------------------------------------
alter table buzzybee.tasks
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists tasks_custom_fields_gin
  on buzzybee.tasks using gin (custom_fields);

-- ---------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------
do $pub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.task_field_defs';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.task_field_defs';
end
$pub$;
