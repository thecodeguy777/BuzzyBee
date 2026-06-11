-- Channel badges: the list could show unread counts but not "you were
-- mentioned". comms_overview gains a mentions count (unread messages tagging
-- auth.uid() in mentioned_user_ids — replies included, since a thread mention
-- matters). Also: unread now uses IS DISTINCT FROM so authorless system
-- messages (the CRM announcer) count as unread instead of vanishing.

drop function if exists buzzybee.comms_overview(uuid);
create function buzzybee.comms_overview(p_client uuid)
returns table (channel_id uuid, last_message_at timestamptz, unread int, mentions int)
language sql stable security definer
set search_path to ''
as $$
  select c.id,
         max(m.created_at) as last_message_at,
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
  left join buzzybee.messages m on m.channel_id = c.id
  left join buzzybee.channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
  where (p_client is not null and c.client_id = p_client)
     or (c.is_dm and cm.user_id is not null)
  group by c.id, cm.last_read_at;
$$;

grant execute on function buzzybee.comms_overview(uuid) to authenticated;
