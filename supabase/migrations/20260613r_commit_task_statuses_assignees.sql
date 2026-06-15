-- Catch-up migration: task_statuses + task_assignees and their dependencies
-- existed ONLY in the live DB (never committed). This commits the live reality
-- so a fresh rebuild / preview branch reproduces it. Idempotent against live
-- (create or replace / if not exists / drop policy if exists) — safe no-op there;
-- value is version control + clean replays.
--
-- NOTE (known ordering gap): 20260613m/20260613n reference these objects and
-- sort BEFORE this file, so a from-empty replay still needs this applied first
-- in practice. Live is the source of truth for this repo; this is catch-up.

-- ── 1. SECURITY DEFINER helpers (live-only; needed by task_assignees policies) ──
-- Bypass RLS on project_members; same pattern as is_task_assignee (20260613n),
-- which avoids the tasks<->task_assignees RLS recursion fixed there.
create or replace function buzzybee.is_project_member(pid uuid, uid uuid)
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$
  select exists (
    select 1 from buzzybee.project_members
    where project_id = pid and user_id = uid
  );
$$;
grant execute on function buzzybee.is_project_member(uuid, uuid) to authenticated;

create or replace function buzzybee.is_project_lead_member(pid uuid, uid uuid)
returns boolean
language sql stable security definer
set search_path = buzzybee, public
as $$
  select exists (
    select 1 from buzzybee.project_members
    where project_id = pid and user_id = uid and role = 'lead'
  );
$$;
grant execute on function buzzybee.is_project_lead_member(uuid, uuid) to authenticated;

-- ── 2. task_statuses (per-project board columns) ──────────────────────────────
create table if not exists buzzybee.task_statuses (
  id           uuid        not null default gen_random_uuid(),
  project_id   uuid        not null,
  key          text        not null,
  label        text        not null,
  color        text        not null default 'neutral',
  sort_order   integer     not null default 0,
  is_done      boolean     not null default false,
  is_cancelled boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint task_statuses_pkey primary key (id),
  constraint task_statuses_project_id_key_key unique (project_id, key),
  constraint task_statuses_project_id_fkey
    foreign key (project_id) references buzzybee.projects(id) on delete cascade
);

-- ── 3. task_assignees (Model C multi-assignee join) ───────────────────────────
create table if not exists buzzybee.task_assignees (
  task_id      uuid        not null,
  user_id      uuid        not null,
  completed_at timestamptz,
  added_at     timestamptz not null default now(),
  added_by     uuid,
  constraint task_assignees_pkey primary key (task_id, user_id),
  constraint task_assignees_task_id_fkey
    foreign key (task_id) references buzzybee.tasks(id) on delete cascade,
  constraint task_assignees_user_id_fkey
    foreign key (user_id) references buzzybee.profiles(id) on delete cascade,
  constraint task_assignees_added_by_fkey
    foreign key (added_by) references buzzybee.profiles(id) on delete set null
);
create index if not exists task_assignees_task_idx on buzzybee.task_assignees using btree (task_id);
create index if not exists task_assignees_user_idx on buzzybee.task_assignees using btree (user_id);

-- ── 4. Trigger functions + triggers on task_assignees (live-only) ─────────────
-- 4a. Keep tasks.assignee_id/assignee_name (legacy single primary) in sync.
create or replace function buzzybee.tg_task_assignees_sync_primary()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $function$
declare
  next_primary uuid;
  next_name text;
begin
  if (tg_op = 'INSERT') then
    update buzzybee.tasks t
      set assignee_id = new.user_id,
          assignee_name = (select full_name from buzzybee.profiles where id = new.user_id)
      where t.id = new.task_id
        and t.assignee_id is null;
    return new;
  end if;

  if (tg_op = 'DELETE') then
    select user_id into next_primary
      from buzzybee.task_assignees
      where task_id = old.task_id
        and user_id <> old.user_id
      order by added_at asc
      limit 1;

    if next_primary is null then
      update buzzybee.tasks t
        set assignee_id = null, assignee_name = null
        where t.id = old.task_id
          and t.assignee_id = old.user_id;
    else
      select full_name into next_name from buzzybee.profiles where id = next_primary;
      update buzzybee.tasks t
        set assignee_id = next_primary, assignee_name = next_name
        where t.id = old.task_id
          and t.assignee_id = old.user_id;
    end if;

    return old;
  end if;

  return null;
end;
$function$;

drop trigger if exists task_assignees_sync_primary on buzzybee.task_assignees;
create trigger task_assignees_sync_primary
  after insert or delete on buzzybee.task_assignees
  for each row execute function buzzybee.tg_task_assignees_sync_primary();

-- 4b. Auto-flip task.status when every assignee is/isn't done.
-- KNOWN ISSUE (intentionally NOT fixed here): hardcodes 'done'/'in_progress'/
-- 'cancelled', ignoring per-project custom statuses (task_statuses.is_done/
-- is_cancelled). Misbehaves on boards using custom status keys. Track separately.
create or replace function buzzybee.tg_task_assignees_auto_done()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $function$
declare
  total int;
  done int;
  current_status text;
  tid uuid := coalesce(new.task_id, old.task_id);
begin
  if tid is null then return coalesce(new, old); end if;

  select count(*), count(*) filter (where completed_at is not null)
    into total, done
    from buzzybee.task_assignees
    where task_id = tid;

  if total = 0 then
    return coalesce(new, old);
  end if;

  select status into current_status from buzzybee.tasks where id = tid;

  if done = total and current_status not in ('done', 'cancelled') then
    update buzzybee.tasks set status = 'done' where id = tid;
  elsif done < total and current_status = 'done' then
    update buzzybee.tasks set status = 'in_progress' where id = tid;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists task_assignees_auto_done on buzzybee.task_assignees;
