-- Cross-workspace message awareness: a VA on multiple clients had no way to
-- see that another workspace pinged them — badges only existed inside the
-- selected client. This RPC returns unread/mention totals per client workspace
-- (DMs grouped under a null client_id) for every channel the caller can see,
-- so the client switcher can badge each row.

create or replace function buzzybee.comms_unread_by_client()
returns table (client_id uuid, unread int, mentions int)
language sql stable security definer
set search_path to ''
as $$
  select c.client_id,
         count(m.*) filter (
           where m.parent_id is null
             and m.user_id is distinct from auth.uid()
             and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
         )::int as unread,
         count(m.*) filter (
           where m.user_id is distinct from auth.uid()
             and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
             and auth.uid() = any(m.mentioned_user_ids)
         )::int as mentions
  from buzzybee.channels c
  join buzzybee.messages m on m.channel_id = c.id
  left join buzzybee.channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
  where buzzybee.can_see_channel(c.id)
  group by c.client_id;
$$;

grant execute on function buzzybee.comms_unread_by_client() to authenticated;
