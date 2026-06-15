-- Hardening for the subtask/comment notification triggers (from adversarial
-- review of 20260613o):
--  * comment trigger: a single stale id in client-supplied mentioned_user_ids
--    hit the notifications.user_id FK and the blanket handler swallowed it,
--    dropping EVERY comment notification for that comment. Now mentions are
--    intersected with real profiles (FK can't fire) and the safety handler
--    raises a warning instead of swallowing silently.
--  * subtask trigger: self-suppression collapsed to a zero-uuid sentinel when
--    auth.uid() is null (service-role/import), notifying the actor about their
--    own action. Now gated on a real actor. Also wrapped so a future
--    notifications constraint can't roll back the subtask write.

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

  -- Skip when unassigned, or when the assignee IS the actor. Self can only be
  -- known with a real actor; a null actor (system/import) still notifies.
  if recipient is null or (actor is not null and recipient = actor) then
    return new;
  end if;

  select full_name into actor_name from buzzybee.profiles where id = actor;
  if actor_name is null or actor_name = '' then actor_name := 'Someone'; end if;
  select reference_number into t_ref from buzzybee.tasks where id = new.task_id;

  -- A notification failure must never roll back the subtask write.
  begin
    insert into buzzybee.notifications
      (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (
      recipient, 'subtask_assigned', new.task_id, t_ref,
      actor, actor_name,
      actor_name || ' assigned you a subtask',
      new.title,
      '/app/tasks'
    );
  exception when others then
    raise warning 'tg_subtasks_notify failed: %', sqlerrm;
  end;
  return new;
end;
$$;

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

  -- Explicit mentions → only ids that are real profiles. Client-supplied ids
  -- may be stale; intersecting here keeps a bad id from hitting the FK (which
  -- would otherwise abort the whole fan-out, including the comment loop below).
  if new.mentioned_user_ids is not null then
    for rcpt in
      select distinct u from unnest(new.mentioned_user_ids) as u
      where u is not null and u <> author
        and exists (select 1 from buzzybee.profiles p where p.id = u)
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
  -- Never roll back the comment; surface the failure instead of hiding it.
  raise warning 'tg_task_comments_notify failed: %', sqlerrm;
  return new;
end;
$$;
