-- Live updates didn't match the queries: tables gate reads with
-- can_see_channel(), but the private channel:{id} broadcast topics were open to
-- ANY authenticated user — so people could receive live messages for channels
-- the initial query correctly hid. Gate subscribe (select) and client
-- broadcasts like typing indicators (insert) with the same can_see_channel().
-- CASE so the uuid cast only ever runs on well-formed topics.

drop policy if exists "bb realtime channel read" on realtime.messages;
create policy "bb realtime channel read" on realtime.messages
  for select to authenticated
  using (
    case
      when topic ~ '^channel:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then buzzybee.can_see_channel(split_part(topic, ':', 2)::uuid)
      else false
    end
  );

drop policy if exists "bb realtime channel write" on realtime.messages;
create policy "bb realtime channel write" on realtime.messages
  for insert to authenticated
  with check (
    case
      when topic ~ '^channel:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then buzzybee.can_see_channel(split_part(topic, ':', 2)::uuid)
      else false
    end
  );
