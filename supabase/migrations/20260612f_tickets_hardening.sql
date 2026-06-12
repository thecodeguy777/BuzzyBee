-- Tickets hardening + triage upgrade.
--  1. Triage = pm/admin/superadmin (was admin-only — superadmins were locked
--     out and PMs had no elevated access at all).
--  2. Close the reporter RLS hole: the update policy let reporters change ANY
--     column of their own ticket (self-resolve, reassign, bump severity) via
--     the API. A column guard now limits them to title/description/attachments.
--  3. Ticket events land in the in-app inbox: new ticket → triagers,
--     status change → reporter, assignment → assignee, comment → the other side.
--  4. Storage: attachment deletes need to be the uploader or a triager.

-- ── Triage helper ─────────────────────────────────────────────────────────────
create or replace function buzzybee.is_ticket_triager()
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$ select coalesce(buzzybee.current_role() in ('admin','superadmin','pm'), false) $$;
grant execute on function buzzybee.is_ticket_triager() to authenticated;

-- ── RLS: admin-only → triage ──────────────────────────────────────────────────
drop policy if exists "tickets_admin_all" on buzzybee.tickets;
create policy "tickets_triage_all"
  on buzzybee.tickets for all to authenticated
  using (buzzybee.is_ticket_triager())
  with check (buzzybee.is_ticket_triager());

drop policy if exists "ticket_comments_admin_all" on buzzybee.ticket_comments;
create policy "ticket_comments_triage_all"
  on buzzybee.ticket_comments for all to authenticated
  using (buzzybee.is_ticket_triager())
  with check (buzzybee.is_ticket_triager());

-- ── Column guard for reporter updates ─────────────────────────────────────────
-- Named to sort before tickets_resolved_at so it sees the caller's own values.
create or replace function buzzybee.tg_tickets_guard_columns()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $$
begin
  if buzzybee.is_ticket_triager() then return new; end if;
  if new.status is distinct from old.status
     or new.severity is distinct from old.severity
     or new.type is distinct from old.type
     or new.assigned_to is distinct from old.assigned_to
     or new.reporter_id is distinct from old.reporter_id
     or new.reference_number is distinct from old.reference_number
     or new.resolved_at is distinct from old.resolved_at then
    raise exception 'permission denied: only PMs and admins can change ticket status, severity, type, or assignee';
  end if;
  return new;
end $$;

drop trigger if exists a_tickets_guard_columns on buzzybee.tickets;
create trigger a_tickets_guard_columns
before update on buzzybee.tickets
for each row execute function buzzybee.tg_tickets_guard_columns();

-- ── Notifications: allow ticket events ────────────────────────────────────────
alter table buzzybee.notifications drop constraint if exists notifications_type_check;
alter table buzzybee.notifications add constraint notifications_type_check check (type in (
  'task_assigned', 'task_unassigned', 'task_status_changed', 'task_completed',
  'task_due_soon', 'task_handoff', 'project_added', 'comment', 'mention',
  'ticket_created', 'ticket_status', 'ticket_assigned', 'ticket_comment'
));
alter table buzzybee.notifications drop constraint if exists notifications_source_type_check;
alter table buzzybee.notifications add constraint notifications_source_type_check
  check (source_type in ('task', 'project', 'comment', 'ticket'));

-- ── Tickets → inbox ───────────────────────────────────────────────────────────
create or replace function buzzybee.tg_tickets_notify()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $$
declare v_actor_name text;
begin
  select full_name into v_actor_name from buzzybee.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    -- New ticket → every triager except the reporter.
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    select p.id, 'ticket_created', 'ticket', new.id, new.reference_number,
           new.reporter_id, new.reporter_name,
           'New ' || replace(new.type, '_', ' ') || ': ' || new.title,
           left(coalesce(new.description, ''), 140),
           '/app/tickets?t=' || new.id
    from buzzybee.profiles p
    where p.role in ('admin', 'superadmin', 'pm')
      and p.id is distinct from new.reporter_id;
    return null;
  end if;

  -- Status change → the reporter (unless they did it themselves).
  if new.status is distinct from old.status
     and new.reporter_id is not null
     and new.reporter_id is distinct from auth.uid() then
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (new.reporter_id, 'ticket_status', 'ticket', new.id, new.reference_number,
            auth.uid(), v_actor_name,
            new.reference_number || ' is now ' || replace(new.status, '_', ' '),
            new.title, '/app/tickets?t=' || new.id);
  end if;

  -- Assignment → the new assignee (unless self-assigned).
  if new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid() then
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (new.assigned_to, 'ticket_assigned', 'ticket', new.id, new.reference_number,
            auth.uid(), v_actor_name,
            'Ticket assigned to you: ' || new.title,
            new.reference_number, '/app/tickets?t=' || new.id);
  end if;
  return null;
end $$;

drop trigger if exists tickets_notify on buzzybee.tickets;
create trigger tickets_notify
after insert or update on buzzybee.tickets
for each row execute function buzzybee.tg_tickets_notify();

-- ── Comments → inbox ──────────────────────────────────────────────────────────
create or replace function buzzybee.tg_ticket_comments_notify()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $$
declare t record;
begin
  select reporter_id, assigned_to, reference_number, title into t
  from buzzybee.tickets where id = new.ticket_id;
  if t is null then return null; end if;

  -- Public replies → the reporter; any reply → the assignee. Never the author.
  if not new.is_internal
     and t.reporter_id is not null
     and t.reporter_id is distinct from new.user_id then
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (t.reporter_id, 'ticket_comment', 'ticket', new.ticket_id, t.reference_number,
            new.user_id, new.user_name,
            'Reply on ' || t.reference_number || ': ' || t.title,
            left(new.message, 140), '/app/tickets?t=' || new.ticket_id);
  end if;

  if t.assigned_to is not null
     and t.assigned_to is distinct from new.user_id
     and t.assigned_to is distinct from t.reporter_id then
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (t.assigned_to, 'ticket_comment', 'ticket', new.ticket_id, t.reference_number,
            new.user_id, new.user_name,
            'Comment on ' || t.reference_number || ': ' || t.title,
            left(new.message, 140), '/app/tickets?t=' || new.ticket_id);
  end if;
  return null;
end $$;

drop trigger if exists ticket_comments_notify on buzzybee.ticket_comments;
create trigger ticket_comments_notify
after insert on buzzybee.ticket_comments
for each row execute function buzzybee.tg_ticket_comments_notify();

-- ── Storage: deletes need uploader or triager ─────────────────────────────────
drop policy if exists "ticket_attachments_delete" on storage.objects;
create policy "ticket_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (owner = auth.uid() or buzzybee.is_ticket_triager())
  );
