-- Meeting records: a durable, AI-summarizable record of a /meet huddle, plus an
-- AUTHORITATIVE (server-reaped) participant roster that ends the client-side
-- "ghost" problem — an abruptly-closed peer can no longer be resurrected from a
-- stale Realtime presence snapshot, because once the reaper deletes the row it
-- simply does not exist for any client to re-pull.
--
-- ⚠ DRAFT FOR REVIEW — NOT APPLIED. Three choices are flagged inline as
--   [DECISION]; settle them before running this against the database.
--
-- Shape
--   buzzybee.meeting_participants  — live roster (client heartbeat + pg_cron reaper)
--   buzzybee.meeting_messages      — durable stream: kind = text | file | system
--   buzzybee.meeting_summaries     — stub for the future AI summary
--   storage bucket 'meeting-attachments'
--   security-definer write RPCs (guest-safe) + Realtime postgres_changes for reads
--   pg_cron job 'bb-reap-meeting-participants'
--
-- Security posture mirrors the existing meet:{token} channel: the unguessable
-- room token is the gate. Guests are anonymous (anon key, no session), so a
-- guest's identity is SELF-ASSERTED — the same trust model the huddle already
-- uses for presence and 'bye'. Authenticated members are pinned to auth.uid()
-- by the RPCs, so a member cannot impersonate another member.

-- ───────────────────────────── tables ──────────────────────────────────────

create table if not exists buzzybee.meeting_participants (
  room_id    uuid not null references buzzybee.meeting_rooms(id) on delete cascade,
  user_id    text not null,                  -- auth uid (member) or guest id (guest)
  name       text not null default 'Guest',
  role       text not null default 'guest',  -- 'host' | 'member' | 'guest'
  muted      boolean not null default false,
  cam        boolean not null default false,
  sharing    boolean not null default false,
  hand       boolean not null default false,
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists meeting_participants_room_idx on buzzybee.meeting_participants (room_id);
create index if not exists meeting_participants_seen_idx on buzzybee.meeting_participants (last_seen);

create table if not exists buzzybee.meeting_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references buzzybee.meeting_rooms(id) on delete cascade,
  user_id    text,                           -- null allowed for pure 'system' rows
  name       text,
  kind       text not null default 'text' check (kind in ('text','file','system')),
  body       text,                           -- chat text, or the system description
  file       jsonb,                          -- {path, filename, mime, size} when kind='file'
  created_at timestamptz not null default now()
);
create index if not exists meeting_messages_room_time_idx on buzzybee.meeting_messages (room_id, created_at);

-- Stub: populated later by an edge function that reads the message stream and
-- calls Claude (latest — Opus 4.8). One summary per room.
create table if not exists buzzybee.meeting_summaries (
  room_id      uuid primary key references buzzybee.meeting_rooms(id) on delete cascade,
  summary      text,
  action_items jsonb,
  model        text,
  created_at   timestamptz not null default now()
);

-- ───────────────────────────── RLS ─────────────────────────────────────────
-- Reads: anyone (anon guest or member) may SELECT rows of a room that is still
-- VALID (not ended/expired). This is what lets Realtime postgres_changes stream
-- the live roster + chat to anonymous guests; the token is the practical gate
-- (you must know it to learn a room_id), exactly like the public meet:{token}
-- channel. The host can also read their own room's record AFTER it ends (for the
-- transcript / AI summary).
-- Writes: NO direct write policy — every insert/update/delete flows through the
-- security-definer RPCs below, which validate the token and pin member identity.
--
-- [SETTLED — anyone with the link] Reads are token-gated: any anon guest or
-- member can read a VALID room's roster + chat, matching the existing meet
-- channel; the token/room_id is the practical gate. (To tighten to host/members
-- only later, swap these anon SELECT policies for host_id/participant checks.)

alter table buzzybee.meeting_participants enable row level security;
alter table buzzybee.meeting_messages     enable row level security;
alter table buzzybee.meeting_summaries    enable row level security;

-- Definer helper so an RLS policy can check room validity without granting the
-- guest direct SELECT on meeting_rooms.
create or replace function buzzybee.meeting_room_is_valid(p_room_id uuid)
returns boolean language sql stable security definer set search_path to 'buzzybee' as $$
  select exists (
    select 1 from buzzybee.meeting_rooms r
    where r.id = p_room_id and r.ended_at is null and r.expires_at > now()
  );
