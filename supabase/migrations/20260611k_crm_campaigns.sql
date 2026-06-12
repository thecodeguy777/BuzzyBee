-- Email blasts, part 1: campaigns + per-recipient delivery state.
--
-- transport is forward-looking: 'resend' (ESP blast to opted-in contacts) now,
-- 'gmail' (connected-mailbox sequences) later — adding cold outreach shouldn't
-- need a schema rewrite. Sending itself happens in the send-campaign edge
-- function (the provider API key never reaches the browser).

create table if not exists buzzybee.crm_campaigns (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references buzzybee.clients(id) on delete cascade,
  subject     text not null,
  from_name   text,
  from_email  text,
  body_html   text not null,
  transport   text not null default 'resend',
  status      text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  -- Human description of how the audience was built ("All contacts", "3 companies").
  audience    text,
  created_by  uuid references buzzybee.profiles(id) on delete set null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists buzzybee.crm_campaign_recipients (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references buzzybee.crm_campaigns(id) on delete cascade,
  contact_id   uuid references buzzybee.crm_contacts(id) on delete set null,
  email        text not null,
  name         text,
  status       text not null default 'pending' check (status in ('pending','sent','failed')),
  error        text,
  provider_id  text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists crm_campaigns_client_idx
  on buzzybee.crm_campaigns(client_id, created_at desc);
create index if not exists crm_campaign_recipients_campaign_idx
  on buzzybee.crm_campaign_recipients(campaign_id, status);

-- Marketing consent lives on the contact; the audience builder and the sender
-- both exclude anyone with a timestamp here.
alter table buzzybee.crm_contacts add column if not exists unsubscribed_at timestamptz;

-- RLS: same posture as the rest of the CRM — team reads, pm/admin writes.
alter table buzzybee.crm_campaigns           enable row level security;
alter table buzzybee.crm_campaign_recipients enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crm_campaigns','crm_campaign_recipients']
  loop
    execute format('drop policy if exists %I_read on buzzybee.%I', t, t);
    execute format('drop policy if exists %I_write on buzzybee.%I', t, t);
    execute format(
      'create policy %I_read on buzzybee.%I for select to authenticated using (auth.uid() is not null)', t, t);
    execute format(
      'create policy %I_write on buzzybee.%I for all to authenticated '
      || 'using (exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in (''admin'',''superadmin'',''pm''))) '
      || 'with check (exists (select 1 from buzzybee.profiles p where p.id = auth.uid() and p.role in (''admin'',''superadmin'',''pm'')))',
      t, t);
  end loop;
end $$;

drop trigger if exists crm_campaigns_touch on buzzybee.crm_campaigns;
create trigger crm_campaigns_touch before update on buzzybee.crm_campaigns
  for each row execute function buzzybee.crm_touch_updated_at();

-- Campaign status flips stream live; recipient progress is polled while a
-- campaign is sending (a 2,697-row blast would mean 2,697 realtime UPDATE
-- broadcasts — pointless when the UI only wants counts).
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table buzzybee.crm_campaigns';
  exception when duplicate_object then null;
  end;
end $$;
