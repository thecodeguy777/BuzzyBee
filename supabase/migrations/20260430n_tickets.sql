-- Beta tester ticket system: bug reports, feature requests, questions,
-- general feedback. Anyone can submit; admins triage.
--
-- Tables:
--   buzzybee.tickets          — primary record
--   buzzybee.ticket_comments  — threaded discussion (admin notes can be internal)

create sequence if not exists buzzybee.tickets_ref_seq start 1;

create table if not exists buzzybee.tickets (
  id uuid primary key default gen_random_uuid(),
  reference_number text unique not null
    default ('TKT-' || lpad(nextval('buzzybee.tickets_ref_seq')::text, 4, '0')),
  reporter_id uuid references buzzybee.profiles(id) on delete set null,
  reporter_name text,
  type text not null default 'bug' check (type in ('bug', 'feature_request', 'question', 'feedback')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
  title text not null,
  description text,
  page_url text,
  user_agent text,
  viewport text,
  context jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  assigned_to uuid references buzzybee.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_status_idx on buzzybee.tickets (status, created_at desc);
create index if not exists tickets_reporter_idx on buzzybee.tickets (reporter_id, created_at desc);
create index if not exists tickets_assigned_idx on buzzybee.tickets (assigned_to, status);

drop trigger if exists tickets_set_updated_at on buzzybee.tickets;
create trigger tickets_set_updated_at
  before update on buzzybee.tickets
  for each row execute function buzzybee.tg_set_updated_at();

-- Stamp resolved_at when status flips to a terminal state
create or replace function buzzybee.tg_tickets_resolved_at()
returns trigger language plpgsql as $resolved$
begin
  if (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    if new.status in ('resolved', 'wont_fix', 'duplicate') and old.status not in ('resolved', 'wont_fix', 'duplicate') then
      new.resolved_at = now();
    elsif new.status not in ('resolved', 'wont_fix', 'duplicate') and old.status in ('resolved', 'wont_fix', 'duplicate') then
      new.resolved_at = null;
    end if;
  end if;
  return new;
end;
$resolved$;

drop trigger if exists tickets_resolved_at on buzzybee.tickets;
create trigger tickets_resolved_at
  before update on buzzybee.tickets
  for each row execute function buzzybee.tg_tickets_resolved_at();

alter table buzzybee.tickets enable row level security;

-- Anyone authenticated can SELECT their own tickets
drop policy if exists "tickets_reporter_select" on buzzybee.tickets;
create policy "tickets_reporter_select"
  on buzzybee.tickets for select
  to authenticated
  using (reporter_id = auth.uid());

-- Anyone authenticated can INSERT a ticket as themselves
drop policy if exists "tickets_reporter_insert" on buzzybee.tickets;
create policy "tickets_reporter_insert"
  on buzzybee.tickets for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporters can update their own ticket's title / description / attachments
-- (status / severity changes are admin-only via the admin policy below).
drop policy if exists "tickets_reporter_update" on buzzybee.tickets;
create policy "tickets_reporter_update"
  on buzzybee.tickets for update
  to authenticated
  using (reporter_id = auth.uid())
  with check (reporter_id = auth.uid());

-- Admins see + write everything
drop policy if exists "tickets_admin_all" on buzzybee.tickets;
create policy "tickets_admin_all"
  on buzzybee.tickets for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.tickets to authenticated;
grant usage on sequence buzzybee.tickets_ref_seq to authenticated;

-- ---------------------------------------------------------------
-- ticket_comments
-- ---------------------------------------------------------------
create table if not exists buzzybee.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references buzzybee.tickets(id) on delete cascade,
  user_id uuid not null references buzzybee.profiles(id) on delete cascade,
  user_name text,
  message text not null,
  is_internal boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_comments_ticket_idx
  on buzzybee.ticket_comments (ticket_id, created_at);

drop trigger if exists ticket_comments_set_updated_at on buzzybee.ticket_comments;
create trigger ticket_comments_set_updated_at
  before update on buzzybee.ticket_comments
  for each row execute function buzzybee.tg_set_updated_at();

alter table buzzybee.ticket_comments enable row level security;

-- Reporters see public comments on their own tickets
drop policy if exists "ticket_comments_reporter_select" on buzzybee.ticket_comments;
create policy "ticket_comments_reporter_select"
  on buzzybee.ticket_comments for select
  to authenticated
  using (
    not is_internal and exists (
      select 1 from buzzybee.tickets t
      where t.id = ticket_comments.ticket_id and t.reporter_id = auth.uid()
    )
  );

-- Reporters can insert public comments on their own tickets
drop policy if exists "ticket_comments_reporter_insert" on buzzybee.ticket_comments;
create policy "ticket_comments_reporter_insert"
  on buzzybee.ticket_comments for insert
  to authenticated
  with check (
    not is_internal
    and user_id = auth.uid()
    and exists (
      select 1 from buzzybee.tickets t
      where t.id = ticket_comments.ticket_id and t.reporter_id = auth.uid()
    )
  );

drop policy if exists "ticket_comments_admin_all" on buzzybee.ticket_comments;
create policy "ticket_comments_admin_all"
  on buzzybee.ticket_comments for all
  to authenticated
  using (buzzybee.current_role() = 'admin')
  with check (buzzybee.current_role() = 'admin');

grant select, insert, update, delete on buzzybee.ticket_comments to authenticated;

-- ---------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------
do $tickpub$
begin
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.tickets';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.tickets';
  begin
    execute 'alter publication supabase_realtime drop table buzzybee.ticket_comments';
  exception when undefined_object then null;
  end;
  execute 'alter publication supabase_realtime add table buzzybee.ticket_comments';
end
$tickpub$;

-- ---------------------------------------------------------------
-- Storage bucket for ticket screenshots / files
-- Path: {ticket_id}/{uuid}-{filename}
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-attachments', 'ticket-attachments', false, 26214400, null)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  public = excluded.public;

drop policy if exists "ticket_attachments_select" on storage.objects;
create policy "ticket_attachments_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from buzzybee.tickets t
      where t.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "ticket_attachments_insert" on storage.objects;
create policy "ticket_attachments_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from buzzybee.tickets t
      where t.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "ticket_attachments_delete" on storage.objects;
create policy "ticket_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from buzzybee.tickets t
      where t.id::text = (storage.foldername(name))[1]
    )
  );
