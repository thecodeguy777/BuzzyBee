-- Notifications for: subtask assigned to you, and comments/mentions on a task.
-- "Added to a shared task" already fires via the live tg_task_assignees_notify
-- trigger (committed in the task_assignees backfill, pending task #3), so it's
-- intentionally not touched here.
--
-- Both new triggers are SECURITY DEFINER (owner=postgres) so cross-user inserts
-- bypass notifications RLS, and reading sibling tables (tasks/task_assignees)
-- inside them is RLS-bypassed too — no recursion risk (see 20260613n).
-- They target task_subtasks (20260613k) and task_comments (20260430f), both
-- already created by migrations, so this file is replayable on its own.

-- 1) Extend the type allowlist. Postgres CHECKs can't be incrementally
--    extended, so repeat the FULL current list (from 20260612f) + the new type.
alter table buzzybee.notifications drop constraint if exists notifications_type_check;
alter table buzzybee.notifications add constraint notifications_type_check check (type in (
  'task_assigned', 'task_unassigned', 'task_status_changed', 'task_completed',
  'task_due_soon', 'task_handoff', 'project_added', 'comment', 'mention',
  'ticket_created', 'ticket_status', 'ticket_assigned', 'ticket_comment',
  'subtask_assigned'
));

-- 2) Subtask assigned → notify the assignee (skip self / unassigned).
--    Fires on INSERT-with-assignee and on UPDATE that changes the assignee.
--    Actor is auth.uid() (the row's created_by is the creator, not the
--    reassigner). source_type defaults to 'task' + source_id = parent task so
--    clicking the notification opens the parent task.
create or replace function buzzybee.tg_subtasks_notify()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  recipient uuid;
  t_ref text;
begin
  if tg_op = 'INSERT' then
    recipient := new.assignee_id;
  elsif new.assignee_id is distinct from old.assignee_id then
    recipient := new.assignee_id;
  else
    return new;
  end if;

  if recipient is null
     or recipient = coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)
  then
    return new;
  end if;

  select full_name into actor_name from buzzybee.profiles where id = actor;
  if actor_name is null or actor_name = '' then actor_name := 'Someone'; end if;
  select reference_number into t_ref from buzzybee.tasks where id = new.task_id;

  insert into buzzybee.notifications
    (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
  values (
    recipient, 'subtask_assigned', new.task_id, t_ref,
    actor, actor_name,
    actor_name || ' assigned you a subtask',
    new.title,
    '/app/tasks'
  );
  return new;
end;
$$;

drop trigger if exists task_subtasks_notify on buzzybee.task_subtasks;
create trigger task_subtasks_notify
  after insert or update on buzzybee.task_subtasks
  for each row execute function buzzybee.tg_subtasks_notify();

-- 3) Comment on a task → notify the task's people (creator + every assignee),
--    minus the author. Explicit @mentions (mentioned_user_ids) get a distinct
--    'mention' notification instead of the 'comment' one. Wrapped so a
--    notification failure can never roll back the comment itself.
create or replace function buzzybee.tg_task_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $$
declare
  author uuid := new.user_id;
  author_name text;
  t_ref text;
  t_assignee uuid;
  t_creator uuid;
  rcpt uuid;
begin
  select reference_number, assignee_id, created_by
    into t_ref, t_assignee, t_creator
    from buzzybee.tasks where id = new.task_id;

  select full_name into author_name from buzzybee.profiles where id = author;
  if author_name is null or author_name = '' then author_name := 'Someone'; end if;

  -- Explicit mentions first.
  if new.mentioned_user_ids is not null then
    for rcpt in
      select distinct u from unnest(new.mentioned_user_ids) as u
      where u is not null and u <> author
    loop
      insert into buzzybee.notifications
        (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
      values (
        rcpt, 'mention', new.task_id, t_ref, author, author_name,
        author_name || ' mentioned you on ' || coalesce(t_ref, 'a task'),
        left(new.message, 140), '/app/tasks'
      );
    end loop;
  end if;

  -- Everyone on the task (creator + assignees), minus author, minus mentioned.
  for rcpt in
    select distinct uid from (
      select t_creator as uid
      union select t_assignee
      union select ta.user_id from buzzybee.task_assignees ta where ta.task_id = new.task_id
    ) r
    where uid is not null
      and uid <> author
      and not (uid = any (coalesce(new.mentioned_user_ids, '{}'::uuid[])))
  loop
    insert into buzzybee.notifications
      (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (
      rcpt, 'comment', new.task_id, t_ref, author, author_name,
      author_name || ' commented on ' || coalesce(t_ref, 'a task'),
      left(new.message, 140), '/app/tasks'
    );
  end loop;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists task_comments_notify on buzzybee.task_comments;
create trigger task_comments_notify
  after insert on buzzybee.task_comments
  for each row execute function buzzybee.tg_task_comments_notify();
