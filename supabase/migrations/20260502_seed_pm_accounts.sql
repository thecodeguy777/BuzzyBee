-- One-shot: ensure Dennis and Mark have profiles with role='pm'.
-- Their auth.users rows were created via the admin API; this is the
-- belt-and-suspenders to make sure the buzzybee.profiles row matches.

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

-- Verify
select id, email, full_name, role
  from buzzybee.profiles
  where email in ('dennis@buzzybee.ph', 'mark@buzzybee.ph');
