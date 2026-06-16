-- Flows: a visual, form-triggered automation engine ("level 2 — fire on submit").
--
-- A form can have flows. A flow is a NODE GRAPH (nodes + edges) — the same
-- JSONB-graph idea forms.structure already uses — that runs when someone submits
-- the form. The run-flow edge function executes every reachable node in one pass.
--
-- The schema deliberately reserves what the durable engine (level 3 — Wait /
-- Manual Review) will need, so that layer slots in WITHOUT a rewrite:
--   • graph is nodes+edges (not a linear list) → branching (Choice/Randomize) fits
--   • flow_runs.status reserves 'waiting' → a run can pause and resume
--   • flow_runs.context carries data between nodes
--
-- Trigger path (reliable, server-side): form_responses AFTER INSERT
--   → create one flow_runs row per enabled flow
--   → pg_net POST to the run-flow edge function.
-- The function URL + shared secret live in buzzybee.integration_settings, filled
-- in post-deploy (see the bottom of this file). Until they're set the trigger is
-- a safe no-op: the run rows are still created as 'pending' and can be replayed,
-- so this migration is safe to apply immediately.

create extension if not exists pg_net;

-- ── flows: automations attached to a form (multiple allowed; enabled ones fire) ──
create table if not exists buzzybee.flows (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references buzzybee.forms(id) on delete cascade,
  name text not null default 'Automation',
  -- { "nodes": [{ "id", "type", "config": {...}, "position": {"x","y"} }],
  --   "edges": [{ "id", "source", "target", "condition": {...}? }] }
  -- A 'start' node represents the form submission; executors dispatch by node.type.
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  enabled boolean not null default false,
  created_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flows_form_idx on buzzybee.flows (form_id);
create index if not exists flows_enabled_idx on buzzybee.flows (form_id) where enabled;
drop trigger if exists flows_set_updated_at on buzzybee.flows;
create trigger flows_set_updated_at before update on buzzybee.flows
  for each row execute function buzzybee.tg_set_updated_at();

-- ── flow_runs: one per (flow × submission). Also the audit log + live status. ──
create table if not exists buzzybee.flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references buzzybee.flows(id) on delete cascade,
  form_response_id uuid references buzzybee.form_responses(id) on delete set null,
  -- pending : row created, runner not started yet (or not configured)
  -- running : runner is executing nodes
  -- succeeded / failed : terminal
  -- waiting : RESERVED for level 3 (Wait / Manual Review) — paused mid-flow
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'waiting')),
  context jsonb not null default '{}'::jsonb,   -- answers + per-node outputs, threaded down the graph
  steps jsonb not null default '[]'::jsonb,     -- [{ node_id, type, status, output?, error?, at }]
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists flow_runs_flow_idx on buzzybee.flow_runs (flow_id, created_at desc);
create index if not exists flow_runs_status_idx on buzzybee.flow_runs (status) where status in ('pending', 'waiting');

-- ── integration_settings: env-specific config the DB needs (runner URL + secret) ──
-- Generic key/value, admin-only. Kept out of migrations because the values differ
-- per Supabase project and shouldn't live in source control.
create table if not exists buzzybee.integration_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table buzzybee.flows enable row level security;
alter table buzzybee.flow_runs enable row level security;
alter table buzzybee.integration_settings enable row level security;

-- flows: same audience as the parent form (admin / creator / active assignment)
drop policy if exists "flows_access" on buzzybee.flows;
create policy "flows_access" on buzzybee.flows for all to authenticated
using (exists (
  select 1 from buzzybee.forms f where f.id = flows.form_id and (
    buzzybee.is_admin() or f.created_by = auth.uid()
    or (f.client_id is not null and exists (
      select 1 from buzzybee.assignments a
      where a.client_id = f.client_id and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid()))))))
with check (exists (
  select 1 from buzzybee.forms f where f.id = flows.form_id and (
    buzzybee.is_admin() or f.created_by = auth.uid()
    or (f.client_id is not null and exists (
      select 1 from buzzybee.assignments a
      where a.client_id = f.client_id and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid()))))));

-- flow_runs: read-only to the same audience (writes happen via the runner / trigger)
drop policy if exists "flow_runs_read" on buzzybee.flow_runs;
create policy "flow_runs_read" on buzzybee.flow_runs for select to authenticated
using (exists (
  select 1 from buzzybee.flows fl join buzzybee.forms f on f.id = fl.form_id
  where fl.id = flow_runs.flow_id and (
    buzzybee.is_admin() or f.created_by = auth.uid()
    or (f.client_id is not null and exists (
      select 1 from buzzybee.assignments a
      where a.client_id = f.client_id and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid()))))));

drop policy if exists "integration_settings_admin" on buzzybee.integration_settings;
create policy "integration_settings_admin" on buzzybee.integration_settings for all to authenticated
using (buzzybee.is_admin()) with check (buzzybee.is_admin());

grant select, insert, update, delete on buzzybee.flows to authenticated;
grant select on buzzybee.flow_runs to authenticated;
grant select, insert, update, delete on buzzybee.integration_settings to authenticated;

-- ── trigger: when a response lands, fire the form's enabled flows ─────────────
-- SECURITY DEFINER so it runs regardless of the (often anon) submitter: it creates
-- the flow_runs rows (bypassing RLS) and asks the runner to execute them. If the
-- runner isn't configured yet, the runs stay 'pending' and lose nothing.
create or replace function buzzybee.tg_form_response_run_flows()
returns trigger language plpgsql security definer
set search_path = buzzybee, public as $$
declare
  v_url text;
  v_secret text;
  fl record;
  v_run_id uuid;
begin
  if not exists (select 1 from buzzybee.flows where form_id = NEW.form_id and enabled) then
    return NEW;
  end if;

  select value into v_url    from buzzybee.integration_settings where key = 'flow_runner_url';
  select value into v_secret from buzzybee.integration_settings where key = 'flow_runner_secret';

  for fl in select id from buzzybee.flows where form_id = NEW.form_id and enabled loop
    insert into buzzybee.flow_runs (flow_id, form_response_id, status)
    values (fl.id, NEW.id, 'pending')
    returning id into v_run_id;

    if v_url is not null and v_secret is not null then
      -- Fire-and-forget; pg_net runs the request out of band so the insert isn't blocked.
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-flow-secret', v_secret),
        body    := jsonb_build_object('run_id', v_run_id)
      );
    end if;
  end loop;

  return NEW;
end $$;

drop trigger if exists form_responses_run_flows on buzzybee.form_responses;
create trigger form_responses_run_flows after insert on buzzybee.form_responses
  for each row execute function buzzybee.tg_form_response_run_flows();

-- This is only ever invoked by the trigger above, never as a PostgREST RPC.
-- Revoke direct EXECUTE so anon/authenticated can't call the SECURITY DEFINER
-- function directly (the trigger still fires regardless of these grants).
revoke execute on function buzzybee.tg_form_response_run_flows() from public, anon, authenticated;

-- ── POST-DEPLOY (run once, per environment) ───────────────────────────────────
-- 1. Deploy the `run-flow` edge function (Phase A step 2).
-- 2. Set an edge-function secret  FLOW_RUNNER_SECRET = <random string>.
-- 3. Point the trigger at it (admin SQL — values differ per project):
--      insert into buzzybee.integration_settings (key, value) values
--        ('flow_runner_url',    'https://<project-ref>.supabase.co/functions/v1/run-flow'),
--        ('flow_runner_secret', '<same random string as FLOW_RUNNER_SECRET>')
--      on conflict (key) do update set value = excluded.value, updated_at = now();
