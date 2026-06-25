-- Reminders become actionable shared items (Comms "Reminders" rail tab):
--  • done_at = manual completion, separate from the cron's fired_at delivery.
--  • the cron skips done reminders.
--  • update/delete relax to any channel member (collaborative channel reminders),
--    not just the creator — the rail lets the team check off / snooze / clear them.

alter table buzzybee.comms_reminders
  add column if not exists done_at timestamptz;

drop policy if exists comms_reminders_update on buzzybee.comms_reminders;
create policy comms_reminders_update on buzzybee.comms_reminders
  for update to authenticated
  using (buzzybee.can_see_channel(channel_id))
  with check (buzzybee.can_see_channel(channel_id));

drop policy if exists comms_reminders_manage on buzzybee.comms_reminders;
create policy comms_reminders_manage on buzzybee.comms_reminders
  for delete to authenticated
  using (buzzybee.can_see_channel(channel_id));

-- Don't fire reminders that have been marked done.
create or replace function buzzybee.fire_due_reminders()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0;
begin
  for r in
    select * from buzzybee.comms_reminders
    where fired_at is null and done_at is null and remind_at <= now()
    order by remind_at
    limit 200
  loop
    begin
      insert into buzzybee.messages (channel_id, user_id, user_name, body, mentioned_user_ids)
      values (r.channel_id, null, 'HiveMind', '⏰ Reminder: ' || r.body, array[r.created_by]);
      update buzzybee.comms_reminders set fired_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      raise warning 'fire_due_reminders %: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
