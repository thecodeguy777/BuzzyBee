-- Stream time_entries over realtime so the Ambient Hive and the PM dashboard's
-- team-hours update the instant a VA clocks in/out, instead of waiting for the
-- client-side poll backstop. (The Hive subscribes to postgres_changes on this
-- table; without this it falls back to a 45s poll.)
alter publication supabase_realtime add table buzzybee.time_entries;
