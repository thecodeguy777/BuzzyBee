-- Per-task chat: Broadcast-from-DB on private task:{id} channels.
-- These objects exist in the live DB (task chat already works end-to-end) but
-- were never committed; this backfills them so a fresh rebuild reproduces it.
-- Mirrors the comms channel:* setup in 20260611b_realtime_channel_authz.sql.

create or replace function buzzybee.broadcast_task_comment()
returns trigger language plpgsql as $$
begin
  begin
    perform realtime.broadcast_changes(
      'task:' || coalesce(new.task_id, old.task_id)::text, -- topic
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  exception when others then
    raise warning 'broadcast_task_comment failed: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists broadcast_task_comment on buzzybee.task_comments;
create trigger broadcast_task_comment
  after insert or update or delete on buzzybee.task_comments
  for each row execute function buzzybee.broadcast_task_comment();

-- Realtime broadcast authorization for task:{id} topics.
drop policy if exists "bb realtime task read" on realtime.messages;
create policy "bb realtime task read" on realtime.messages
  for select to authenticated using (topic like 'task:%');

drop policy if exists "bb realtime task write" on realtime.messages;
create policy "bb realtime task write" on realtime.messages
  for insert to authenticated with check (topic like 'task:%');
