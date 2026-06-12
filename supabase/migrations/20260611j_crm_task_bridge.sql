-- Tasks ⇄ CRM bridge: make the task side of a deal link first-class.
--  • completing a task that's linked to a deal logs itself on the deal's
--    timeline (type 'task'), which bumps company last-activity through the
--    existing crm_activity_touch trigger — the mirror of crm_announce_deal
--  • task → deal lookups get an index (the join table only indexed deal_id)

create index if not exists crm_deal_tasks_task_idx on buzzybee.crm_deal_tasks(task_id);

-- "Done" is per-project (task_statuses.is_done), so resolve both sides of the
-- status change against their project's columns. Best-effort like the comms
-- announcer: a CRM hiccup must never block a task update.
create or replace function buzzybee.crm_log_task_completion()
returns trigger language plpgsql security definer
set search_path to ''
as $$
declare v_was_done boolean; v_is_done boolean;
begin
  select coalesce(bool_or(s.is_done), false) into v_was_done
    from buzzybee.task_statuses s
    where s.project_id = old.project_id and s.key = old.status;
  select coalesce(bool_or(s.is_done), false) into v_is_done
    from buzzybee.task_statuses s
    where s.project_id = new.project_id and s.key = new.status;
  if v_is_done and not v_was_done then
    begin
      insert into buzzybee.crm_deal_activities (deal_id, type, actor_id, body, meta)
      select dt.deal_id, 'task', auth.uid(),
             'completed task "' || new.title || '"', new.reference_number
        from buzzybee.crm_deal_tasks dt
        where dt.task_id = new.id;
    exception when others then
      raise warning 'crm_log_task_completion failed: %', sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists crm_log_task_completion on buzzybee.tasks;
create trigger crm_log_task_completion
after update of status, project_id on buzzybee.tasks
for each row when (old.status is distinct from new.status or old.project_id is distinct from new.project_id)
execute function buzzybee.crm_log_task_completion();
