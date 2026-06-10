-- Direct messages, modeled as a private 2-person channel. A DM reuses the whole
-- channels/messages/realtime/unread pipeline; it just carries is_dm + a unique
-- dm_key (canonical "loUid:hiUid") so the pair maps to exactly one channel, and
-- a null client_id (DMs are personal, not client-scoped).
alter table buzzybee.channels add column if not exists is_dm boolean not null default false;
alter table buzzybee.channels add column if not exists dm_key text;
alter table buzzybee.channels alter column client_id drop not null;
create unique index if not exists channels_dm_key_uniq on buzzybee.channels(dm_key);

-- Find-or-create a DM between the caller and p_other. SECURITY DEFINER so a VA
-- (who can't normally INSERT channels) can open a DM; both members are seeded.
-- can_see_channel() already grants membership-based visibility, so no SELECT
-- policy change is needed.
create or replace function buzzybee.open_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'buzzybee'
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or p_other is null or v_me = p_other then
    raise exception 'invalid dm participants';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select id into v_id from buzzybee.channels where dm_key = v_key;
  if v_id is null then
    insert into buzzybee.channels (client_id, name, is_private, is_dm, dm_key, created_by)
    values (null, '', true, true, v_key, v_me)
    on conflict (dm_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buzzybee.channels where dm_key = v_key;
    end if;
  end if;
  insert into buzzybee.channel_members (channel_id, user_id, last_read_at)
  values (v_id, v_me, now()), (v_id, p_other, now())
  on conflict (channel_id, user_id) do nothing;
  return v_id;
end;
$$;
grant execute on function buzzybee.open_dm(uuid) to authenticated;
