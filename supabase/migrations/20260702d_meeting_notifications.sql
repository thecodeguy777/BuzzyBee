-- Meetings tie-up: reminder notifications + admin oversight.
--
-- 1) notifications gains type 'meeting_starting' (source_type 'meeting') —
--    rides the existing realtime rails (bell, toast, /app/inbox) untouched;
--    openNotification falls through to the row's link (/app/meetings).
-- 2) A pg_cron sweep notifies the HOST ~10 minutes before a scheduled meeting
--    starts. Invitees are external emails (no accounts), so in-app reminders
--    are host-only; invitees have the .ics on their calendar.
-- 3) Admins can read all meeting rooms — powers the "happening now" strip on
--    the admin home. Writes stay host-only.

-- 1) type allowlist. CHECKs can't be extended incrementally — repeat the full
--    current list (from 20260613o) + the new type.
alter table buzzybee.notifications drop constraint if exists notifications_type_check;
alter table buzzybee.notifications add constraint notifications_type_check check (type in (
  'task_assigned', 'task_unassigned', 'task_status_changed', 'task_completed',
  'task_due_soon', 'task_handoff', 'project_added', 'comment', 'mention',
  'ticket_created', 'ticket_status', 'ticket_assigned', 'ticket_comment',
  'subtask_assigned', 'meeting_starting'
));
alter table buzzybee.notifications drop constraint if exists notifications_source_type_check;
alter table buzzybee.notifications add constraint notifications_source_type_check
  check (source_type in ('task', 'project', 'comment', 'ticket', 'meeting'));

-- 2) host reminder, one per room (reminder_sent_at doubles as the dedupe).
alter table buzzybee.meeting_rooms
  add column if not exists reminder_sent_at timestamptz;

create or replace function buzzybee.meeting_reminders()
returns integer language plpgsql security definer set search_path to 'buzzybee' as $$
declare n integer;
begin
  with due as (
    update buzzybee.meeting_rooms r
       set reminder_sent_at = now()
     where r.scheduled_at is not null
       and r.ended_at is null
       and r.reminder_sent_at is null
       and r.scheduled_at > now()
       and r.scheduled_at <= now() + interval '10 minutes'
    returning r.id, r.host_id, r.title, r.scheduled_at
  )
  insert into buzzybee.notifications (user_id, type, source_type, source_id, title, preview, link)
  select d.host_id,
         'meeting_starting',
         'meeting',
         d.id,
         coalesce(d.title, 'Your meeting'),
         'Starts in about '
           || greatest(1, ceil(extract(epoch from (d.scheduled_at - now())) / 60))::int
           || ' min — join from Meetings.',
         '/app/meetings'
    from due d;
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  perform cron.schedule(
    'bb-meeting-reminders',
    '* * * * *',
    $job$ select buzzybee.meeting_reminders() $job$
  );
exception when others then
  raise warning 'pg_cron schedule failed: %', sqlerrm;
end $$;

-- 3) admin oversight read (the Meetings view itself stays host-scoped via an
--    explicit host_id filter in the store).
drop policy if exists meeting_rooms_admin_select on buzzybee.meeting_rooms;
create policy meeting_rooms_admin_select on buzzybee.meeting_rooms
  for select to authenticated
  using (buzzybee.current_role() in ('admin', 'superadmin'));
