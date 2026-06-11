-- Comms: per-channel last-activity + unread counts in one round trip.
-- Reconstructed from the deployed database — applied remotely as migration
-- 20260601100254 "comms_overview_rpc" but never committed to the repo.
-- NOTE: reproduces the deployed function verbatim, including the client_id
-- filter that excludes DMs (client_id is null) — fixed in a later migration.

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
  where c.client_id = p_client
  group by c.id, cm.last_read_at;
$$;

grant execute on function buzzybee.comms_overview(uuid) to authenticated;
