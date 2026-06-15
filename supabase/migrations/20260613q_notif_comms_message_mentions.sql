-- Comms channel/DM messages already capture mentioned_user_ids (the CommsView
-- composer writes them), but buzzybee.messages had no notify trigger — so a
-- comms @mention only showed an in-app badge/sound, never an inbox row.
-- Mirror the hardened task-comment pattern: SECURITY DEFINER, profile-existence
-- intersect (a stale id can't abort the loop), author excluded, never roll back
-- the message. Reuse source_type='comment' (allowed by the CHECK) + link to the
-- comms home (no per-channel route param exists yet); the link column is what
-- the inbox navigates by.
create or replace function buzzybee.tg_messages_notify()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $$
declare
  author uuid := new.user_id;
  author_name text;
  ch_name text;
  rcpt uuid;
begin
  if new.mentioned_user_ids is null
     or array_length(new.mentioned_user_ids, 1) is null then
    return new;
  end if;

  select coalesce(nullif(new.user_name, ''), p.full_name, 'Someone')
    into author_name
    from buzzybee.profiles p where p.id = author;
  if author_name is null or author_name = '' then author_name := 'Someone'; end if;

  select c.name into ch_name from buzzybee.channels c where c.id = new.channel_id;

  for rcpt in
    select distinct u from unnest(new.mentioned_user_ids) as u
    where u is not null and u <> author
      and exists (select 1 from buzzybee.profiles p where p.id = u)
  loop
    insert into buzzybee.notifications
      (user_id, type, source_type, source_id, source_ref,
       actor_id, actor_name, title, preview, link)
    values (
      rcpt, 'mention', 'comment', new.id, new.channel_id::text,
      author, author_name,
      author_name || ' mentioned you in ' || coalesce(nullif('#' || ch_name, '#'), 'a conversation'),
      left(new.body, 140), '/app/comms'
    );
  end loop;
  return new;
exception when others then
  raise warning 'tg_messages_notify failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists messages_notify on buzzybee.messages;
create trigger messages_notify
  after insert on buzzybee.messages
  for each row execute function buzzybee.tg_messages_notify();
