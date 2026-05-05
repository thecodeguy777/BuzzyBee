-- Tasks: BuzzyBee's native work-item system.
-- Mirrors MikeSteelv2's RFA pattern: primary record + comments + read tracking,
-- with status_history audit trail and threading on comments.

-- ---------------------------------------------------------------
-- Sequence for human-readable reference numbers (TASK-0001…)
-- ---------------------------------------------------------------
create sequence if not exists buzzybee.tasks_ref_seq start 1;

-- ---------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------
create table if not exists buzzybee.tasks (
  id uuid primary key default gen_random_uuid(),
  reference_number text unique not null
    default ('TASK-' || lpad(nextval('buzzybee.tasks_ref_seq')::text, 4, '0')),
  client_id uuid not null references buzzybee.clients(id) on delete cascade,
  client_name text,                       -- denormalized for list views
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority int not null default 3 check (priority between 1 and 4),
  -- 1 = urgent, 2 = high, 3 = normal, 4 = low.
  priority_order numeric not null default 0,
  -- For drag-reorder within a status column. Lower = higher up.
  due_on date,
  assignee_id uuid references buzzybee.profiles(id) on delete set null,
  assignee_name text,                     -- denormalized
  created_by uuid references buzzybee.profiles(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  -- [{url, name, path, size, mime_type, uploaded_at, uploaded_by}]
  status_history jsonb not null default '[]'::jsonb,
  -- [{status, user_id, timestamp, notes}]
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_client_idx on buzzybee.tasks (client_id, status, priority_order);
create index if not exists tasks_assignee_idx on buzzybee.tasks (assignee_id, status);
create index if not exists tasks_due_idx on buzzybee.tasks (due_on) where status not in ('done', 'cancelled');

drop trigger if exists tasks_set_updated_at on buzzybee.tasks;
create trigger tasks_set_updated_at
  before update on buzzybee.tasks
  for each row execute function buzzybee.tg_set_updated_at();

-- ---------------------------------------------------------------
-- Auto-track status changes in status_history.
-- Also stamps completed_at when status flips to 'done'.
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_tasks_status_history()
returns trigger language plpgsql as $fn$
begin
  if (tg_op = 'INSERT') then
    new.status_history = jsonb_build_array(
      jsonb_build_object(
        'status', new.status,
        'user_id', auth.uid(),
        'timestamp', now()
      )
    );
  elsif (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    new.status_history = coalesce(old.status_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', new.status,
        'user_id', auth.uid(),
        'timestamp', now()
      )
    );
    if new.status = 'done' and old.status <> 'done' then
      new.completed_at = now();
    elsif new.status <> 'done' and old.status = 'done' then
      new.completed_at = null;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists tasks_status_history on buzzybee.tasks;
create trigger tasks_status_history
  before insert or update on buzzybee.tasks
  for each row execute function buzzybee.tg_tasks_status_history();

alter table buzzybee.tasks enable row level security;

-- VA: see + write tasks for clients they're actively assigned to.
drop policy if exists "tasks_va_select" on buzzybee.tasks;
create policy "tasks_va_select"
  on buzzybee.tasks for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

drop policy if exists "tasks_va_write" on buzzybee.tasks;
create policy "tasks_va_write"
  on buzzybee.tasks for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
  );

-- PM: see + write tasks for clients they manage.
drop policy if exists "tasks_pm_all" on buzzybee.tasks;
create policy "tasks_pm_all"
  on buzzybee.tasks for all
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.pm_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.pm_id = auth.uid()
    )
  );

-- Admin: full access.
drop policy if exists "tasks_admin_all" on buzzybee.tasks;
create policy "tasks_admin_all"
  on buzzybee.tasks for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.tasks to authenticated;
grant usage on sequence buzzybee.tasks_ref_seq to authenticated;

-- ---------------------------------------------------------------
-- task_comments — threaded, with mentions
-- ---------------------------------------------------------------
create table if not exists buzzybee.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references buzzybee.tasks(id) on delete cascade,
  parent_id uuid references buzzybee.task_comments(id) on delete cascade,
  user_id uuid not null references buzzybee.profiles(id) on delete cascade,
  user_name text,                         -- denormalized
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  mentioned_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on buzzybee.task_comments (task_id, created_at);
create index if not exists task_comments_parent_idx on buzzybee.task_comments (parent_id);
create index if not exists task_comments_mentions_idx on buzzybee.task_comments using gin (mentioned_user_ids);

drop trigger if exists task_comments_set_updated_at on buzzybee.task_comments;
create trigger task_comments_set_updated_at
  before update on buzzybee.task_comments
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.task_comments enable row level security;

-- A user can read comments on tasks they can read.
drop policy if exists "task_comments_select" on buzzybee.task_comments;
create policy "task_comments_select"
  on buzzybee.task_comments for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.tasks t
      where t.id = task_comments.task_id
    )
    -- The tasks table's own RLS already restricts which rows show up,
    -- so this exists() naturally filters by readable tasks.
  );

-- A user can insert their own comments on tasks they can read.
drop policy if exists "task_comments_insert" on buzzybee.task_comments;
create policy "task_comments_insert"
  on buzzybee.task_comments for insert
  to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from buzzybee.tasks t where t.id = task_comments.task_id
    )
  );

-- Author can edit/delete their own comments.
drop policy if exists "task_comments_modify_own" on buzzybee.task_comments;
create policy "task_comments_modify_own"
  on buzzybee.task_comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "task_comments_delete_own" on buzzybee.task_comments;
create policy "task_comments_delete_own"
  on buzzybee.task_comments for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "task_comments_admin_all" on buzzybee.task_comments;
create policy "task_comments_admin_all"
  on buzzybee.task_comments for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.task_comments to authenticated;

-- ---------------------------------------------------------------
-- task_comment_reads — for unread badges
-- ---------------------------------------------------------------
create table if not exists buzzybee.task_comment_reads (
  user_id uuid not null references buzzybee.profiles(id) on delete cascade,
  task_id uuid not null references buzzybee.tasks(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table buzzybee.task_comment_reads enable row level security;

drop policy if exists "task_comment_reads_own" on buzzybee.task_comment_reads;
create policy "task_comment_reads_own"
  on buzzybee.task_comment_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on buzzybee.task_comment_reads to authenticated;