$$;
grant execute on function buzzybee.meeting_room_is_valid(uuid) to anon, authenticated;

drop policy if exists meeting_participants_read on buzzybee.meeting_participants;
create policy meeting_participants_read on buzzybee.meeting_participants
  for select to anon, authenticated
  using (buzzybee.meeting_room_is_valid(room_id));

drop policy if exists meeting_messages_read on buzzybee.meeting_messages;
create policy meeting_messages_read on buzzybee.meeting_messages
  for select to anon, authenticated
  using (buzzybee.meeting_room_is_valid(room_id));

-- Host keeps read access to their room's transcript after it ends (live reads
-- above stop once the room is invalid).
drop policy if exists meeting_messages_host_read on buzzybee.meeting_messages;
create policy meeting_messages_host_read on buzzybee.meeting_messages
  for select to authenticated
  using (exists (select 1 from buzzybee.meeting_rooms r
                 where r.id = room_id and r.host_id = auth.uid()));

drop policy if exists meeting_summaries_host_read on buzzybee.meeting_summaries;
create policy meeting_summaries_host_read on buzzybee.meeting_summaries
  for select to authenticated
  using (exists (select 1 from buzzybee.meeting_rooms r
                 where r.id = room_id and r.host_id = auth.uid()));

grant select on buzzybee.meeting_participants to anon, authenticated;
grant select on buzzybee.meeting_messages     to anon, authenticated;
grant select on buzzybee.meeting_summaries    to authenticated;

-- ───────────────────────── write RPCs (guest-safe) ─────────────────────────
-- Actor id: authenticated members are pinned to auth.uid() (no impersonation).
-- An anonymous guest's asserted id is namespaced as 'guest:<id>' so it can never
-- collide with — i.e. masquerade as — a real member's UUID. All RPCs no-op
-- unless the room is currently valid (meeting_leave also runs for an ended room).

create or replace function buzzybee.meeting_join(
  p_token text, p_user_id text, p_name text, p_role text
) returns void language plpgsql security definer set search_path to 'buzzybee' as $$
declare v_room uuid; v_uid text;
begin
  select id into v_room from buzzybee.meeting_rooms
   where token = p_token and ended_at is null and expires_at > now();
  if v_room is null then return; end if;
  v_uid := case when auth.uid() is null then 'guest:' || p_user_id else auth.uid()::text end;
  if v_uid is null then return; end if;
  insert into buzzybee.meeting_participants (room_id, user_id, name, role, last_seen, joined_at)
  values (v_room, v_uid, coalesce(p_name, 'Guest'), coalesce(p_role, 'guest'), now(), now())
  on conflict (room_id, user_id) do update
    set name = excluded.name, role = excluded.role, last_seen = now();
end $$;

create or replace function buzzybee.meeting_heartbeat(
  p_token text, p_user_id text,
  p_muted boolean, p_cam boolean, p_sharing boolean, p_hand boolean
) returns void language plpgsql security definer set search_path to 'buzzybee' as $$
declare v_room uuid; v_uid text;
begin
  select id into v_room from buzzybee.meeting_rooms
   where token = p_token and ended_at is null and expires_at > now();
  if v_room is null then return; end if;
  v_uid := case when auth.uid() is null then 'guest:' || p_user_id else auth.uid()::text end;
  update buzzybee.meeting_participants
     set last_seen = now(),
         muted   = coalesce(p_muted, muted),
         cam     = coalesce(p_cam, cam),
         sharing = coalesce(p_sharing, sharing),
         hand    = coalesce(p_hand, hand)
   where room_id = v_room and user_id = v_uid;
end $$;

create or replace function buzzybee.meeting_leave(
  p_token text, p_user_id text
) returns void language plpgsql security definer set search_path to 'buzzybee' as $$
declare v_room uuid; v_uid text;
begin
  select id into v_room from buzzybee.meeting_rooms where token = p_token;
  if v_room is null then return; end if;
  v_uid := case when auth.uid() is null then 'guest:' || p_user_id else auth.uid()::text end;
  delete from buzzybee.meeting_participants where room_id = v_room and user_id = v_uid;
