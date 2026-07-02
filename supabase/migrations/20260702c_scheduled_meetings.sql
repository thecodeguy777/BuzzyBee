-- Scheduled meetings (GMeet/Zoom-style): a /meet room created ahead of time
-- with a start time and emailed invites.
--
--   * scheduled_at null  = instant room (existing behavior, untouched)
--   * scheduled_at set   = scheduled: the scheduler sets expires_at to
--     scheduled_at + 24h, so the link works from creation until well after
--     the meeting (early joiners just wait in the room — no lobby logic)
--   * invites are written by the send-meeting-invite edge function (service
--     role) so the host can see who was invited and resend

alter table buzzybee.meeting_rooms
  add column if not exists scheduled_at     timestamptz,
  add column if not exists duration_minutes integer;

create table if not exists buzzybee.meeting_invites (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references buzzybee.meeting_rooms(id) on delete cascade,
  email      text not null,
  name       text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists meeting_invites_room_idx on buzzybee.meeting_invites(room_id);
-- One row per address per room — a resend refreshes sent_at instead of piling
-- up duplicates (the edge function upserts on this).
create unique index if not exists meeting_invites_room_email_idx
  on buzzybee.meeting_invites(room_id, email);

alter table buzzybee.meeting_invites enable row level security;

-- Host reads/deletes their room's invites; inserts happen through the edge
-- function (service role), so no authenticated insert policy exists.
drop policy if exists meeting_invites_host_read on buzzybee.meeting_invites;
create policy meeting_invites_host_read on buzzybee.meeting_invites
  for select to authenticated
  using (exists (select 1 from buzzybee.meeting_rooms r
                 where r.id = room_id and r.host_id = auth.uid()));
drop policy if exists meeting_invites_host_delete on buzzybee.meeting_invites;
create policy meeting_invites_host_delete on buzzybee.meeting_invites
  for delete to authenticated
  using (exists (select 1 from buzzybee.meeting_rooms r
                 where r.id = room_id and r.host_id = auth.uid()));

grant select, delete on buzzybee.meeting_invites to authenticated;

-- The Meetings view lists a host's scheduled rooms by start time.
create index if not exists meeting_rooms_host_sched_idx
  on buzzybee.meeting_rooms(host_id, scheduled_at desc)
  where scheduled_at is not null;
