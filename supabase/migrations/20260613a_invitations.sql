-- Pillar B: invitations + deactivation (docs/roles.md).
--  • profiles.is_active — offboard staff without deleting history. Deactivated
--    users fail closed everywhere: the role helpers return nothing for them,
--    so every role-gated policy collapses at once.
--  • invitations — provisioning by invite (staff AND, in Phase 1, client
--    users) instead of by script. The invite-user edge function does the
--    sending; this table is the audit trail + revoke handle.
--  • handle_new_user learns client_id so an invited client user lands wired
--    to their workspace.

-- ── 1. Deactivation switch ────────────────────────────────────────────────────
alter table buzzybee.profiles add column if not exists is_active boolean not null default true;

create or replace function buzzybee.current_role()
returns text
language sql stable security definer
set search_path = buzzybee, public
as $fn$
  select role from buzzybee.profiles where id = auth.uid() and is_active limit 1;
$fn$;

create or replace function buzzybee.is_admin()
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $fn$
  select coalesce(
    (select role in ('admin', 'superadmin') and is_active
       from buzzybee.profiles where id = auth.uid() limit 1),
    false
  );
$fn$;

-- Assignment/client branches also require a live profile.
create or replace function buzzybee.accessible_client_ids()
returns setof uuid
language sql stable security definer
set search_path = buzzybee, public
as $$
  select c.id from buzzybee.clients c
    where buzzybee.current_role() in ('admin', 'superadmin', 'pm')
  union
  select a.client_id from buzzybee.assignments a
    where buzzybee.is_staff()
      and a.status = 'active'
      and (a.va_id = auth.uid() or a.pm_id = auth.uid())
  union
  select p.client_id from buzzybee.profiles p
    where p.id = auth.uid() and p.role = 'client' and p.client_id is not null and p.is_active
$$;

-- ── 2. Invitations ────────────────────────────────────────────────────────────
create table if not exists buzzybee.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null check (role in ('va', 'pm', 'admin', 'sales', 'client')),
  client_id   uuid references buzzybee.clients(id) on delete cascade,
  full_name   text,
  invited_by  uuid references buzzybee.profiles(id) on delete set null,
  -- auth user created at invite time (Supabase invites create the user up front)
  user_id     uuid,
  status      text not null default 'sent' check (status in ('sent', 'accepted', 'revoked')),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint invitations_client_role_needs_client check (role <> 'client' or client_id is not null)
);
create index if not exists invitations_status_idx on buzzybee.invitations(status, created_at desc);

alter table buzzybee.invitations enable row level security;
drop policy if exists invitations_admin_all on buzzybee.invitations;
create policy invitations_admin_all on buzzybee.invitations
  for all to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

-- ── 3. Profile provisioning learns client_id ──────────────────────────────────
create or replace function buzzybee.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $fn$
declare
  meta_role text;
  meta_name text;
  meta_client uuid;
begin
  meta_role := nullif(new.raw_user_meta_data->>'role', '');
  meta_name := nullif(new.raw_user_meta_data->>'full_name', '');
  begin
    meta_client := nullif(new.raw_user_meta_data->>'client_id', '')::uuid;
  exception when others then
    meta_client := null;
  end;

  insert into buzzybee.profiles (id, email, full_name, role, client_id)
  values (
    new.id,
    new.email,
    coalesce(meta_name, split_part(new.email, '@', 1)),
    coalesce(meta_role, 'va'),
    case when coalesce(meta_role, 'va') = 'client' then meta_client else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

-- ── 4. First sign-in marks the invite accepted ────────────────────────────────
create or replace function buzzybee.tg_invite_accepted()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $$
begin
  update buzzybee.invitations
    set status = 'accepted', accepted_at = now()
    where user_id = new.id and status = 'sent';
  return new;
end $$;

drop trigger if exists on_auth_user_signin_buzzybee on auth.users;
create trigger on_auth_user_signin_buzzybee
  after update of last_sign_in_at on auth.users
  for each row
  when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function buzzybee.tg_invite_accepted();
