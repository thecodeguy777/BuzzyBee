-- Subtasks: a lightweight checklist under a task — title + done + drag-order,
-- optional assignee + due. RLS mirrors task_comments (collaborative on a task you
-- can see). Added to the realtime publication for live sync. replica identity
-- full so DELETE payloads carry task_id (the store's realtime handler needs it).

create table if not exists buzzybee.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references buzzybee.tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position numeric not null default 0,
  assignee_id uuid references buzzybee.profiles(id) on delete set null,
  due_on date,
  created_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table buzzybee.task_subtasks replica identity full;

create index if not exists task_subtasks_task_idx on buzzybee.task_subtasks (task_id, position);
create index if not exists task_subtasks_assignee_idx on buzzybee.task_subtasks (assignee_id);

-- updated_at trigger (pinned search_path, unlike the legacy shared trigger fn)
create or replace function buzzybee.tg_subtasks_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'buzzybee', 'public'
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists tg_task_subtasks_updated_at on buzzybee.task_subtasks;
create trigger tg_task_subtasks_updated_at
  before update on buzzybee.task_subtasks
  for each row execute function buzzybee.tg_subtasks_set_updated_at();

-- ── RLS: collaborative on a visible task (mirrors task_comments) ──────────────
alter table buzzybee.task_subtasks enable row level security;

drop policy if exists task_subtasks_select on buzzybee.task_subtasks;
create policy task_subtasks_select on buzzybee.task_subtasks for select
  using (exists (select 1 from buzzybee.tasks t where t.id = task_subtasks.task_id));

drop policy if exists task_subtasks_insert on buzzybee.task_subtasks;
create policy task_subtasks_insert on buzzybee.task_subtasks for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from buzzybee.tasks t where t.id = task_subtasks.task_id)
  );

drop policy if exists task_subtasks_update on buzzybee.task_subtasks;
create policy task_subtasks_update on buzzybee.task_subtasks for update
  using (exists (select 1 from buzzybee.tasks t where t.id = task_subtasks.task_id))
  with check (exists (select 1 from buzzybee.tasks t where t.id = task_subtasks.task_id));

drop policy if exists task_subtasks_delete on buzzybee.task_subtasks;
create policy task_subtasks_delete on buzzybee.task_subtasks for delete
  using (created_by = auth.uid() or buzzybee."current_role"() = 'admin');

drop policy if exists task_subtasks_admin_all on buzzybee.task_subtasks;
create policy task_subtasks_admin_all on buzzybee.task_subtasks for all
  using (buzzybee."current_role"() = 'admin')
  with check (buzzybee."current_role"() = 'admin');

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $pub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.task_subtasks';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.task_subtasks';
end
$pub$;
