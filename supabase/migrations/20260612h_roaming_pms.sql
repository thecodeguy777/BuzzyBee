-- Roaming PMs — the settled role model (docs/roles.md):
--   superadmin = admin + mints admins;  admin = PM + staffing/contracts/invites
--   PM = roam + work EVERY client; people & money read-only; may PAUSE an
--        engagement (emergency brake) but not create/resize/end one
--   VA = assigned workspaces;  client = own workspace (Phase 1)
--
-- Mechanics: is_client_pm() becomes role-based, which flips every legacy
-- policy that referenced it (tasks_pm_all, clients_pm_select, task_assignees,
-- task_statuses, assignments_pm_select) to roaming in one stroke. The
-- client_pms table goes dormant — PM access no longer needs per-client rows.

-- ── Ops helper: anyone who runs the work ──────────────────────────────────────
create or replace function buzzybee.is_ops()
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$ select coalesce(buzzybee.current_role() in ('pm', 'admin', 'superadmin'), false) $$;
grant execute on function buzzybee.is_ops() to authenticated;

-- ── PMs roam: redefine the legacy membership check as a role check ────────────
create or replace function buzzybee.is_client_pm(pid uuid, cid uuid)
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$
  select exists (
    select 1 from buzzybee.profiles
    where id = pid and role in ('pm', 'admin', 'superadmin')
  );
$$;

-- Phase-0 helpers follow the same model.
create or replace function buzzybee.accessible_client_ids()
returns setof uuid
language sql stable security definer
set search_path = buzzybee, public
as $$
  select c.id from buzzybee.clients c
    where buzzybee.current_role() in ('admin', 'superadmin', 'pm')
  union
  select a.client_id from buzzybee.assignments a
    where a.status = 'active' and (a.va_id = auth.uid() or a.pm_id = auth.uid())
  union
  select p.client_id from buzzybee.profiles p
    where p.id = auth.uid() and p.role = 'client' and p.client_id is not null
$$;

create or replace function buzzybee.can_manage_client(p_client uuid)
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$ select buzzybee.is_ops() $$;

-- ── People & money stay admin+ ────────────────────────────────────────────────
-- The client record carries monthly_rate / tier / status — PM reads (via the
-- redefined is_client_pm select policy), only admins write.
drop policy if exists clients_pm_update on buzzybee.clients;

-- ── Engagement pause: the PM's emergency brake ────────────────────────────────
-- PMs may flip an engagement active <-> paused and touch nothing else; create,
-- resize (hours/seat), end, and reassign stay admin+. Enforced by a column
-- guard so the policy can stay simple.
drop policy if exists assignments_pm_pause on buzzybee.assignments;
create policy assignments_pm_pause on buzzybee.assignments
  for update to authenticated
  using (buzzybee.is_ops())
  with check (buzzybee.is_ops());

create or replace function buzzybee.tg_assignments_guard_columns()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $$
begin
  if buzzybee.is_admin() then return new; end if;
  if new.va_id is distinct from old.va_id
     or new.client_id is distinct from old.client_id
     or new.pm_id is distinct from old.pm_id
     or new.started_at is distinct from old.started_at
     or new.hours_per_week is distinct from old.hours_per_week
     or new.seat_title is distinct from old.seat_title
     or new.status not in ('active', 'paused')
     or (new.status is distinct from old.status and old.status = 'ended') then
    raise exception 'permission denied: only admins can restaff or resize an engagement — PMs may pause/resume';
  end if;
  -- ended_at follows status; non-admins may not set it directly.
  if new.status = old.status and new.ended_at is distinct from old.ended_at then
    raise exception 'permission denied: only admins can end an engagement';
  end if;
  return new;
end $$;

drop trigger if exists a_assignments_guard_columns on buzzybee.assignments;
create trigger a_assignments_guard_columns
before update on buzzybee.assignments
for each row execute function buzzybee.tg_assignments_guard_columns();

-- ── Roaming PMs see all time data (was: only supervised clients) ──────────────
drop policy if exists time_entries_pm_select on buzzybee.time_entries;
create policy time_entries_pm_select on buzzybee.time_entries
  for select to authenticated
  using (buzzybee.is_ops());

-- ── Engagement enrichment: capacity + roster metadata ─────────────────────────
alter table buzzybee.assignments
  add column if not exists hours_per_week numeric check (hours_per_week is null or (hours_per_week > 0 and hours_per_week <= 80)),
  add column if not exists seat_title text;
