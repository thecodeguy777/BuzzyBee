-- Nectar — the VA opportunity pool. PMs/admins post open client work;
-- VAs browse, save, and one-click apply with their VA Profile.
-- Tables are named generically (job_*) so the product name can change freely.

create table if not exists buzzybee.job_postings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references buzzybee.clients(id) on delete set null,
  role_title text not null,
  type text not null default 'project'
    check (type in ('ongoing', 'project', 'task', 'trial')),
  hours text,
  rate text,
  urgency text,
  description text,
  -- ["Design 12–16 social assets / week", ...]
  responsibilities jsonb not null default '[]'::jsonb,
  -- ["Figma", "Social media design", ...]
  skills jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'closed')),
  posted_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists buzzybee.job_applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references buzzybee.job_postings(id) on delete cascade,
  va_id uuid not null references buzzybee.profiles(id) on delete cascade,
  note text,
  status text not null default 'sent'
    check (status in ('sent', 'reviewed', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (posting_id, va_id)
);

create table if not exists buzzybee.job_saves (
  posting_id uuid not null references buzzybee.job_postings(id) on delete cascade,
  va_id uuid not null references buzzybee.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (posting_id, va_id)
);

alter table buzzybee.job_postings enable row level security;
alter table buzzybee.job_applications enable row level security;
alter table buzzybee.job_saves enable row level security;

drop trigger if exists job_postings_set_updated_at on buzzybee.job_postings;
create trigger job_postings_set_updated_at
  before update on buzzybee.job_postings
  for each row execute function buzzybee.tg_set_updated_at();

-- Postings: every staff member can browse; PMs/admins manage.
drop policy if exists "job_postings_select" on buzzybee.job_postings;
create policy "job_postings_select"
  on buzzybee.job_postings for select
  to authenticated
  using (buzzybee.is_staff());

drop policy if exists "job_postings_manage" on buzzybee.job_postings;
create policy "job_postings_manage"
  on buzzybee.job_postings for all
  to authenticated
  using (buzzybee.current_role() in ('pm', 'admin', 'superadmin'))
  with check (buzzybee.current_role() in ('pm', 'admin', 'superadmin'));

-- Applications: VAs create and see their own; the poster and admins review.
drop policy if exists "job_applications_insert_own" on buzzybee.job_applications;
create policy "job_applications_insert_own"
  on buzzybee.job_applications for insert
  to authenticated
  with check (va_id = auth.uid());

drop policy if exists "job_applications_select" on buzzybee.job_applications;
create policy "job_applications_select"
  on buzzybee.job_applications for select
  to authenticated
  using (
    va_id = auth.uid()
    or buzzybee.is_admin()
    or exists (
      select 1 from buzzybee.job_postings jp
      where jp.id = posting_id and jp.posted_by = auth.uid()
    )
  );

drop policy if exists "job_applications_review" on buzzybee.job_applications;
create policy "job_applications_review"
  on buzzybee.job_applications for update
  to authenticated
  using (
    buzzybee.is_admin()
    or exists (
      select 1 from buzzybee.job_postings jp
      where jp.id = posting_id and jp.posted_by = auth.uid()
    )
  );

-- Withdrawing: a VA can delete their own application while it's unreviewed.
drop policy if exists "job_applications_withdraw" on buzzybee.job_applications;
create policy "job_applications_withdraw"
  on buzzybee.job_applications for delete
  to authenticated
  using (va_id = auth.uid() and status = 'sent');

-- Saves: strictly personal.
drop policy if exists "job_saves_own" on buzzybee.job_saves;
create policy "job_saves_own"
  on buzzybee.job_saves for all
  to authenticated
  using (va_id = auth.uid())
  with check (va_id = auth.uid());

-- Applicant counts for cards. A plain view runs with owner rights (no
-- security_invoker), deliberately bypassing job_applications RLS — it exposes
-- ONLY the aggregate count per posting, never who applied.
create or replace view buzzybee.job_posting_stats as
  select posting_id, count(*)::int as applicants
  from buzzybee.job_applications
  group by posting_id;

grant select on buzzybee.job_posting_stats to authenticated;
