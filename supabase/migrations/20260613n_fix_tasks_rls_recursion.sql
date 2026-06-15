-- Fix: "infinite recursion detected in policy for relation tasks".
--
-- 20260613m added an inline `exists (select 1 from task_assignees ...)` to the
-- tasks UPDATE policy. But task_assignees' own policies subquery tasks back
-- (e.g. task_assignees_select: exists(select 1 from tasks t where ...)), so
-- evaluating the tasks policy forced re-evaluation of the tasks policy:
--
--     tasks (UPDATE) -> task_assignees (RLS) -> tasks (RLS) -> ...
--
-- Postgres detects the loop and aborts every task update with the recursion
-- error. Before 20260613m the reference was one-way (task_assignees -> tasks
-- only), so there was no cycle.
--
-- Fix: route the membership check through a SECURITY DEFINER helper that reads
-- task_assignees with RLS bypassed (owner = postgres, which bypasses RLS), so
-- the tasks policy no longer re-enters task_assignees' RLS. This is the same
-- pattern the codebase already uses for is_project_member / is_client_pm.

create or replace function buzzybee.is_task_assignee(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $$
  select exists (
    select 1 from buzzybee.task_assignees ta
    where ta.task_id = p_task_id and ta.user_id = p_user_id
  );
$$;

grant execute on function buzzybee.is_task_assignee(uuid, uuid) to authenticated;

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
      or buzzybee.is_task_assignee(tasks.id, auth.uid())
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
      or buzzybee.is_task_assignee(tasks.id, assignee_id)
    )
  );
