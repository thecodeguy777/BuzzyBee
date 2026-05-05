-- Notifications: per-user inbox feed.
-- Mirrors MikeSteelv2's notifications_v2 pattern. Triggers populate rows
-- whenever something happens that the recipient should know about
-- (assigned to a task, status changed by someone else, added to a project).
-- Comments / mentions slot in here once we ship task_comments.

create table if not exists buzzybee.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references buzzybee.profiles(id) on delete cascade,
  type text not null check (type in (
    'task_assigned',
    'task_unassigned',
    'task_status_changed',
    'task_completed',
    'task_due_soon',
    'project_added',
    'comment',
    'mention'
  )),
  source_type text not null default 'task' check (source_type in ('task', 'project', 'comment')),
  source_id uuid,
  source_ref text,
  actor_id uuid references buzzybee.profiles(id) on delete set null,
  actor_name text,
  title text not null,
  preview text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on buzzybee.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_user_created_idx
  on buzzybee.notifications (user_id, created_at desc);

alter table buzzybee.notifications enable row level security;

drop policy if exists "notifications_own" on buzzybee.notifications;
create policy "notifications_own"
  on buzzybee.notifications for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_admin_all" on buzzybee.notifications;
create policy "notifications_admin_all"
  on buzzybee.notifications for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.notifications to authenticated;

-- realtime
do $notifpub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.notifications';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.notifications';
end
$notifpub$;

-- ---------------------------------------------------------------
-- Trigger: tasks → notifications
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_tasks_notifications()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $tasksnotif$
declare
  actor uuid := auth.uid();
  actor_name text;
  status_label text;
begin
  select full_name into actor_name from buzzybee.profiles where id = actor;
  if actor_name is null or actor_name = '' then actor_name := 'Someone'; end if;

  if (tg_op = 'INSERT') then
    if new.assignee_id is not null
       and new.assignee_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)
    then
      insert into buzzybee.notifications (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
      values (
        new.assignee_id, 'task_assigned', new.id, new.reference_number,
        actor, actor_name,
        actor_name || ' assigned you a task',
        new.title,
        '/app/tasks'
      );
    end if;
    return new;
  end if;

  -- Assignee changed
  if old.assignee_id is distinct from new.assignee_id then
    if new.assignee_id is not null
       and new.assignee_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)
    then
      insert into buzzybee.notifications (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
      values (
        new.assignee_id, 'task_assigned', new.id, new.reference_number,
        actor, actor_name,
        actor_name || ' assigned you a task',
        new.title,
        '/app/tasks'
      );
    end if;
    if old.assignee_id is not null
       and old.assignee_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)
    then
      insert into buzzybee.notifications (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
      values (
        old.assignee_id, 'task_unassigned', new.id, new.reference_number,
        actor, actor_name,
        actor_name || ' removed you from a task',
        new.title,
        '/app/tasks'
      );
    end if;
  end if;

  -- Status changed by someone other than the assignee
  if old.status is distinct from new.status
     and new.assignee_id is not null
     and new.assignee_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)
  then
    status_label := replace(new.status, '_', ' ');
    insert into buzzybee.notifications (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (
      new.assignee_id,
      case when new.status = 'done' then 'task_completed' else 'task_status_changed' end,
      new.id, new.reference_number,
      actor, actor_name,
      actor_name || ' moved ' || new.reference_number || ' to ' || status_label,
      new.title,
      '/app/tasks'
    );
  end if;

  return new;
end;
$tasksnotif$;

drop trigger if exists tasks_notifications on buzzybee.tasks;
create trigger tasks_notifications
  after insert or update on buzzybee.tasks
  for each row execute function buzzybee.tg_tasks_notifications();

-- ---------------------------------------------------------------
-- Trigger: project_members → notify the new member
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_project_members_notifications()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $projmemnotif$
declare
  actor uuid := auth.uid();
  actor_name text;
  project_name text;
begin
  -- skip if no actor (e.g. seeded by trigger) or if it's the user adding themselves
  if actor is null or new.user_id = actor then return new; end if;
  select full_name into actor_name from buzzybee.profiles where id = actor;
  if actor_name is null or actor_name = '' then actor_name := 'Someone'; end if;
  select name into project_name from buzzybee.projects where id = new.project_id;

  insert into buzzybee.notifications (user_id, type, source_type, source_id, actor_id, actor_name, title, preview, link)
  values (
    new.user_id,
    'project_added',
    'project',
    new.project_id,
    actor, actor_name,
    actor_name || ' added you to ' || coalesce(project_name, 'a project'),
    'Role: ' || new.role,
    '/app/tasks'
  );
  return new;
end;
$projmemnotif$;

drop trigger if exists project_members_notifications on buzzybee.project_members;
create trigger project_members_notifications
  after insert on buzzybee.project_members
  for each row execute function buzzybee.tg_project_members_notifications();
