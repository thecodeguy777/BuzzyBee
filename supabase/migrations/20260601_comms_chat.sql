-- Comms: team chat. Reconstructed from the deployed database — this was applied
-- remotely as migration 20260601100130 "comms_chat" but never committed to the
-- repo. Recreates the pre-DM state (client_id not null, no is_dm/dm_key) so
-- 20260610b_dm_channels.sql applies on top exactly as it did in production.

-- ── tables ───────────────────────────────────────────────────────────────────

create table if not exists buzzybee.channels (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references buzzybee.clients(id) on delete cascade,
  name        text not null,
  topic       text,
  is_private  boolean not null default false,
  created_by  uuid references buzzybee.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, name)
);

create table if not exists buzzybee.channel_members (
  channel_id   uuid not null references buzzybee.channels(id) on delete cascade,
  user_id      uuid not null references buzzybee.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  pinned       boolean not null default false,
  muted        boolean not null default false,
  joined_at    timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists buzzybee.messages (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null references buzzybee.channels(id) on delete cascade,
  parent_id          uuid references buzzybee.messages(id) on delete cascade,
  user_id            uuid not null references buzzybee.profiles(id),
  user_name          text,
  body               text not null default '',
  attachments        jsonb not null default '[]'::jsonb,
  mentioned_user_ids uuid[] not null default '{}',
  is_pinned          boolean not null default false,
  is_decision        boolean not null default false,
  decision_done      boolean not null default false,
  linked_task_id     uuid references buzzybee.tasks(id) on delete set null,
  edited_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists buzzybee.message_reactions (
  message_id uuid not null references buzzybee.messages(id) on delete cascade,
  user_id    uuid not null references buzzybee.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists messages_channel_created_idx on buzzybee.messages (channel_id, created_at);
create index if not exists messages_parent_idx on buzzybee.messages (parent_id);

-- ── visibility ───────────────────────────────────────────────────────────────

-- Admins see everything; PMs see their clients' channels; VAs see channels of
-- clients they're actively assigned to; explicit members always see the channel.
create or replace function buzzybee.can_see_channel(ch uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select buzzybee.is_admin()
    or exists (
      select 1 from buzzybee.channels c
      where c.id = ch and (
        buzzybee.is_client_pm(auth.uid(), c.client_id)
        or exists (select 1 from buzzybee.assignments a
                   where a.client_id = c.client_id and a.va_id = auth.uid() and a.status = 'active')
        or exists (select 1 from buzzybee.channel_members m
                   where m.channel_id = c.id and m.user_id = auth.uid())
      )
    );
$$;

alter table buzzybee.channels enable row level security;
alter table buzzybee.channel_members enable row level security;
alter table buzzybee.messages enable row level security;
alter table buzzybee.message_reactions enable row level security;

drop policy if exists channels_select on buzzybee.channels;
create policy channels_select on buzzybee.channels
  for select to authenticated
  using (buzzybee.can_see_channel(id));

drop policy if exists channels_manage on buzzybee.channels;
create policy channels_manage on buzzybee.channels
  for all to authenticated
  using (buzzybee.is_admin() or buzzybee.is_client_pm(auth.uid(), client_id))
  with check (buzzybee.is_admin() or buzzybee.is_client_pm(auth.uid(), client_id));

drop policy if exists channel_members_select on buzzybee.channel_members;
create policy channel_members_select on buzzybee.channel_members
  for select to authenticated
  using (buzzybee.can_see_channel(channel_id));

drop policy if exists channel_members_own on buzzybee.channel_members;
create policy channel_members_own on buzzybee.channel_members
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists channel_members_manage on buzzybee.channel_members;
create policy channel_members_manage on buzzybee.channel_members
  for all to authenticated
  using (buzzybee.is_admin() or buzzybee.is_client_pm(auth.uid(),
    (select c.client_id from buzzybee.channels c where c.id = channel_members.channel_id)))
  with check (buzzybee.is_admin() or buzzybee.is_client_pm(auth.uid(),
    (select c.client_id from buzzybee.channels c where c.id = channel_members.channel_id)));

drop policy if exists messages_select on buzzybee.messages;
create policy messages_select on buzzybee.messages
  for select to authenticated
  using (buzzybee.can_see_channel(channel_id));

drop policy if exists messages_insert on buzzybee.messages;
create policy messages_insert on buzzybee.messages
  for insert to authenticated
  with check (buzzybee.can_see_channel(channel_id) and user_id = auth.uid());

drop policy if exists messages_update on buzzybee.messages;
create policy messages_update on buzzybee.messages
  for update to authenticated
  using (user_id = auth.uid() or buzzybee.is_admin() or buzzybee.is_client_pm(auth.uid(),
    (select c.client_id from buzzybee.channels c where c.id = messages.channel_id)));

drop policy if exists messages_delete on buzzybee.messages;
create policy messages_delete on buzzybee.messages
  for delete to authenticated
  using (user_id = auth.uid() or buzzybee.is_admin());

drop policy if exists reactions_select on buzzybee.message_reactions;
create policy reactions_select on buzzybee.message_reactions
  for select to authenticated
  using (exists (select 1 from buzzybee.messages m
                 where m.id = message_reactions.message_id and buzzybee.can_see_channel(m.channel_id)));

drop policy if exists reactions_write on buzzybee.message_reactions;
create policy reactions_write on buzzybee.message_reactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from buzzybee.messages m
                where m.id = message_reactions.message_id and buzzybee.can_see_channel(m.channel_id)));

grant select, insert, update, delete on buzzybee.channels to authenticated;
grant select, insert, update, delete on buzzybee.channel_members to authenticated;
grant select, insert, update, delete on buzzybee.messages to authenticated;
grant select, insert, update, delete on buzzybee.message_reactions to authenticated;

-- ── realtime ─────────────────────────────────────────────────────────────────

-- Low-latency fan-out: messages and reactions are pushed over a private
-- broadcast topic "channel:{id}" via realtime.broadcast_changes.
create or replace function buzzybee.broadcast_message()
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
    raise warning 'broadcast_message failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists broadcast_message on buzzybee.messages;
create trigger broadcast_message
after insert or update or delete on buzzybee.messages
for each row execute function buzzybee.broadcast_message();

create or replace function buzzybee.broadcast_reaction()
returns trigger
language plpgsql
as $$
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
    raise warning 'broadcast_reaction failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists broadcast_reaction on buzzybee.message_reactions;
create trigger broadcast_reaction
after insert or update or delete on buzzybee.message_reactions
for each row execute function buzzybee.broadcast_reaction();

-- Authorize subscribing/publishing on the private channel:{id} topics.
-- NOTE: reproduces the deployed policy verbatim — any authenticated user, no
-- membership check. Tightened in a later migration.
drop policy if exists "bb realtime channel read" on realtime.messages;
create policy "bb realtime channel read" on realtime.messages
  for select to authenticated
  using (topic like 'channel:%');

drop policy if exists "bb realtime channel write" on realtime.messages;
create policy "bb realtime channel write" on realtime.messages
  for insert to authenticated
  with check (topic like 'channel:%');

do $$
declare t text;
begin
  for t in select unnest(array['channels', 'channel_members', 'messages', 'message_reactions']) loop
    begin
      execute format('alter publication supabase_realtime add table buzzybee.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── seed ─────────────────────────────────────────────────────────────────────

-- Every client gets a "general" channel, on creation and backfilled.
create or replace function buzzybee.tg_seed_client_channel()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
begin
  insert into buzzybee.channels (client_id, name, topic)
  values (new.id, 'general', 'Team-wide channel')
  on conflict (client_id, name) do nothing;
  return new;
end $$;

drop trigger if exists tg_seed_client_channel on buzzybee.clients;
create trigger tg_seed_client_channel
after insert on buzzybee.clients
for each row execute function buzzybee.tg_seed_client_channel();

insert into buzzybee.channels (client_id, name, topic)
select id, 'general', 'Team-wide channel' from buzzybee.clients
on conflict (client_id, name) do nothing;
