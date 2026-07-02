-- Meetings ↔ clients: an optional client link on meeting rooms.
--
-- Scheduling "for a client" makes invite emails speak the CLIENT's clock —
-- the when-line renders in clients.timezone (20260702a) instead of the
-- host's local zone (a PH host's "9 PM my time" reads "9:00 AM EDT" to the
-- US recipient). The .ics attachment always carried UTC, so calendars were
-- already correct; this fixes the human-readable line. Nullable: personal /
-- non-client meetings stay unlinked.

alter table buzzybee.meeting_rooms
  add column if not exists client_id uuid references buzzybee.clients(id) on delete set null;

comment on column buzzybee.meeting_rooms.client_id is
  'Optional client this meeting is for; invite emails render times in that client''s timezone.';
