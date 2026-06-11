-- Time system refinements, part 1 (DB):
--  • superadmin had no ledger access — the admin policy literally matched only
--    'admin' (the superadmin role arrived later and never touched these).
--  • runaway sessions: nothing ever closed a forgotten timer (live data had
--    two 34-hour "running" entries). Sessions now hard-cap at 12 hours —
--    auto-closed and flagged in notes, every 30 minutes via pg_cron.

drop policy if exists "time_entries_admin_all" on buzzybee.time_entries;
create policy "time_entries_admin_all"
  on buzzybee.time_entries for all
  to authenticated
  using (buzzybee.current_role() in ('admin', 'superadmin'))
  with check (buzzybee.current_role() in ('admin', 'superadmin'));

create or replace function buzzybee.close_stale_time_entries()
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare n integer;
begin
  update buzzybee.time_entries
     set ended_at = started_at + interval '12 hours',
         status   = 'closed',
         notes    = trim(coalesce(notes, '') || ' [auto-closed: hit the 12h session cap]')
   where status = 'running'
     and started_at < now() - interval '12 hours';
  get diagnostics n = row_count;
  return n;
end $$;

create extension if not exists pg_cron;

-- cron.schedule upserts by name on pg_cron ≥1.4, but guard for replays anyway.
do $$
begin
  perform cron.schedule(
    'bb-close-stale-time-entries',
    '*/30 * * * *',
    $job$ select buzzybee.close_stale_time_entries() $job$
  );
exception when others then
  raise warning 'pg_cron schedule failed: %', sqlerrm;
end $$;
