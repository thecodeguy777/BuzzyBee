-- post_channel_notice now RETURNS the inserted message so the client can show it
-- optimistically (a DB-triggered broadcast doesn't reliably echo back to the
-- row's own author). Return-type change requires drop + recreate. Also nudges
-- PostgREST to reload its schema cache so the function is actually exposed.
drop function if exists buzzybee.post_channel_notice(uuid, text);

create function buzzybee.post_channel_notice(p_channel_id uuid, p_body text)
returns buzzybee.messages language plpgsql security definer set search_path to '' as $$
declare m buzzybee.messages;
begin
  if not buzzybee.can_see_channel(p_channel_id) then
    raise exception 'not allowed to post to this channel';
  end if;
  insert into buzzybee.messages (channel_id, user_id, user_name, body)
  values (p_channel_id, null, 'HiveMind', p_body)
  returning * into m;
  return m;
end $$;

revoke all on function buzzybee.post_channel_notice(uuid, text) from public;
grant execute on function buzzybee.post_channel_notice(uuid, text) to authenticated;

notify pgrst, 'reload schema';
