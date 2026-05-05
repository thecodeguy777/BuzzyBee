-- One-shot recovery: gets you (jayson) to superadmin, ensures Dennis + Mark
-- have proper PM profiles, and gives every client a primary PM if it doesn't
-- already have one. After this, the UI add-PM flow works without bootstrap
-- gymnastics because admin-override kicks in for you everywhere.

-- 1. Grant service_role access to the buzzybee schema (needed for any future
--    JWT-service-role admin scripts; harmless if already granted).
grant usage on schema buzzybee to service_role;
grant all on all tables in schema buzzybee to service_role;
grant all on all sequences in schema buzzybee to service_role;
grant all on all functions in schema buzzybee to service_role;
alter default privileges in schema buzzybee grant all on tables to service_role;
alter default privileges in schema buzzybee grant all on sequences to service_role;
alter default privileges in schema buzzybee grant all on functions to service_role;

-- 2. Promote jayson to superadmin (idempotent).
update buzzybee.profiles
   set role = 'superadmin'
 where email = 'jayson.remigio7@gmail.com';

-- 3. Backfill Dennis + Mark profiles in case the trigger missed them or the
--    seed migration was skipped.
insert into buzzybee.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
  'pm'
from auth.users u
where u.email in ('dennis@buzzybee.ph', 'mark@buzzybee.ph')
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(buzzybee.profiles.full_name, excluded.full_name),
  role = 'pm';

-- 4. For every client without a primary PM, set jayson as primary.
--    This unblocks the "I created a client but RLS won't let me add anyone"
--    state we saw on mikesteel.
do $unblock$
declare
  jay uuid;
begin
  select id into jay from buzzybee.profiles where email = 'jayson.remigio7@gmail.com';
  if jay is null then
    raise notice 'Jayson profile not found — skipping primary backfill.';
    return;
  end if;
  insert into buzzybee.client_pms (client_id, pm_id, is_primary, added_by)
  select c.id, jay, true, jay
    from buzzybee.clients c
    where not exists (
      select 1 from buzzybee.client_pms cp
      where cp.client_id = c.id and cp.is_primary
    )
  on conflict (client_id, pm_id) do update set is_primary = true;
end
$unblock$;

-- 5. Show the current state so you can verify in the SQL editor output.
select email, full_name, role
  from buzzybee.profiles
  where email in ('jayson.remigio7@gmail.com', 'dennis@buzzybee.ph', 'mark@buzzybee.ph');

select c.name as client, p.email as pm, cp.is_primary
  from buzzybee.client_pms cp
  join buzzybee.clients c on c.id = cp.client_id
  join buzzybee.profiles p on p.id = cp.pm_id
  order by c.name, cp.is_primary desc;
