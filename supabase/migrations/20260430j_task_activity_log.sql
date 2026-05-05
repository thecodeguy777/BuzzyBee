-- Replace `status_history` with a comprehensive `activity_log` jsonb column
-- and a trigger that records every meaningful change (status, priority,
-- due_on, assignee, title, description, attachments add/remove, custom
-- fields). Each entry shape:
--   { kind, from?, to?, user_id, timestamp, ...kind-specific fields }
--
-- Idempotent: safe to re-run.

alter table buzzybee.tasks rename column status_history to activity_log;

drop trigger if exists tasks_status_history on buzzybee.tasks;
drop function if exists buzzybee.tg_tasks_status_history();

create or replace function buzzybee.tg_tasks_activity_log()
returns trigger
language plpgsql
as $fn$
declare
  events jsonb;
  uid uuid := auth.uid();
  ts timestamptz := now();
  attach jsonb;
  old_ids jsonb := '[]'::jsonb;
  new_ids jsonb := '[]'::jsonb;
begin
  if (tg_op = 'INSERT') then
    new.activity_log = jsonb_build_array(
      jsonb_build_object(
        'kind', 'created',
        'user_id', uid,
        'timestamp', ts
      )
    );
    if new.status is not null and new.status <> 'todo' then
      new.activity_log = new.activity_log || jsonb_build_array(
        jsonb_build_object(
          'kind', 'status',
          'to', new.status,
          'user_id', uid,
          'timestamp', ts
        )
      );
    end if;
    return new;
  end if;

  events := coalesce(old.activity_log, '[]'::jsonb);

  if (old.status is distinct from new.status) then
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'status',
        'from', old.status,
        'to', new.status,
        'user_id', uid,
        'timestamp', ts
      )
    );
    if new.status = 'done' and old.status <> 'done' then
      new.completed_at = ts;
    elsif new.status <> 'done' and old.status = 'done' then
      new.completed_at = null;
    end if;
  end if;

  if (old.priority is distinct from new.priority) then
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'priority',
        'from', old.priority,
        'to', new.priority,
        'user_id', uid,
        'timestamp', ts
      )
    );
  end if;

  if (old.due_on is distinct from new.due_on) then
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'due',
        'from', old.due_on,
        'to', new.due_on,
        'user_id', uid,
        'timestamp', ts
      )
    );
  end if;

  if (old.assignee_id is distinct from new.assignee_id) then
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'assignee',
        'from', old.assignee_id,
        'to', new.assignee_id,
        'from_name', old.assignee_name,
        'to_name', new.assignee_name,
        'user_id', uid,
        'timestamp', ts
      )
    );
  end if;

  if (old.title is distinct from new.title) then
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'title',
        'from', old.title,
        'to', new.title,
        'user_id', uid,
        'timestamp', ts
      )
    );
  end if;

  if (old.description is distinct from new.description) then
    -- Don't store the full text — too noisy and possibly sensitive.
    events := events || jsonb_build_array(
      jsonb_build_object(
        'kind', 'description',
        'user_id', uid,
        'timestamp', ts
      )
    );
  end if;

  if (old.attachments is distinct from new.attachments) then
    select coalesce(jsonb_agg(elem->>'id'), '[]'::jsonb) into old_ids
      from jsonb_array_elements(coalesce(old.attachments, '[]'::jsonb)) elem;
    select coalesce(jsonb_agg(elem->>'id'), '[]'::jsonb) into new_ids
      from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) elem;

    -- additions
    for attach in select * from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) loop
      if not (old_ids @> jsonb_build_array(attach->>'id')) then
        events := events || jsonb_build_array(
          jsonb_build_object(
            'kind', 'attachment_added',
            'name', attach->>'name',
            'user_id', uid,
            'timestamp', ts
          )
        );
      end if;
    end loop;

    -- removals
    for attach in select * from jsonb_array_elements(coalesce(old.attachments, '[]'::jsonb)) loop
      if not (new_ids @> jsonb_build_array(attach->>'id')) then
        events := events || jsonb_build_array(
          jsonb_build_object(
            'kind', 'attachment_removed',
            'name', attach->>'name',
            'user_id', uid,
            'timestamp', ts
          )
        );
      end if;
    end loop;
  end if;

  if (old.custom_fields is distinct from new.custom_fields) then
    -- Diff per key so the log is granular instead of one bulk "changed" entry.
    declare
      keys jsonb := coalesce(
        (
          select jsonb_agg(distinct k)
          from (
            select jsonb_object_keys(coalesce(old.custom_fields, '{}'::jsonb)) k
            union
            select jsonb_object_keys(coalesce(new.custom_fields, '{}'::jsonb)) k
          ) all_keys
        ),
        '[]'::jsonb
      );
      kk text;
      old_v jsonb;
      new_v jsonb;
    begin
      for kk in select jsonb_array_elements_text(keys) loop
        old_v := old.custom_fields -> kk;
        new_v := new.custom_fields -> kk;
        if old_v is distinct from new_v then
          events := events || jsonb_build_array(
            jsonb_build_object(
              'kind', 'custom_field',
              'key', kk,
              'from', old_v,
              'to', new_v,
              'user_id', uid,
              'timestamp', ts
            )
          );
        end if;
      end loop;
    end;
  end if;

  new.activity_log = events;
  return new;
end;
$fn$;

drop trigger if exists tasks_activity_log on buzzybee.tasks;
create trigger tasks_activity_log
  before insert or update on buzzybee.tasks
  for each row execute function buzzybee.tg_tasks_activity_log();

-- ---------------------------------------------------------------
-- Backfill: migrate any existing pre-rename entries (which had shape
-- { status, user_id, timestamp }) to the new shape (with `kind: 'status'`).
-- Idempotent — only touches entries missing the `kind` key.
-- ---------------------------------------------------------------
update buzzybee.tasks
set activity_log = (
  select coalesce(jsonb_agg(
    case
      when entry ? 'kind' then entry
      when entry ? 'status' then jsonb_build_object(
        'kind', 'status',
        'to', entry->>'status',
        'user_id', entry->'user_id',
        'timestamp', entry->'timestamp'
      )
      else entry
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(activity_log) entry
)
where activity_log is not null
  and jsonb_array_length(activity_log) > 0
  and exists (
    select 1 from jsonb_array_elements(activity_log) e
    where not (e ? 'kind')
  );
