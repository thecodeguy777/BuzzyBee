-- Flows v2 — generalize from form-only to an event-driven automation platform.
--
-- A flow now belongs to a CLIENT and carries a TRIGGER ({type, config}); "form
-- submitted" is just trigger type #1. A shared dispatcher routes ANY event to the
-- flows whose trigger matches, then starts a run (same run-flow runner).
--
-- Back-compat: the form-submitted path is unchanged for the runner — the
-- dispatcher still stamps form_response_id on those runs, so run-flow keeps
-- working as-is until its context builder is generalized for other triggers.

-- 1) flows: client scope + trigger config (form_id kept, now nullable)
alter table buzzybee.flows
  add column if not exists client_id uuid references buzzybee.clients(id) on delete cascade,
  add column if not exists trigger jsonb not null default '{"type":"manual","config":{}}'::jsonb;
alter table buzzybee.flows alter column form_id drop not null;

-- existing flows are all form-submitted — file them under their form's client + trigger
update buzzybee.flows fl
set client_id = coalesce(fl.client_id, f.client_id),
    trigger = jsonb_build_object('type', 'form_submitted', 'config', jsonb_build_object('form_id', fl.form_id::text))
from buzzybee.forms f
where fl.form_id = f.id and fl.trigger->>'type' = 'manual';

create index if not exists flows_client_enabled_idx on buzzybee.flows (client_id) where enabled;

-- 2) flow_runs: what fired it (trigger_type + the source record)
alter table buzzybee.flow_runs
  add column if not exists trigger_type text,
  add column if not exists source jsonb not null default '{}'::jsonb;

-- 3) RLS scopes by the flow's client now (matches CRM/Comms), not via the form
drop policy if exists "flows_access" on buzzybee.flows;
create policy "flows_access" on buzzybee.flows for all to authenticated
using (
  buzzybee.is_admin() or created_by = auth.uid()
  or (client_id is not null and exists (
    select 1 from buzzybee.assignments a where a.client_id = flows.client_id and a.status = 'active'
      and (a.va_id = auth.uid() or a.pm_id = auth.uid())))
)
with check (
  buzzybee.is_admin() or created_by = auth.uid()
  or (client_id is not null and exists (
    select 1 from buzzybee.assignments a where a.client_id = flows.client_id and a.status = 'active'
      and (a.va_id = auth.uid() or a.pm_id = auth.uid())))
);

drop policy if exists "flow_runs_read" on buzzybee.flow_runs;
create policy "flow_runs_read" on buzzybee.flow_runs for select to authenticated
using (exists (
  select 1 from buzzybee.flows fl where fl.id = flow_runs.flow_id and (
    buzzybee.is_admin() or fl.created_by = auth.uid()
    or (fl.client_id is not null and exists (
      select 1 from buzzybee.assignments a where a.client_id = fl.client_id and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid()))))));

-- 4) the dispatcher — the single front door every event knocks on.
-- Matches enabled flows by: same client + trigger type + the flow's trigger.config
-- is a subset of the event source (jsonb @>). So a flow can filter by form_id /
-- project_id / stage with NO bespoke code per trigger type.
create or replace function buzzybee.dispatch_flow(p_trigger_type text, p_client_id uuid, p_source jsonb)
returns void language plpgsql security definer
set search_path = buzzybee, public as $$
declare
  v_url text; v_secret text; fl record; v_run_id uuid;
begin
  if p_client_id is null then return; end if;
  select value into v_url    from buzzybee.integration_settings where key = 'flow_runner_url';
  select value into v_secret from buzzybee.integration_settings where key = 'flow_runner_secret';
  for fl in
    select id from buzzybee.flows
    where enabled and client_id = p_client_id and trigger->>'type' = p_trigger_type
      and p_source @> coalesce(trigger->'config', '{}'::jsonb)
  loop
    insert into buzzybee.flow_runs (flow_id, trigger_type, source, form_response_id, status)
    values (fl.id, p_trigger_type, p_source, nullif(p_source->>'response_id', '')::uuid, 'pending')
    returning id into v_run_id;
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-flow-secret', v_secret),
        body := jsonb_build_object('run_id', v_run_id));
    end if;
  end loop;
end $$;
revoke execute on function buzzybee.dispatch_flow(text, uuid, jsonb) from public, anon, authenticated;

-- 5) rewire the form-submission trigger to go through the dispatcher
create or replace function buzzybee.tg_form_response_run_flows()
returns trigger language plpgsql security definer
set search_path = buzzybee, public as $$
declare v_client uuid;
begin
  select client_id into v_client from buzzybee.forms where id = NEW.form_id;
  perform buzzybee.dispatch_flow(
    'form_submitted', v_client,
    jsonb_build_object('form_id', NEW.form_id::text, 'response_id', NEW.id::text, 'values', NEW.values));
  return NEW;
end $$;
