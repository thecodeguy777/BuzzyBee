-- Comms slash commands: /remind (durable via pg_cron) and /poll (live tally).
--
-- /remind: a reminder is queued against a channel; a 1-minute pg_cron job posts
-- it as a HiveMind announcer message (user_id null) at remind_at and @mentions
-- the creator, so it also lands in their notifications inbox via the existing
-- mention pipeline. Mirrors the bb-close-stale-time-entries cron pattern.
--
-- /poll: the poll definition (question + options) lives on the message; votes
-- ride their own table, fanned out live over the same channel:{id} broadcast as
-- reactions. Single choice, changeable (PK on message_id,user_id).

-- ── /remind ──────────────────────────────────────────────────────────────────
create table if not exists buzzybee.comms_reminders (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references buzzybee.channels(id) on delete cascade,
  created_by  uuid not null references buzzybee.profiles(id) on delete cascade,
  body        text not null,
  remind_at   timestamptz not null,
  fired_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists comms_reminders_due_idx
  on buzzybee.comms_reminders (remind_at) where fired_at is null;

alter table buzzybee.comms_reminders enable row level security;

drop policy if exists comms_reminders_select on buzzybee.comms_reminders;
create policy comms_reminders_select on buzzybee.comms_reminders
  for select to authenticated using (buzzybee.can_see_channel(channel_id));

drop policy if exists comms_reminders_insert on buzzybee.comms_reminders;
create policy comms_reminders_insert on buzzybee.comms_reminders
  for insert to authenticated
  with check (buzzybee.can_see_channel(channel_id) and created_by = auth.uid());

drop policy if exists comms_reminders_manage on buzzybee.comms_reminders;
create policy comms_reminders_manage on buzzybee.comms_reminders
  for delete to authenticated
  using (created_by = auth.uid() or buzzybee.is_admin());

grant select, insert, update, delete on buzzybee.comms_reminders to authenticated;

-- Post each due reminder as a HiveMind announcer message, mention the creator,
-- mark it fired. Security definer so the cron job can write messages.
create or replace function buzzybee.fire_due_reminders()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0;
begin
  for r in
    select * from buzzybee.comms_reminders
    where fired_at is null and remind_at <= now()
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

create extension if not exists pg_cron;
do $$
begin
  perform cron.schedule('bb-fire-comms-reminders', '* * * * *',
    $job$ select buzzybee.fire_due_reminders() $job$);
exception when others then
  raise warning 'pg_cron schedule failed: %', sqlerrm;
end $$;

-- ── /poll ────────────────────────────────────────────────────────────────────
-- { "question": text, "options": [text, ...] }
alter table buzzybee.messages
  add column if not exists poll jsonb;

create table if not exists buzzybee.comms_poll_votes (
  message_id   uuid not null references buzzybee.messages(id) on delete cascade,
  user_id      uuid not null references buzzybee.profiles(id) on delete cascade,
  option_index int not null,
  created_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table buzzybee.comms_poll_votes enable row level security;

drop policy if exists comms_poll_votes_select on buzzybee.comms_poll_votes;
create policy comms_poll_votes_select on buzzybee.comms_poll_votes
  for select to authenticated
  using (exists (select 1 from buzzybee.messages m
                 where m.id = comms_poll_votes.message_id and buzzybee.can_see_channel(m.channel_id)));

drop policy if exists comms_poll_votes_write on buzzybee.comms_poll_votes;
create policy comms_poll_votes_write on buzzybee.comms_poll_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from buzzybee.messages m
                where m.id = comms_poll_votes.message_id and buzzybee.can_see_channel(m.channel_id)));

grant select, insert, update, delete on buzzybee.comms_poll_votes to authenticated;

-- Broadcast votes over the message's channel:{id} topic (mirror broadcast_reaction).
create or replace function buzzybee.broadcast_poll_vote()
returns trigger language plpgsql as $$
declare ch uuid;
begin
  begin
    select m.channel_id into ch from buzzybee.messages m
      where m.id = coalesce(new.message_id, old.message_id);
    if ch is not null then
      perform realtime.broadcast_changes(
        'channel:' || ch::text, tg_op, tg_op, tg_table_name, tg_table_schema, new, old
      );
    end if;
  exception when others then
    raise warning 'broadcast_poll_vote failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists broadcast_poll_vote on buzzybee.comms_poll_votes;
create trigger broadcast_poll_vote
  after insert or update or delete on buzzybee.comms_poll_votes
  for each row execute function buzzybee.broadcast_poll_vote();

do $$
begin
  begin execute 'alter publication supabase_realtime add table buzzybee.comms_poll_votes';
  exception when duplicate_object then null; end;
end $$;
