-- Group DMs: a multi-party direct message. 1:1 DMs (open_dm) are deduped by a
-- canonical dm_key pair; a group can't be — three people may want more than one
-- thread, and membership shifts as people leave. So a group is an is_dm channel
-- with dm_key NULL (the unique index treats NULLs as distinct, so any number of
-- group threads coexist) and an explicit is_group flag — we can't infer "group"
-- from member count, since a group can shrink to two when someone leaves and
-- would then be indistinguishable from a real 1:1.
alter table buzzybee.channels add column if not exists is_group boolean not null default false;

-- Create a group DM with the caller + p_members, optionally named. SECURITY
-- DEFINER so a VA (no INSERT on channels) can start one and seed the other
-- members. No dedup by design. can_see_channel() grants membership visibility,
-- so no policy change is needed. Mirrors open_dm's trust model: the caller's
-- people-picker is already RLS-gated to who they can see.
create or replace function buzzybee.create_group_dm(p_members uuid[], p_name text default null)
returns uuid
language plpgsql
security definer
set search_path to 'buzzybee'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_others uuid[];
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  -- Distinct members, the caller excluded (re-added explicitly below).
  select array_agg(distinct u) into v_others
  from unnest(coalesce(p_members, '{}'::uuid[])) u
  where u is not null and u <> v_me;
  if v_others is null or array_length(v_others, 1) < 1 then
    raise exception 'a group dm needs at least one other member';
  end if;

  insert into buzzybee.channels (client_id, name, is_private, is_dm, is_group, dm_key, created_by)
  values (null, coalesce(nullif(btrim(p_name), ''), ''), true, true, true, null, v_me)
  returning id into v_id;

  insert into buzzybee.channel_members (channel_id, user_id, last_read_at)
  select v_id, u, now()
  from unnest(v_others || v_me) u
  on conflict (channel_id, user_id) do nothing;

  return v_id;
end;
$$;
grant execute on function buzzybee.create_group_dm(uuid[], text) to authenticated;

-- Leave a group DM (1:1 DMs aren't leavable — there's no thread without both
-- sides). Just drops the caller's membership row, which revokes their
-- visibility via can_see_channel().
create or replace function buzzybee.leave_dm(p_channel uuid)
returns void
language plpgsql
security definer
set search_path to 'buzzybee'
as $$
declare v_me uuid := auth.uid();
begin
  delete from buzzybee.channel_members
   where channel_id = p_channel
     and user_id = v_me
     and exists (
       select 1 from buzzybee.channels c
       where c.id = p_channel and c.is_dm and c.is_group
     );
end;
$$;
grant execute on function buzzybee.leave_dm(uuid) to authenticated;

-- One round-trip for the whole DM list (replaces the client's is_dm query +
-- separate channel_members fetch). Returns every DM I'm in with its other
-- participants and last activity, so the conversation list can render 1:1 and
-- group threads, name them, and sort by recency. RLS-equivalent: the cm join on
-- auth.uid() scopes rows to my own memberships.
create or replace function buzzybee.dm_threads()
returns table (
  channel_id uuid,
  is_group boolean,
  name text,
  members uuid[],
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id,
         c.is_group,
         c.name,
         coalesce(
           array_agg(distinct cm2.user_id) filter (where cm2.user_id <> auth.uid()),
           '{}'::uuid[]
         ) as members,
         (select max(m.created_at) from buzzybee.messages m where m.channel_id = c.id) as last_message_at
  from buzzybee.channels c
  join buzzybee.channel_members cm  on cm.channel_id  = c.id and cm.user_id = auth.uid()
  join buzzybee.channel_members cm2 on cm2.channel_id = c.id
  where c.is_dm
  group by c.id, c.is_group, c.name;
$$;
grant execute on function buzzybee.dm_threads() to authenticated;
