-- Multi-assignee (Model C) now grants task edit. The legacy tasks_va_update_own
-- only recognized the single assignee_id / created_by — so a VA added via the
-- task_assignees join could toggle their own "done" but couldn't change the task
-- (status/fields), producing a 0-row UPDATE (the 406 "multiple (or no) rows").
-- Add task_assignees membership to the VA update gate.
drop policy if exists tasks_va_update_own on buzzybee.tasks;
create policy tasks_va_update_own on buzzybee.tasks for update
  using (
    (exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id and a.va_id = auth.uid() and a.status = 'active'
    ))
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or exists (
        select 1 from buzzybee.task_assignees ta
        where ta.task_id = tasks.id and ta.user_id = auth.uid()
      )
    )
  )
  with check (
    (exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id and a.va_id = auth.uid() and a.status = 'active'
    ))
    and (
      assignee_id is null
      or buzzybee.is_project_member(project_id, assignee_id)
      or exists (
        select 1 from buzzybee.task_assignees ta
        where ta.task_id = tasks.id and ta.user_id = assignee_id
      )
    )
  );
