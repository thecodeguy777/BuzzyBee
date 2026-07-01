-- Roaming PMs: align projects RLS with the rest of the model.
--
-- 20260612h_roaming_pms redefined is_client_pm / accessible_client_ids /
-- can_manage_client so any PM can manage any client. tasks_pm_all (20260505)
-- already uses is_client_pm(), so PMs have RLS access to every task. But
-- projects_pm_all was missed — it still gates on assignments.pm_id, so a
-- roaming PM can see every client and every task, yet only the PROJECTS they're
-- explicitly assigned to. Because the workstation reaches a project's task board
-- THROUGH the project, every other project's tasks are invisible to the PM.
--
-- Switch projects_pm_all to the same roaming helper tasks_pm_all uses.
-- Idempotent: drop-then-create.
drop policy if exists projects_pm_all on buzzybee.projects;
create policy projects_pm_all
  on buzzybee.projects for all
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), projects.client_id))
  with check (buzzybee.is_client_pm(auth.uid(), projects.client_id));
