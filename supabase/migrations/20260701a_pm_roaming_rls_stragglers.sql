-- Roaming PMs, part 2 — the stragglers the 20260612h roaming migration missed.
-- 20260630a fixed projects. This aligns the remaining PM-gated policies so a
-- roaming PM (is_client_pm = role in pm/admin/superadmin) can also reach task
-- custom-field defs, project members, flows, and forms across all clients.
--
-- Existing VA / creator / admin policies are left untouched. Where a policy was
-- PM-only it is replaced; otherwise a companion *_pm_roam policy is added (RLS
-- permissive policies OR together per command, so this only ever GRANTS). Scoped
-- to client-owned rows — personal (client_id null) flows/forms are NOT exposed.
-- Idempotent: drop-then-create.

-- 1. task_field_defs — PM-only policy, the exact same bug as projects_pm_all. Replace.
drop policy if exists task_field_defs_pm_all on buzzybee.task_field_defs;
create policy task_field_defs_pm_all
  on buzzybee.task_field_defs for all
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), client_id))
  with check (buzzybee.is_client_pm(auth.uid(), client_id));

-- 2. project_members — VA-gated select; add roaming PM read via the project's client.
drop policy if exists project_members_pm_roam on buzzybee.project_members;
create policy project_members_pm_roam
  on buzzybee.project_members for select
  to authenticated
  using (exists (
    select 1 from buzzybee.projects p
    where p.id = project_members.project_id
      and buzzybee.is_client_pm(auth.uid(), p.client_id)
  ));

-- 3. flows — VA-gated all; add roaming PM full access to client-owned flows.
drop policy if exists flows_pm_roam on buzzybee.flows;
create policy flows_pm_roam
  on buzzybee.flows for all
  to authenticated
  using (client_id is not null and buzzybee.is_client_pm(auth.uid(), client_id))
  with check (client_id is not null and buzzybee.is_client_pm(auth.uid(), client_id));

-- 4. flow_runs — VA-gated select; add roaming PM read via the flow's client.
drop policy if exists flow_runs_pm_roam on buzzybee.flow_runs;
create policy flow_runs_pm_roam
  on buzzybee.flow_runs for select
  to authenticated
  using (exists (
    select 1 from buzzybee.flows fl
    where fl.id = flow_runs.flow_id
      and fl.client_id is not null
      and buzzybee.is_client_pm(auth.uid(), fl.client_id)
  ));

-- 5. forms — VA-gated all; add roaming PM full access to client-owned forms.
drop policy if exists forms_pm_roam on buzzybee.forms;
create policy forms_pm_roam
  on buzzybee.forms for all
  to authenticated
  using (client_id is not null and buzzybee.is_client_pm(auth.uid(), client_id))
  with check (client_id is not null and buzzybee.is_client_pm(auth.uid(), client_id));

-- 6. form_responses — VA-gated select; add roaming PM read via the form's client.
drop policy if exists form_responses_pm_roam on buzzybee.form_responses;
create policy form_responses_pm_roam
  on buzzybee.form_responses for select
  to authenticated
  using (exists (
    select 1 from buzzybee.forms f
    where f.id = form_responses.form_id
      and f.client_id is not null
      and buzzybee.is_client_pm(auth.uid(), f.client_id)
  ));
