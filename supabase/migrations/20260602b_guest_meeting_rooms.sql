-- Comms: shareable meeting links (/meet/<token>) with guest access via a
-- security-definer token lookup. Reconstructed from the deployed database —
-- applied remotely as migration 20260602121815 "guest_meeting_rooms" but never
-- committed to the repo.

create table if not exists buzzybee.meeting_rooms (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  title      text,
  host_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  ended_at   timestamptz
);

alter table buzzybee.meeting_rooms enable row level security;

-- Hosts manage their own rooms; anonymous (guest) sessions cannot create rooms.
drop policy if exists meeting_rooms_host_insert on buzzybee.meeting_rooms;
create policy meeting_rooms_host_insert on buzzybee.meeting_rooms
  for insert to authenticated
  with check (host_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists meeting_rooms_host_select on buzzybee.meeting_rooms;
create policy meeting_rooms_host_select on buzzybee.meeting_rooms
  for select to authenticated
  using (host_id = auth.uid());

drop policy if exists meeting_rooms_host_update on buzzybee.meeting_rooms;
create policy meeting_rooms_host_update on buzzybee.meeting_rooms
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

grant select, insert, update, delete on buzzybee.meeting_rooms to authenticated;

-- Guests hold only the token, so they resolve the room through this
-- security-definer lookup instead of a table policy.
create or replace function buzzybee.get_meeting_room(p_token text)
returns table (id uuid, title text, host_id uuid, expires_at timestamptz, ended_at timestamptz, valid boolean)
language sql security definer
set search_path to 'buzzybee'
as $$
  select m.id, m.title, m.host_id, m.expires_at, m.ended_at,
         (m.ended_at is null and m.expires_at > now()) as valid
  from buzzybee.meeting_rooms m
  where m.token = p_token
  limit 1;
$$;

grant execute on function buzzybee.get_meeting_room(text) to anon, authenticated;

-- Authorize the meet:{token} broadcast/presence topics used by the huddle.
-- NOTE: reproduces the deployed policies verbatim — authenticated only.
drop policy if exists "bb realtime meet read" on realtime.messages;
create policy "bb realtime meet read" on realtime.messages
  for select to authenticated
  using (topic like 'meet:%');

drop policy if exists "bb realtime meet write" on realtime.messages;
create policy "bb realtime meet write" on realtime.messages
  for insert to authenticated
  with check (topic like 'meet:%');