end $$;

create or replace function buzzybee.meeting_post_message(
  p_token text, p_user_id text, p_name text,
  p_kind text, p_body text, p_file jsonb
) returns uuid language plpgsql security definer set search_path to 'buzzybee' as $$
declare v_room uuid; v_uid text; v_id uuid;
begin
  select id into v_room from buzzybee.meeting_rooms
   where token = p_token and ended_at is null and expires_at > now();
  if v_room is null then return null; end if;
  if coalesce(p_kind, 'text') not in ('text', 'file', 'system') then return null; end if;
  v_uid := case when auth.uid() is null then 'guest:' || p_user_id else auth.uid()::text end;
  insert into buzzybee.meeting_messages (room_id, user_id, name, kind, body, file)
  values (v_room, v_uid, p_name, coalesce(p_kind, 'text'), p_body, p_file)
  returning id into v_id;
  return v_id;
end $$;

-- Cron-only authoritative reaper. NOT granted to anon/authenticated.
create or replace function buzzybee.meeting_reap()
returns integer language plpgsql security definer set search_path to 'buzzybee' as $$
declare n integer;
begin
  delete from buzzybee.meeting_participants
   where last_seen < now() - interval '30 seconds';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function buzzybee.meeting_join(text, text, text, text)                              to anon, authenticated;
grant execute on function buzzybee.meeting_heartbeat(text, text, boolean, boolean, boolean, boolean)  to anon, authenticated;
grant execute on function buzzybee.meeting_leave(text, text)                                          to anon, authenticated;
grant execute on function buzzybee.meeting_post_message(text, text, text, text, text, jsonb)          to anon, authenticated;

-- ──────────────────────────── storage ──────────────────────────────────────
-- [SETTLED — public] Public bucket (unguessable object path is the gate),
-- matching 'comms-attachments'. Files read via public URL, so anon guests need
-- zero extra read RLS. A 25 MB per-file cap is the abuse guardrail.
insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-attachments', 'meeting-attachments', true, 26214400)
on conflict (id) do nothing;

-- [SETTLED — guests can upload] Insert is open to anon as well as members.
-- RISK: anyone holding the public anon key can write to this bucket (storage RLS
-- can't see the meeting token), so it is spam-able. Mitigations in place: the
-- 25 MB size cap above + the owner-scoped delete below. For stronger control
-- later, route uploads through a token-validating edge function and revoke this
-- anon insert.
drop policy if exists meeting_attachments_insert on storage.objects;
create policy meeting_attachments_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'meeting-attachments');

-- Members can delete their own uploads (owner = their uid). Guest uploads have no
-- owner (anon), so they are not user-deletable — they persist until a retention
-- sweep / room cleanup. No open anon delete, to avoid abuse.
drop policy if exists meeting_attachments_delete on storage.objects;
create policy meeting_attachments_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'meeting-attachments' and owner = auth.uid());

-- ─────────────────────────── realtime ──────────────────────────────────────
-- Stream the live roster + chat to clients via postgres_changes. Default replica
-- identity (PK) is enough: DELETE events carry (room_id,user_id) / id so clients
-- can drop the reaped/removed row.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'buzzybee'
                   and tablename = 'meeting_participants') then
    execute 'alter publication supabase_realtime add table buzzybee.meeting_participants';
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'buzzybee'
                   and tablename = 'meeting_messages') then
    execute 'alter publication supabase_realtime add table buzzybee.meeting_messages';
  end if;
end $$;

-- ─────────────────────────── reaper (pg_cron) ───────────────────────────────
-- Abrupt closes (tab killed, crash, network yank) send no clean leave; this is
-- the AUTHORITATIVE removal. Every 15s, drop participants whose heartbeat is
-- older than 30s (clients heartbeat every ~10s). Once the row is gone, no client
-- resync can resurrect it.
create extension if not exists pg_cron;
do $$
begin
  perform cron.schedule(
    'bb-reap-meeting-participants',
    '15 seconds',  -- sub-minute needs pg_cron >= 1.5 (Supabase has it); fall back to '* * * * *' if not
    $job$ select buzzybee.meeting_reap() $job$
  );
exception when others then
  raise warning 'pg_cron schedule failed: %', sqlerrm;
end $$;
