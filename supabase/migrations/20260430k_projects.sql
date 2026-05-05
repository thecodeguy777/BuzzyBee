-- Projects: a layer between client and task. Every task belongs to one
-- project; every project belongs to one client. The sidebar groups projects
-- by client.

create table if not exists buzzybee.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references buzzybee.clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  display_order numeric not null default 0,
  created_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_client_idx on buzzybee.projects (client_id, display_order);

drop trigger if exists projects_set_updated_at on buzzybee.projects;
create trigger projects_set_updated_at
  before update on buzzybee.projects
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.projects enable row level security;

drop policy if exists "projects_va_all" on buzzybee.projects;
create policy "projects_va_all"
  on buzzybee.projects for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = projects.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = projects.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists "projects_pm_all" on buzzybee.projects;
create policy "projects_pm_all"
  on buzzybee.projects for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = projects.client_id
        and a.pm_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = projects.client_id
        and a.pm_id = auth.uid()
    )
  );

drop policy if exists "projects_admin_all" on buzzybee.projects;
create policy "projects_admin_all"
  on buzzybee.projects for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.projects to authenticated;

-- realtime
do $pub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.projects';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.projects';
end
$pub$;

-- ---------------------------------------------------------------
-- tasks.project_id (nullable for backward compat; backfilled below)
-- ---------------------------------------------------------------
alter table buzzybee.tasks
  add column if not exists project_id uuid references buzzybee.projects(id) on delete cascade;

create index if not exists tasks_project_idx
  on buzzybee.tasks (project_id, status, priority_order);

-- ---------------------------------------------------------------
-- Backfill: one "General" project per client; orphan tasks → that project.
-- ---------------------------------------------------------------
do $bf$
declare
  c record;
  pid uuid;
begin
  for c in select id, name from buzzybee.clients loop
    select id into pid from buzzybee.projects where client_id = c.id order by display_order limit 1;
    if pid is null then
      insert into buzzybee.projects (client_id, name, description, display_order)
      values (
        c.id,
        'General',
        'Default project. Rename in Overview or add more.',
        0
      )
      returning id into pid;
    end if;

    update buzzybee.tasks
      set project_id = pid
      where client_id = c.id
        and project_id is null;
  end loop;
end
$bf$;
