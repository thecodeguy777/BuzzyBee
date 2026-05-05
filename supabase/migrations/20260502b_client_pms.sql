-- Explicit PM ↔ client link. Replaces the brittle "PM is whoever appears
-- as pm_id on some assignment for this client" pattern with a direct
-- relationship that exists independently of any VA being assigned.

create table if not exists buzzybee.client_pms (
  client_id uuid not null references buzzybee.clients(id) on delete cascade,
  pm_id uuid not null references buzzybee.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  added_at timestamptz not null default now(),
  added_by uuid references buzzybee.profiles(id) on delete set null,
  primary key (client_id, pm_id)
);

-- At most one primary PM per client.
create unique index if not exists client_pms_one_primary_idx
  on buzzybee.client_pms (client_id)
  where is_primary;

create index if not exists client_pms_pm_idx on buzzybee.client_pms (pm_id);

alter table buzzybee.client_pms enable row level security;

-- ---------------------------------------------------------------
-- SECURITY DEFINER helper (avoids policy recursion against client_pms)
-- ---------------------------------------------------------------
create or replace function buzzybee.is_client_pm(pid uuid, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $iscpm$
  select exists (
    select 1 from buzzybee.client_pms
    where client_id = cid and pm_id = pid
  );
$iscpm$;

create or replace function buzzybee.is_client_primary_pm(pid uuid, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $isprim$
  select exists (
    select 1 from buzzybee.client_pms
    where client_id = cid and pm_id = pid and is_primary = true
  );
$isprim$;

grant execute on function buzzybee.is_client_pm(uuid, uuid) to authenticated;
grant execute on function buzzybee.is_client_primary_pm(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------
-- RLS for client_pms
-- ---------------------------------------------------------------

-- Anyone with an active assignment on the client can see its PM list,
-- and any user can see PM rows where they are themselves the PM.
drop policy if exists "client_pms_select" on buzzybee.client_pms;
create policy "client_pms_select"
  on buzzybee.client_pms for select
  to authenticated
  using (
    pm_id = auth.uid()
    or exists (
      select 1 from buzzybee.assignments a
      where a.client_id = client_pms.client_id
        and (a.va_id = auth.uid() or a.pm_id = auth.uid())
        and a.status = 'active'
    )
  );

-- Primary PM can add/remove co-managers and re-assign primary.
drop policy if exists "client_pms_primary_write" on buzzybee.client_pms;
create policy "client_pms_primary_write"
  on buzzybee.client_pms for all
  to authenticated
  using (buzzybee.is_client_primary_pm(auth.uid(), client_id))
  with check (buzzybee.is_client_primary_pm(auth.uid(), client_id));

-- Admin: full access.
drop policy if exists "client_pms_admin_all" on buzzybee.client_pms;
create policy "client_pms_admin_all"
  on buzzybee.client_pms for all
  to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

grant select, insert, update, delete on buzzybee.client_pms to authenticated;

-- realtime (idempotent: only add if not already in the publication)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'buzzybee'
      and tablename = 'client_pms'
  ) then
    alter publication supabase_realtime add table buzzybee.client_pms;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Backfill: seed client_pms from existing assignments.
-- Each unique (client_id, pm_id) becomes a row. The earliest such row
-- per client (by assignment.started_at) becomes is_primary.
-- ---------------------------------------------------------------
-- Step 1 — Insert co-manager rows for every (client_id, pm_id) seen in active assignments.
insert into buzzybee.client_pms (client_id, pm_id, is_primary, added_by)
select distinct on (a.client_id, a.pm_id)
  a.client_id, a.pm_id, false, a.pm_id
from buzzybee.assignments a
where a.pm_id is not null and a.status = 'active'
on conflict (client_id, pm_id) do nothing;

-- Step 2 — For clients that don't yet have a primary, mark the first (by added_at) as primary.
update buzzybee.client_pms cp
  set is_primary = true
  from (
    select distinct on (client_id) client_id, pm_id
    from buzzybee.client_pms
    where not is_primary
    order by client_id, added_at asc
  ) firsts
  where cp.client_id = firsts.client_id
    and cp.pm_id = firsts.pm_id
    and not exists (
      select 1 from buzzybee.client_pms p
      where p.client_id = cp.client_id and p.is_primary
    );

-- ---------------------------------------------------------------
-- Replace clients RLS to source PM-visibility from client_pms.
-- Keeps VA + admin paths intact; PM path now reads from the new table.
-- ---------------------------------------------------------------
drop policy if exists "clients_pm_select" on buzzybee.clients;
create policy "clients_pm_select"
  on buzzybee.clients for select
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), id));

drop policy if exists "clients_pm_update" on buzzybee.clients;
create policy "clients_pm_update"
  on buzzybee.clients for update
  to authenticated
  using (buzzybee.is_client_pm(auth.uid(), id));

-- ---------------------------------------------------------------
-- Trigger: when an assignment row carries a pm_id, add (or keep) that
-- PM in client_pms. Doesn't promote to primary — admins/primaries do
-- that explicitly.
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_assignment_seed_client_pm()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $assignseed$
begin
  if new.pm_id is not null and (tg_op = 'INSERT' or old.pm_id is distinct from new.pm_id) then
    insert into buzzybee.client_pms (client_id, pm_id, is_primary, added_by)
    values (new.client_id, new.pm_id, false, new.pm_id)
    on conflict (client_id, pm_id) do nothing;
  end if;
  return new;
end;
$assignseed$;

drop trigger if exists assignments_seed_client_pm on buzzybee.assignments;
create trigger assignments_seed_client_pm
  after insert or update on buzzybee.assignments
  for each row execute function buzzybee.tg_assignment_seed_client_pm();
