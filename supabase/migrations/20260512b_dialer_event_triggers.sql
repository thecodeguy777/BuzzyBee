-- Phase 1 — Automatic event emission via DB triggers
-- ----------------------------------------------------------------
-- Every state change in dialer_leads / dialer_calls that matters to the
-- ops timeline automatically appends a row to dialer_lead_events. This
-- guarantees timeline integrity even if a future admin uses psql directly
-- or a different client forgets to emit.
--
-- All trigger functions run SECURITY DEFINER so RLS on dialer_lead_events
-- doesn't reject the auto-inserts (the event itself is then visible to
-- anyone who can see the parent lead via the normal SELECT policy).

-- ── Helper: figure out who the actor is ─────────────────────────
-- Prefer auth.uid() (request-time JWT), fall back to whoever the row
-- attributes itself to.
create or replace function buzzybee.dialer_resolve_actor(
  updated_by uuid,
  agent_user uuid,
  created_by uuid
) returns uuid
language sql immutable as $$
  select coalesce(auth.uid(), updated_by, agent_user, created_by);
$$;

-- ── dialer_leads INSERT → imported event ────────────────────────
create or replace function buzzybee.emit_lead_imported()
returns trigger language plpgsql security definer set search_path = buzzybee, public as $$
begin
  insert into buzzybee.dialer_lead_events (
    lead_id, actor_user_id, event_type, payload
  ) values (
    new.id,
    buzzybee.dialer_resolve_actor(new.updated_by_user_id, null, new.created_by_user_id),
    'imported',
    jsonb_build_object(
      'source', new.source,
      'full_name', new.full_name,
      'phone_e164', new.phone_e164,
      'stage', new.stage,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists dialer_leads_emit_imported on buzzybee.dialer_leads;
create trigger dialer_leads_emit_imported
  after insert on buzzybee.dialer_leads
  for each row execute function buzzybee.emit_lead_imported();

-- ── dialer_leads UPDATE → stage_changed / reassigned / etc. ─────
create or replace function buzzybee.emit_lead_update_events()
returns trigger language plpgsql security definer set search_path = buzzybee, public as $$
declare
  actor uuid := buzzybee.dialer_resolve_actor(new.updated_by_user_id, null, new.created_by_user_id);
begin
  if old.stage is distinct from new.stage then
    insert into buzzybee.dialer_lead_events (
      lead_id, actor_user_id, event_type, payload
    ) values (
      new.id, actor, 'stage_changed',
      jsonb_build_object(
        'from', old.stage,
        'to', new.stage,
        'won_lost_reason', new.won_lost_reason,
        'seconds_in_previous_stage',
          case
            when old.stage_changed_at is not null
              then extract(epoch from (now() - old.stage_changed_at))::int
            else null
          end
      )
    );
  end if;

  if old.deal_value_cents is distinct from new.deal_value_cents then
    insert into buzzybee.dialer_lead_events (
      lead_id, actor_user_id, event_type, payload
    ) values (
      new.id, actor, 'deal_value_changed',
      jsonb_build_object(
        'from_cents', old.deal_value_cents,
        'to_cents', new.deal_value_cents,
        'currency', coalesce(new.deal_currency, 'USD'),
        'close_probability', new.close_probability
      )
    );
  end if;

  if old.assigned_to_user_id is distinct from new.assigned_to_user_id then
    insert into buzzybee.dialer_lead_events (
      lead_id, actor_user_id, event_type, payload
    ) values (
      new.id, actor,
      case
        when old.assigned_to_user_id is null then 'assigned'
        else 'reassigned'
      end,
      jsonb_build_object(
        'from_user_id', old.assigned_to_user_id,
        'to_user_id', new.assigned_to_user_id
      )
    );
  end if;

  if old.next_callback_at is distinct from new.next_callback_at then
    if new.next_callback_at is null then
      insert into buzzybee.dialer_lead_events (
        lead_id, actor_user_id, event_type, payload
      ) values (
        new.id, actor, 'callback_cleared',
        jsonb_build_object('previous_callback_at', old.next_callback_at)
      );
    else
      insert into buzzybee.dialer_lead_events (
        lead_id, actor_user_id, event_type, payload
      ) values (
        new.id, actor, 'callback_scheduled',
        jsonb_build_object('callback_at', new.next_callback_at)
      );
    end if;
  end if;

  if old.notes is distinct from new.notes
     and new.notes is not null and length(trim(new.notes)) > 0 then
    insert into buzzybee.dialer_lead_events (
      lead_id, actor_user_id, event_type, payload
    ) values (
      new.id, actor,
      case
        when old.notes is null or length(trim(old.notes)) = 0 then 'note_added'
        else 'note_edited'
      end,
      jsonb_build_object(
        'previous_length', coalesce(length(old.notes), 0),
        'new_length', length(new.notes)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists dialer_leads_emit_updates on buzzybee.dialer_leads;
create trigger dialer_leads_emit_updates
  after update on buzzybee.dialer_leads
  for each row execute function buzzybee.emit_lead_update_events();

-- ── dialer_calls INSERT → call_started ──────────────────────────
create or replace function buzzybee.emit_call_started()
returns trigger language plpgsql security definer set search_path = buzzybee, public as $$
begin
  if new.lead_id is null then
    return new;
  end if;
  insert into buzzybee.dialer_lead_events (
    lead_id, call_id, actor_user_id, event_type, payload
  ) values (
    new.lead_id,
    new.id,
    buzzybee.dialer_resolve_actor(new.updated_by_user_id, new.agent_user_id, null),
    'call_started',
    jsonb_build_object(
      'direction', new.direction,
      'to_e164', new.to_e164,
      'from_e164', new.from_e164
    )
  );
  return new;
end;
$$;

drop trigger if exists dialer_calls_emit_started on buzzybee.dialer_calls;
create trigger dialer_calls_emit_started
  after insert on buzzybee.dialer_calls
  for each row execute function buzzybee.emit_call_started();

-- ── dialer_calls UPDATE → call_completed / disposition_set / recording_ready ─
create or replace function buzzybee.emit_call_update_events()
returns trigger language plpgsql security definer set search_path = buzzybee, public as $$
declare
  actor uuid := buzzybee.dialer_resolve_actor(new.updated_by_user_id, new.agent_user_id, null);
  terminal_statuses text[] := array['completed', 'failed', 'no-answer', 'busy', 'canceled'];
begin
  if new.lead_id is null then return new; end if;

  if old.status is distinct from new.status
     and new.status = any(terminal_statuses)
     and (old.status is null or not (old.status = any(terminal_statuses))) then
    insert into buzzybee.dialer_lead_events (
      lead_id, call_id, actor_user_id, event_type, payload
    ) values (
      new.lead_id, new.id, actor, 'call_completed',
      jsonb_build_object(
        'status', new.status,
        'duration_sec', new.duration_sec,
        'hangup_cause', new.hangup_cause,
        'answered', new.answered_at is not null
      )
    );
  end if;

  if old.disposition is distinct from new.disposition and new.disposition is not null then
    insert into buzzybee.dialer_lead_events (
      lead_id, call_id, actor_user_id, event_type, payload
    ) values (
      new.lead_id, new.id, actor, 'disposition_set',
      jsonb_build_object(
        'disposition', new.disposition,
        'notes', new.disposition_notes,
        'callback_at', new.callback_at
      )
    );
  end if;

  if (old.recording_url is null or old.recording_url = '')
     and new.recording_url is not null
     and length(new.recording_url) > 0 then
    insert into buzzybee.dialer_lead_events (
      lead_id, call_id, actor_user_id, event_type, payload
    ) values (
      new.lead_id, new.id, actor, 'recording_ready',
      jsonb_build_object(
        'recording_url', new.recording_url,
        'duration_sec', new.recording_duration_sec
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists dialer_calls_emit_updates on buzzybee.dialer_calls;
create trigger dialer_calls_emit_updates
  after update on buzzybee.dialer_calls
  for each row execute function buzzybee.emit_call_update_events();