create trigger task_assignees_auto_done
  after insert or delete or update of completed_at on buzzybee.task_assignees
  for each row execute function buzzybee.tg_task_assignees_auto_done();

-- 4c. Notify a user when added to a task by someone else.
create or replace function buzzybee.tg_task_assignees_notify()
returns trigger
language plpgsql security definer
set search_path = buzzybee, public
as $function$
declare
  actor uuid := auth.uid();
  actor_name text;
  task_title text;
  task_ref text;
begin
  if (tg_op = 'INSERT' and new.user_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid)) then
    select full_name into actor_name from buzzybee.profiles where id = actor;
    if actor_name is null or actor_name = '' then actor_name := 'Someone'; end if;
    select title, reference_number into task_title, task_ref from buzzybee.tasks where id = new.task_id;

    insert into buzzybee.notifications (user_id, type, source_id, source_ref, actor_id, actor_name, title, preview, link)
    values (
      new.user_id, 'task_assigned', new.task_id, task_ref,
      actor, actor_name,
      actor_name || ' added you to a task',
      task_title,
      '/app/tasks'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists task_assignees_notify on buzzybee.task_assignees;
create trigger task_assignees_notify
  after insert on buzzybee.task_assignees
  for each row execute function buzzybee.tg_task_assignees_notify();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
alter table buzzybee.task_statuses  enable row level security;
alter table buzzybee.task_assignees enable row level security;

drop policy if exists task_statuses_select on buzzybee.task_statuses;
create policy task_statuses_select on buzzybee.task_statuses
  for select to authenticated
  using (exists (select 1 from buzzybee.projects p where p.id = task_statuses.project_id));

drop policy if exists task_statuses_manage on buzzybee.task_statuses;
create policy task_statuses_manage on buzzybee.task_statuses
  for all to authenticated
  using (
    buzzybee.is_admin()
    or buzzybee.is_client_pm(auth.uid(), (select p.client_id from buzzybee.projects p where p.id = task_statuses.project_id))
    or exists (
      select 1 from buzzybee.project_members m
      where m.project_id = task_statuses.project_id and m.user_id = auth.uid() and m.role = 'lead'
    )
  )
  with check (
    buzzybee.is_admin()
    or buzzybee.is_client_pm(auth.uid(), (select p.client_id from buzzybee.projects p where p.id = task_statuses.project_id))
    or exists (
      select 1 from buzzybee.project_members m
      where m.project_id = task_statuses.project_id and m.user_id = auth.uid() and m.role = 'lead'
    )
  );

drop policy if exists task_assignees_select on buzzybee.task_assignees;
create policy task_assignees_select on buzzybee.task_assignees
  for select to authenticated
  using (
    buzzybee.is_admin()
    or exists (select 1 from buzzybee.tasks t where t.id = task_assignees.task_id)
  );

drop policy if exists task_assignees_self_update on buzzybee.task_assignees;
create policy task_assignees_self_update on buzzybee.task_assignees
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_assignees_admin_write on buzzybee.task_assignees;
create policy task_assignees_admin_write on buzzybee.task_assignees
  for all to authenticated
  using (buzzybee.is_admin())
  with check (buzzybee.is_admin());

drop policy if exists task_assignees_pm_write on buzzybee.task_assignees;
create policy task_assignees_pm_write on buzzybee.task_assignees
  for all to authenticated
  using (exists (
    select 1 from buzzybee.tasks t
    where t.id = task_assignees.task_id and buzzybee.is_client_pm(auth.uid(), t.client_id)
  ))
  with check (exists (
    select 1 from buzzybee.tasks t
    where t.id = task_assignees.task_id and buzzybee.is_client_pm(auth.uid(), t.client_id)
  ));

drop policy if exists task_assignees_lead_write on buzzybee.task_assignees;
create policy task_assignees_lead_write on buzzybee.task_assignees
  for all to authenticated
  using (exists (
    select 1 from buzzybee.tasks t
    where t.id = task_assignees.task_id and t.project_id is not null
      and buzzybee.is_project_lead_member(t.project_id, auth.uid())
  ))
  with check (exists (
    select 1 from buzzybee.tasks t
    where t.id = task_assignees.task_id and t.project_id is not null
      and buzzybee.is_project_lead_member(t.project_id, auth.uid())
  ));

-- ── 6. Realtime publication (both ship via supabase_realtime in live) ──────────
do $pub$
begin
  if not exists (select 1 from pg_publication_rel pr
                 join pg_publication p on p.oid = pr.prpubid
                 join pg_class c on c.oid = pr.prrelid
                 join pg_namespace n on n.oid = c.relnamespace
                 where p.pubname='supabase_realtime' and n.nspname='buzzybee' and c.relname='task_statuses') then
    alter publication supabase_realtime add table buzzybee.task_statuses;
  end if;
  if not exists (select 1 from pg_publication_rel pr
                 join pg_publication p on p.oid = pr.prpubid
                 join pg_class c on c.oid = pr.prrelid
                 join pg_namespace n on n.oid = c.relnamespace
                 where p.pubname='supabase_realtime' and n.nspname='buzzybee' and c.relname='task_assignees') then
    alter publication supabase_realtime add table buzzybee.task_assignees;
  end if;
end $pub$;
