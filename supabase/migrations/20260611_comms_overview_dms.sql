-- DM unread counts: comms_overview filtered strictly by client_id, but DMs
-- carry a null client_id (20260610b), so DM channels never appeared and their
-- unread badges stayed empty. Include the caller's DMs alongside the client's
-- channels, and allow a null p_client so DMs still resolve with no client
-- selected. DM membership is always seeded by open_dm, so "cm row exists" is
-- exactly "this DM is mine".

create or replace function buzzybee.comms_overview(p_client uuid)
returns table (channel_id uuid, last_message_at timestamptz, unread int)
language sql stable security definer
set search_path to ''
as $$
  select c.id,
         max(m.created_at) as last_message_at,
         count(m.*) filter (
           where m.parent_id is null
             and m.user_id <> auth.uid()
             and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
         )::int as unread
  from buzzybee.channels c
  left join buzzybee.messages m on m.channel_id = c.id
  left join buzzybee.channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
  where (p_client is not null and c.client_id = p_client)
     or (c.is_dm and cm.user_id is not null)
  group by c.id, cm.last_read_at;
$$;

grant execute on function buzzybee.comms_overview(uuid) to authenticated;
