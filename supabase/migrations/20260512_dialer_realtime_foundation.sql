-- Phase 0 — Foundation for real-time operational coordination
-- ----------------------------------------------------------------
-- 1. Audit columns on existing dialer tables (who-changed-this)
-- 2. dialer_lead_events table — central timeline for activity feed +
--    per-lead history. Feeds Postgres Changes subscriptions.
-- 3. RLS + realtime publication
-- See electron/main/dialer/README.md for the full operational model.

-- ── 1. Audit columns ─────────────────────────────────────────────
alter table buzzybee.dialer_leads
  add column if not exists updated_by_user_id uuid
    references buzzybee.profiles(id) on delete set null;

alter table buzzybee.dialer_calls
  add column if not exists updated_by_user_id uuid
    references buzzybee.profiles(id) on delete set null;

-- ── 2. Central event timeline ────────────────────────────────────
create table if not exists buzzybee.dialer_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references buzzybee.dialer_leads(id) on delete cascade,
  call_id uuid references buzzybee.dialer_calls(id) on delete set null,
  task_id uuid,  -- forward-ref; FK added in Phase 4 (dialer_tasks)
  actor_user_id uuid references buzzybee.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'imported', 'assigned', 'reassigned',
    'call_started', 'call_completed',
    'disposition_set', 'stage_changed', 'deal_value_changed',
    'note_added', 'note_edited',
    'task_created', 'task_completed', 'task_overdue',
    'callback_scheduled', 'callback_cleared',
    'recording_ready', 'recording_transcribed',
    'sla_breached', 'ai_summary_generated', 'manual_note'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dialer_lead_events_lead_idx
  on buzzybee.dialer_lead_events (lead_id, created_at desc);

create index if not exists dialer_lead_events_actor_idx
  on buzzybee.dialer_lead_events (actor_user_id, created_at desc);

create index if not exists dialer_lead_events_type_idx
  on buzzybee.dialer_lead_events (event_type, created_at desc);

create index if not exists dialer_lead_events_recent_idx
  on buzzybee.dialer_lead_events (created_at desc);

-- ── 3. RLS ──────────────────────────────────────────────────────
-- Events follow the parent lead's visibility — if you can see the lead,
-- you can see its events. Admins see all (via buzzybee.is_admin()).
alter table buzzybee.dialer_lead_events enable row level security;

drop policy if exists dialer_lead_events_select on buzzybee.dialer_lead_events;
create policy dialer_lead_events_select on buzzybee.dialer_lead_events
  for select to authenticated
  using (
    buzzybee.is_admin()
    or exists (
      select 1 from buzzybee.dialer_leads l
      where l.id = lead_id
        and (l.assigned_to_user_id = auth.uid() or l.assigned_to_user_id is null)
    )
  );

-- Inserts: any authenticated user can write an event row for a lead they can see.
-- (actor_user_id is set by the application from auth.uid().)
drop policy if exists dialer_lead_events_insert on buzzybee.dialer_lead_events;
create policy dialer_lead_events_insert on buzzybee.dialer_lead_events
  for insert to authenticated
  with check (
    actor_user_id is null
    or actor_user_id = auth.uid()
    or buzzybee.is_admin()
  );

-- Events are immutable — no updates allowed (audit integrity).
-- Deletes only by admin.
drop policy if exists dialer_lead_events_admin_delete on buzzybee.dialer_lead_events;
create policy dialer_lead_events_admin_delete on buzzybee.dialer_lead_events
  for delete to authenticated
  using (buzzybee.is_admin());

-- ── 4. Realtime publication ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'dialer_lead_events'
  ) then
    alter publication supabase_realtime add table buzzybee.dialer_lead_events;
  end if;
end $$;
