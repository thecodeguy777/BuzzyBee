-- The previous bootstrap policy queried client_pms from inside its own
-- with-check, which made RLS re-enter itself → infinite recursion. Replace
-- with a SECURITY DEFINER helper so the policy doesn't recurse.

create or replace function buzzybee.client_has_primary_pm(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $haspm$
  select exists (
    select 1 from buzzybee.client_pms
    where client_id = cid and is_primary = true
  );
$haspm$;

grant execute on function buzzybee.client_has_primary_pm(uuid) to authenticated;

drop policy if exists "client_pms_self_bootstrap" on buzzybee.client_pms;
create policy "client_pms_self_bootstrap"
  on buzzybee.client_pms for insert
  to authenticated
  with check (
    pm_id = auth.uid()
    and is_primary = true
    and not buzzybee.client_has_primary_pm(client_id)
  );
