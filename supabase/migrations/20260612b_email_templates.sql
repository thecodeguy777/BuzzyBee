-- Saved email templates: named, reusable campaign content with NO audience
-- attached (audience is a per-send decision). client_id null = shared across
-- every workspace — an agency's best emails are its playbook — or set for
-- client-specific (branded) templates.

create table if not exists buzzybee.crm_email_templates (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references buzzybee.clients(id) on delete cascade,
  name        text not null,
  subject     text,
  body_html   text not null,
  layout      text not null default 'clean' check (layout in ('plain','clean','branded')),
  accent      text,
  created_by  uuid references buzzybee.profiles(id) on delete set null,
  times_used  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists crm_email_templates_client_idx
  on buzzybee.crm_email_templates(client_id);

alter table buzzybee.crm_email_templates enable row level security;

drop policy if exists crm_email_templates_read on buzzybee.crm_email_templates;
drop policy if exists crm_email_templates_write on buzzybee.crm_email_templates;
create policy crm_email_templates_read on buzzybee.crm_email_templates
  for select to authenticated using (auth.uid() is not null);
create policy crm_email_templates_write on buzzybee.crm_email_templates
  for all to authenticated
  using (exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin','pm')))
  with check (exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin','pm')));

drop trigger if exists crm_email_templates_touch on buzzybee.crm_email_templates;
create trigger crm_email_templates_touch before update on buzzybee.crm_email_templates
  for each row execute function buzzybee.crm_touch_updated_at();
