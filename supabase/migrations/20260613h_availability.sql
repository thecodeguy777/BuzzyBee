-- Manual availability status: the person-set layer on top of automatic
-- presence. Presence answers "is the app open"; availability answers "should
-- you expect me to respond" (away / sleeping / on vacation).
alter table buzzybee.profiles
  add column if not exists availability text not null default 'active'
    check (availability in ('active', 'away', 'sleep', 'vacation')),
  add column if not exists status_note text;
