-- Forms: a drag-and-drop intake builder. Each published form has an
-- unguessable public token (the access key for the anonymous fill page at
-- /f/:token), and every submission creates a task in the connected project —
-- the agency intake layer (client outreach -> triaged task in the right queue).
-- Applied to the live DB on 2026-06-13.

create table if not exists buzzybee.forms (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references buzzybee.clients(id) on delete cascade,
  project_id uuid references buzzybee.projects(id) on delete set null,
  title text not null default 'Untitled form',
  description text,
  submit_label text not null default 'Submit',
  multi boolean not null default false,
  land_status_key text,
  structure jsonb not null default '{"steps":[{"id":"s0","title":"Step 1","fields":[]}]}'::jsonb,
  public_token text unique not null
    default rtrim(translate(encode(gen_random_bytes(12), 'base64'), '+/', '-_'), '='),
  published boolean not null default false,
  submission_count int not null default 0,
  created_by uuid references buzzybee.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forms_client_idx on buzzybee.forms (client_id);
create index if not exists forms_token_idx on buzzybee.forms (public_token);
drop trigger if exists forms_set_updated_at on buzzybee.forms;
create trigger forms_set_updated_at before update on buzzybee.forms
  for each row execute function buzzybee.tg_set_updated_at();

create table if not exists buzzybee.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references buzzybee.forms(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  created_task_id uuid references buzzybee.tasks(id) on delete set null,
  submitted_at timestamptz not null default now()
);
create index if not exists form_responses_form_idx on buzzybee.form_responses (form_id, submitted_at desc);

alter table buzzybee.forms enable row level security;
alter table buzzybee.form_responses enable row level security;

drop policy if exists "forms_access" on buzzybee.forms;
create policy "forms_access" on buzzybee.forms for all to authenticated
using (
  buzzybee.is_admin() or created_by = auth.uid()
  or (client_id is not null and exists (
    select 1 from buzzybee.assignments a
    where a.client_id = forms.client_id and a.status = 'active'
      and (a.va_id = auth.uid() or a.pm_id = auth.uid())))
)
with check (
  buzzybee.is_admin() or created_by = auth.uid()
  or (client_id is not null and exists (
    select 1 from buzzybee.assignments a
    where a.client_id = forms.client_id and a.status = 'active'
      and (a.va_id = auth.uid() or a.pm_id = auth.uid())))
);

drop policy if exists "form_responses_read" on buzzybee.form_responses;
create policy "form_responses_read" on buzzybee.form_responses for select to authenticated
using (exists (
  select 1 from buzzybee.forms f where f.id = form_responses.form_id and (
    buzzybee.is_admin() or f.created_by = auth.uid()
    or (f.client_id is not null and exists (
      select 1 from buzzybee.assignments a
      where a.client_id = f.client_id and a.status = 'active'
        and (a.va_id = auth.uid() or a.pm_id = auth.uid()))))));

grant select, insert, update, delete on buzzybee.forms to authenticated;
grant select on buzzybee.form_responses to authenticated;

create or replace function buzzybee.get_public_form(p_token text)
returns jsonb language sql stable security definer
set search_path = buzzybee, public as $$
  select jsonb_build_object(
    'id', f.id, 'title', f.title, 'description', f.description,
    'submit_label', f.submit_label, 'multi', f.multi, 'structure', f.structure)
  from buzzybee.forms f where f.public_token = p_token and f.published;
$$;
revoke all on function buzzybee.get_public_form(text) from public;
grant execute on function buzzybee.get_public_form(text) to anon, authenticated;

create or replace function buzzybee.submit_form(p_token text, p_values jsonb)
returns jsonb language plpgsql security definer
set search_path = buzzybee, public as $$
declare
  f record; step jsonb; fld jsonb;
  v_map text; v_label text; v_type text; v_raw jsonb; v_val text;
  v_title text; v_desc text := ''; v_priority int := 3; v_due date; v_status text;
  v_task_id uuid;
begin
  select * into f from buzzybee.forms where public_token = p_token and published;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  for step in select * from jsonb_array_elements(f.structure->'steps') loop
    for fld in select * from jsonb_array_elements(step->'fields') loop
      v_type := fld->>'type'; v_map := fld->'props'->>'map';
      v_label := coalesce(fld->'props'->>'label', ''); v_raw := p_values->(fld->>'id');
      if v_raw is null then continue; end if;
      if jsonb_typeof(v_raw) = 'array' then
        v_val := (select string_agg(value, ', ') from jsonb_array_elements_text(v_raw));
      else v_val := p_values->>(fld->>'id'); end if;
      if v_val is null or v_val = '' then continue; end if;
      if v_type not in ('heading','para','divider') then
        v_desc := v_desc || '**' || v_label || '**' || E'\n' || v_val || E'\n\n';
      end if;
      if v_map = 'name' and v_title is null then v_title := v_val;
      elsif v_map = 'priority' then
        v_priority := case lower(v_val) when 'urgent' then 1 when 'high' then 2 when 'low' then 4 else 3 end;
      elsif v_map = 'due' then begin v_due := v_val::date; exception when others then null; end;
      end if;
    end loop;
  end loop;
  v_title := coalesce(nullif(v_title, ''), 'New request — ' || f.title);
  v_status := coalesce(f.land_status_key,
    (select key from buzzybee.task_statuses where project_id = f.project_id order by sort_order limit 1), 'todo');
  if f.project_id is not null and f.client_id is not null then
    insert into buzzybee.tasks (client_id, project_id, title, description, status, priority, due_on, created_by)
    values (f.client_id, f.project_id, v_title, nullif(v_desc, ''), v_status, v_priority, v_due, f.created_by)
    returning id into v_task_id;
  end if;
  insert into buzzybee.form_responses (form_id, values, created_task_id) values (f.id, p_values, v_task_id);
  update buzzybee.forms set submission_count = submission_count + 1 where id = f.id;
  return jsonb_build_object('ok', true, 'task_created', v_task_id is not null);
end;
$$;
revoke all on function buzzybee.submit_form(text, jsonb) from public;
grant execute on function buzzybee.submit_form(text, jsonb) to anon, authenticated;
