-- VA Profiles — a living, shareable online résumé per teammate.
-- Three hats: the VA's own editable page, an internal staffing view,
-- and (when is_public) an anonymous shareable page at /va/{handle}.

create table if not exists buzzybee.va_profiles (
  user_id uuid primary key references buzzybee.profiles(id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  role_title text,
  pronouns text,
  tagline text,
  location text,
  about text,
  contact_email text,
  availability_status text not null default 'open'
    check (availability_status in ('open', 'limited', 'closed')),
  availability_hours integer not null default 10,
  availability_note text,
  -- [{ name, level (0-100), tag }]
  skills jsonb not null default '[]'::jsonb,
  -- [{ name, level }]
  tools jsonb not null default '[]'::jsonb,
  -- [{ client, role, period, blurb }]
  experience jsonb not null default '[]'::jsonb,
  -- [{ id, title, tag, image_url }]
  portfolio jsonb not null default '[]'::jsonb,
  -- ["English (fluent)", ...]
  languages jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table buzzybee.va_profiles enable row level security;

-- Owner manages their own profile.
drop policy if exists "va_profiles_own" on buzzybee.va_profiles;
create policy "va_profiles_own"
  on buzzybee.va_profiles for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Everyone signed in can browse profiles (internal staffing view).
drop policy if exists "va_profiles_select_all" on buzzybee.va_profiles;
create policy "va_profiles_select_all"
  on buzzybee.va_profiles for select
  to authenticated
  using (true);

drop trigger if exists va_profiles_set_updated_at on buzzybee.va_profiles;
create trigger va_profiles_set_updated_at
  before update on buzzybee.va_profiles
  for each row execute function buzzybee.tg_set_updated_at();

-- ---------------------------------------------------------------
-- Live platform stats. SECURITY DEFINER: the public page (and the
-- profile of a teammate whose tasks/time you can't see) still gets
-- aggregate numbers — aggregates only, no row data leaks.
-- ---------------------------------------------------------------
create or replace function buzzybee.va_profile_stats(p_user_id uuid)
returns jsonb
language sql stable security definer
set search_path = buzzybee, public
as $$
  select jsonb_build_object(
    'hours_12mo_seconds', coalesce((
      select sum(extract(epoch from (coalesce(te.ended_at, now()) - te.started_at)))::bigint
      from time_entries te
      where te.va_id = p_user_id
        and te.started_at > now() - interval '12 months'
    ), 0),
    'tasks_done', (
      select count(*) from tasks t
      where t.assignee_id = p_user_id and t.completed_at is not null
    ),
    'ontime_90d_pct', (
      select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where t.completed_at::date <= t.due_on) / count(*))
      end
      from tasks t
      where t.assignee_id = p_user_id
        and t.completed_at > now() - interval '90 days'
        and t.due_on is not null
    ),
    'member_since', (
      select to_char(p.created_at, 'YYYY') from profiles p where p.id = p_user_id
    )
  );
$$;

revoke all on function buzzybee.va_profile_stats(uuid) from public;
grant execute on function buzzybee.va_profile_stats(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Public profile by handle — the one anon entry point for /va/{handle}.
-- Returns null unless the profile exists AND is_public.
-- ---------------------------------------------------------------
create or replace function buzzybee.public_va_profile(p_handle text)
returns jsonb
language sql stable security definer
set search_path = buzzybee, public
as $$
  select jsonb_build_object(
    'profile', to_jsonb(vp.*),
    'name', p.full_name,
    'avatar_url', p.avatar_url,
    'timezone', p.timezone,
    'stats', buzzybee.va_profile_stats(vp.user_id)
  )
  from va_profiles vp
  join profiles p on p.id = vp.user_id
  where vp.handle = lower(p_handle)
    and vp.is_public;
$$;

revoke all on function buzzybee.public_va_profile(text) from public;
grant execute on function buzzybee.public_va_profile(text) to anon, authenticated;
