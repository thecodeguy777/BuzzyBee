-- CRM ⇄ Comms bridge, part 1:
--  • chat in a CRM-linked channel counts as "we touched this relationship"
--    (bumps crm_companies.last_activity_at automatically)
--  • the pipeline announces itself: deal created / stage moved / won / lost
--    posts a system message into the deal's linked channel
--
-- System messages are authorless: profiles.id is FK'd to auth.users, so a bot
-- profile would need a fake auth user — instead user_id becomes nullable and
-- the client renders user_name ('HiveMind') with its existing fallbacks.

alter table buzzybee.messages alter column user_id drop not null;

create index if not exists crm_companies_channel_idx on buzzybee.crm_companies(channel_id);
create index if not exists crm_deals_channel_idx     on buzzybee.crm_deals(channel_id);

-- ── chat → CRM: last-activity bump ───────────────────────────────────────────
-- Human messages only (user_id null = announcer; its stage changes shouldn't
-- read as customer engagement).
create or replace function buzzybee.crm_touch_from_message()
returns trigger language plpgsql security definer
set search_path to ''
as $$
begin
  update buzzybee.crm_companies c
    set last_activity_at = greatest(coalesce(c.last_activity_at, 'epoch'::timestamptz), new.created_at)
    where c.channel_id = new.channel_id
       or c.id in (select d.company_id from buzzybee.crm_deals d where d.channel_id = new.channel_id);
  return null;
end $$;

drop trigger if exists crm_touch_from_message on buzzybee.messages;
create trigger crm_touch_from_message
after insert on buzzybee.messages
for each row when (new.user_id is not null)
execute function buzzybee.crm_touch_from_message();

-- ── CRM → chat: pipeline announcer ───────────────────────────────────────────
-- Deliberately omits the deal value: linked channels can be client workspace
-- channels, and dollar figures are internal.
create or replace function buzzybee.crm_announce_deal()
returns trigger language plpgsql security definer
set search_path to ''
as $$
declare v_body text;
begin
  if new.channel_id is null then return null; end if;
  if tg_op = 'INSERT' then
    v_body := '📈 New deal: ' || new.title;
  elsif new.stage is distinct from old.stage then
    if new.stage = 'won' then
      v_body := '🏆 Deal won: ' || new.title;
    elsif new.stage = 'lost' then
      v_body := 'Deal closed (lost): ' || new.title;
    else
      v_body := '📊 ' || new.title || ' moved to ' || initcap(new.stage);
    end if;
  else
    return null;
  end if;
  begin
    insert into buzzybee.messages (channel_id, user_id, user_name, body)
    values (new.channel_id, null, 'HiveMind', v_body);
  exception when others then
    raise warning 'crm_announce_deal failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists crm_announce_deal on buzzybee.crm_deals;
create trigger crm_announce_deal
after insert or update of stage on buzzybee.crm_deals
for each row execute function buzzybee.crm_announce_deal();
