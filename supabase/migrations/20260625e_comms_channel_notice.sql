-- Post a HiveMind announcer message (user_id null) into a channel from the
-- client — e.g. a "set a reminder" notice so the team sees it the moment it's
-- created, not only when it fires. Security definer so it can write a
-- user_id-null message; gated on can_see_channel so a caller can only post into
-- channels they're allowed to see.
create or replace function buzzybee.post_channel_notice(p_channel_id uuid, p_body text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not buzzybee.can_see_channel(p_channel_id) then
    raise exception 'not allowed to post to this channel';
  end if;
  insert into buzzybee.messages (channel_id, user_id, user_name, body)
  values (p_channel_id, null, 'HiveMind', p_body);
end $$;

revoke all on function buzzybee.post_channel_notice(uuid, text) from public;
grant execute on function buzzybee.post_channel_notice(uuid, text) to authenticated;
