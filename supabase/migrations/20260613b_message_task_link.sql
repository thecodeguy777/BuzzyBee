-- ── Message → task back-link RPC ─────────────────────────────────────────────
--
-- Task-from-message (✅ reaction, hover "Task", /task) creates the task fine
-- for anyone, but the back-link UPDATE on buzzybee.messages.linked_task_id is
-- gated by messages_update RLS (author / admin / client PM only). For everyone
-- else the UPDATE silently matches 0 rows — the linked-task card shows
-- optimistically, then disappears on reload because nothing persisted.
--
-- Fix: a security-definer function that sets ONLY linked_task_id, gated on:
--   • caller can see the message's channel (buzzybee.can_see_channel), and
--   • the task belongs to the channel's client, and
--   • the message isn't already linked (first link wins).
-- This deliberately does NOT widen messages_update — message bodies/pins stay
-- author/manager-only.

create or replace function buzzybee.link_task_to_message(p_message_id uuid, p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_channel uuid;
  v_client uuid;
  v_task_client uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select m.channel_id into v_channel
  from buzzybee.messages m
  where m.id = p_message_id;

  if v_channel is null or not buzzybee.can_see_channel(v_channel) then
    return false;
  end if;

  select c.client_id into v_client
  from buzzybee.channels c
  where c.id = v_channel;

  select t.client_id into v_task_client
  from buzzybee.tasks t
  where t.id = p_task_id;

  -- Task must exist and live under the channel's client (DM channels have no
  -- client and never offer task-from-message).
  if v_task_client is null or v_client is null or v_task_client <> v_client then
    return false;
  end if;

  update buzzybee.messages
     set linked_task_id = p_task_id
   where id = p_message_id
     and linked_task_id is null;

  -- found = whether the link actually landed (false when already linked).
  return found;
end $$;

revoke all on function buzzybee.link_task_to_message(uuid, uuid) from public;
grant execute on function buzzybee.link_task_to_message(uuid, uuid) to authenticated;
