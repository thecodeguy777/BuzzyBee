-- Project members + role-based access. Each client has a team (via the
-- assignments table). When a project is created, every active teammate on
-- that client is auto-seeded as a project_member. Roles:
--   lead        — edit project meta, add/remove members, full task ops
--   contributor — create/edit tasks, comment, attach files
--   viewer      — read-only

create table if not exists buzzybee.project_members (
  project_id uuid not null references buzzybee.projects(id) on delete cascade,
  user_id    uuid not null references buzzybee.profiles(id) on delete cascade,
  role       text not null default 'contributor' check (role in ('lead', 'contributor', 'viewer')),
  added_by   uuid references buzzybee.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on buzzybee.project_members (user_id);

alter table buzzybee.project_members enable row level security;

-- ---------------------------------------------------------------
-- SECURITY DEFINER helpers (avoid RLS recursion in policies)
-- ---------------------------------------------------------------
create or replace function buzzybee.is_project_lead(uid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path = buzzybee, public
as $islead$
  select exists (
    select 1 from buzzybee.project_members
    where project_id = pid and user_id = uid and role = 'lead'
  );
$islead$;

grant execute on function buzzybee.is_project_lead(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------
-- RLS for project_members
-- ---------------------------------------------------------------

-- Anyone with an active assignment on the project's client can SEE its
-- member list. Keeps team visibility intuitive without auto-granting writes.
drop policy if exists "project_members_select" on buzzybee.project_members;
create policy "project_members_select"
  on buzzybee.project_members for select
  to authenticated
  using (
    exists (
      select 1 from buzzybee.projects p
      join buzzybee.assignments a on a.client_id = p.client_id
      where p.id = project_members.project_id
        and (a.va_id = auth.uid() or a.pm_id = auth.uid())
        and a.status = 'active'
    )
  );

-- Leads + admins can add / remove / change roles.
drop policy if exists "project_members_lead_write" on buzzybee.project_members;
create policy "project_members_lead_write"
  on buzzybee.project_members for all
  to authenticated
  using (buzzybee.is_project_lead(auth.uid(), project_id))
  with check (buzzybee.is_project_lead(auth.uid(), project_id));

drop policy if exists "project_members_admin_all" on buzzybee.project_members;
create policy "project_members_admin_all"
  on buzzybee.project_members for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

-- ---------------------------------------------------------------
-- Auto-seed: when a project is created, fill members from the client's
-- existing assignments.
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_project_seed_members()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $seedproj$
begin
  -- Creator as lead
  if new.created_by is not null then
    insert into buzzybee.project_members (project_id, user_id, role, added_by)
    values (new.id, new.created_by, 'lead', new.created_by)
    on conflict (project_id, user_id) do nothing;
  end if;

  -- VAs as contributors
  insert into buzzybee.project_members (project_id, user_id, role, added_by)
  select new.id, a.va_id, 'contributor', new.created_by
    from buzzybee.assignments a
    where a.client_id = new.client_id
      and a.status = 'active'
      and a.va_id is not null
  on conflict (project_id, user_id) do nothing;

  -- PMs as leads (overwrite if already added as contributor)
  insert into buzzybee.project_members (project_id, user_id, role, added_by)
  select new.id, a.pm_id, 'lead', new.created_by
    from buzzybee.assignments a
    where a.client_id = new.client_id
      and a.status = 'active'
      and a.pm_id is not null
  on conflict (project_id, user_id) do update
    set role = 'lead'
    where buzzybee.project_members.role = 'contributor';

  return new;
end;
$seedproj$;

drop trigger if exists projects_seed_members on buzzybee.projects;
create trigger projects_seed_members
  after insert on buzzybee.projects
  for each row execute function buzzybee.tg_project_seed_members();

-- ---------------------------------------------------------------
-- Auto-seed: when an assignment is added (or activated), fill that user
-- onto every existing project for that client.
-- ---------------------------------------------------------------
create or replace function buzzybee.tg_assignment_seed_members()
returns trigger
language plpgsql
security definer
set search_path = buzzybee, public
as $seedassign$
begin
  if (tg_op = 'INSERT' and new.status = 'active') or
     (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'active') then
    if new.va_id is not null then
      insert into buzzybee.project_members (project_id, user_id, role, added_by)
      select p.id, new.va_id, 'contributor', new.va_id
        from buzzybee.projects p
        where p.client_id = new.client_id
      on conflict (project_id, user_id) do nothing;
    end if;
    if new.pm_id is not null then
      insert into buzzybee.project_members (project_id, user_id, role, added_by)
      select p.id, new.pm_id, 'lead', new.pm_id
        from buzzybee.projects p
        where p.client_id = new.client_id
      on conflict (project_id, user_id) do update
        set role = 'lead'
        where buzzybee.project_members.role = 'contributor';
    end if;
  end if;
  return new;
end;
$seedassign$;

drop trigger if exists assignments_seed_members on buzzybee.assignments;
create trigger assignments_seed_members
  after insert or update on buzzybee.assignments
  for each row execute function buzzybee.tg_assignment_seed_members();

-- ---------------------------------------------------------------
-- Backfill: existing projects × existing active assignments.
-- ---------------------------------------------------------------
do $bf$
begin
  insert into buzzybee.project_members (project_id, user_id, role, added_by)
  select p.id, a.va_id, 'contributor', a.va_id
    from buzzybee.projects p
    join buzzybee.assignments a on a.client_id = p.client_id
    where a.status = 'active' and a.va_id is not null
  on conflict (project_id, user_id) do nothing;

  insert into buzzybee.project_members (project_id, user_id, role, added_by)
  select p.id, a.pm_id, 'lead', a.pm_id
    from buzzybee.projects p
    join buzzybee.assignments a on a.client_id = p.client_id
    where a.status = 'active' and a.pm_id is not null
  on conflict (project_id, user_id) do update
    set role = 'lead'
    where buzzybee.project_members.role = 'contributor';

  -- Project creators that aren't already on the list as lead
  insert into buzzybee.project_members (project_id, user_id, role, added_by)
  select id, created_by, 'lead', created_by
    from buzzybee.projects
    where created_by is not null
  on conflict (project_id, user_id) do update
    set role = 'lead'
    where buzzybee.project_members.role <> 'lead';
end
$bf$;

grant select, insert, update, delete on buzzybee.project_members to authenticated;

-- realtime
do $pub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.project_members';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.project_members';
end
$pub$;

-- ---------------------------------------------------------------
-- Tighten profiles RLS: replace the broad "PM sees all profiles" rule
-- with team-scoped visibility. A user can see profiles of teammates —
-- people who share an active assignment on a client they're on.
-- ---------------------------------------------------------------
drop policy if exists "profiles_pm_select_all" on buzzybee.profiles;
drop policy if exists "profiles_select_teammates" on buzzybee.profiles;
create policy "profiles_select_teammates"
  on buzzybee.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1
      from buzzybee.assignments mine
      join buzzybee.assignments theirs on theirs.client_id = mine.client_id
      where (mine.va_id = auth.uid() or mine.pm_id = auth.uid())
        and mine.status = 'active'
        and theirs.status = 'active'
        and (theirs.va_id = profiles.id or theirs.pm_id = profiles.id)
    )
  );
