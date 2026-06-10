-- "Seen by" read receipts were trailing behind: channel_members rode the slow
-- postgres_changes WAL path while messages ride the instant broadcast_changes
-- trigger. Give channel_members the same broadcast trigger so receipts propagate
-- on the same private channel:{id} topic, with the same low latency as messages.
create or replace function buzzybee.broadcast_channel_member()
returns trigger
language plpgsql
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'channel:' || coalesce(new.channel_id, old.channel_id)::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  exception when others then
    raise warning 'broadcast_channel_member failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists broadcast_channel_member on buzzybee.channel_members;
create trigger broadcast_channel_member
after insert or update on buzzybee.channel_members
for each row execute function buzzybee.broadcast_channel_member();
