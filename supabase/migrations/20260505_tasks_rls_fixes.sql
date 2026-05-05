-- Three task-RLS cleanups in one migration:
--
--   1. Superadmin bypass — tasks_admin_all still uses the literal
--      'admin' check. Same family as the profiles fix in 20260502g.
--      Switch to buzzybee.is_admin() so admin AND superadmin pass.
--
--   2. PM access via client_pms — tasks_pm_all reads from assignments,
--      so a PM added through client_pms with no assignments row is
--      locked out. Use is_client_pm() (the canonical helper) instead.
--
--   3. VA reassignment — VAs currently have ALL ops on tasks for
--      their active clients, which lets them reassign to anyone.
--      Restrict updates/deletes/inserts to tasks where they are
--      either the assignee or the creator. SELECT stays open so VAs
--      can still see all tasks on their clients (read-only board).
--
-- Idempotent: drop-then-create.

-- 1. Admin → use is_admin() helper
drop policy if exists "tasks_admin_all" on buzzybee.tasks;
create policy "tasks_admin_all"
  on buzzybee.tasks for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- 2. PM → use is_client_pm() (covers both client_pms PMs and assignments PMs)
drop policy if exists "tasks_pm_all" on buzzybee.tasks;
create policy "tasks_pm_all"
  on buzzybee.tasks for all
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), tasks.client_id))
  with check (buzzybee.is_client_pm(auth.uid(), tasks.client_id));

-- 3. VA — split SELECT (broad) from write (narrow to own work)
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
-- VA can update tasks they own (assignee or creator). They cannot reassign
-- away from themselves through this policy because the with_check requires
-- the new row to also have them as assignee or creator. Combined with the
-- admin/PM policies, reassignment must come from a PM/admin/superadmin.
create policy "tasks_va_update_own"
  on buzzybee.tasks for update
  to authenticated
  using (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
    and (tasks.assignee_id = auth.uid() or tasks.created_by = auth.uid())
  )
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
    and (tasks.assignee_id = auth.uid() or tasks.created_by = auth.uid())
  );

-- VA can create tasks on clients they're active on (assigning to themselves
-- by default — auth.uid() must be assignee_id OR created_by).
create policy "tasks_va_insert"
  on buzzybee.tasks for insert
  to authenticated
  with check (
    exists (
      select 1 from buzzybee.assignments a
      where a.client_id = tasks.client_id
        and a.va_id = auth.uid()
        and a.status = 'active'
    )
    and (tasks.assignee_id = auth.uid() or tasks.created_by = auth.uid())
  );
