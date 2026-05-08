-- HiveMind AI: meeting transcripts + summaries
-- Stores meeting recordings (transcript + AI-generated summary) for
-- VA-client meetings captured by the HiveMind AI desktop app.

-- ---------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------
create table if not exists buzzybee.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references buzzybee.profiles(id) on delete set null,
  client_id uuid references buzzybee.clients(id) on delete set null,
  title text,
  capture_mode text default 'mic'
    check (capture_mode in ('mic', 'system', 'both')),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  transcript jsonb not null default '[]'::jsonb,
  -- [{speaker, text, timestamp, isFinal}]
  raw_text text,
  -- plain-text concatenation of finals, used for search
  summary_text text,
  -- structured JSON returned by Gemini
  key_decisions jsonb default '[]'::jsonb,
  action_items jsonb default '[]'::jsonb,
  follow_ups jsonb default '[]'::jsonb,
  coaching_prompts jsonb default '[]'::jsonb,
  -- [{text, timestamp}] all coaching prompts surfaced during the call
  model_used text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_user_idx on buzzybee.meetings (user_id, started_at desc);
create index if not exists meetings_client_idx on buzzybee.meetings (client_id, started_at desc);

-- ---------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------
create or replace function buzzybee.touch_meetings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meetings_touch_updated_at on buzzybee.meetings;
create trigger meetings_touch_updated_at
  before update on buzzybee.meetings
  for each row execute function buzzybee.touch_meetings_updated_at();

-- ---------------------------------------------------------------
-- RLS: users see/edit only their own meetings (admins see all)
-- ---------------------------------------------------------------
alter table buzzybee.meetings enable row level security;

drop policy if exists meetings_select_own on buzzybee.meetings;
create policy meetings_select_own on buzzybee.meetings
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from buzzybee.profiles
      where id = auth.uid()
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists meetings_insert_own on buzzybee.meetings;
create policy meetings_insert_own on buzzybee.meetings
  for insert with check (user_id = auth.uid() or user_id is null);

drop policy if exists meetings_update_own on buzzybee.meetings;
create policy meetings_update_own on buzzybee.meetings
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists meetings_delete_own on buzzybee.meetings;
create policy meetings_delete_own on buzzybee.meetings
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'meetings'
  ) then
    alter publication supabase_realtime add table buzzybee.meetings;
  end if;
end $$;
