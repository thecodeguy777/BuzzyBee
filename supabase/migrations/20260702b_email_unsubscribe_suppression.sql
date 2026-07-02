-- Email compliance + suppression foundations (pre-domain launch hardening).
--
-- 1. Suppression state: complaints and hard bounces must stop future sends.
--    crm_contacts.unsubscribed_at has existed since 20260611k but nothing ever
--    set it — the new `unsubscribe` edge function (one-click + footer link)
--    and the extended resend-webhook (complained/bounced) now do.
-- 2. Recipient rows gain opt-out attribution and a 'skipped' status so the
--    sender can record server-side suppressions honestly instead of mailing
--    or mislabeling them as failures.
-- 3. RLS: campaigns/recipients were readable by ANY authenticated user
--    (cross-client leak of recipient emails, incl. client-role accounts) —
--    realigned to the CRM posture from 20260612g.

-- Contacts: suppression stamps. A complaint also sets unsubscribed_at (a spam
-- report is the loudest possible opt-out).
alter table buzzybee.crm_contacts
  add column if not exists email_bounced_at timestamptz,
  add column if not exists complained_at    timestamptz;

-- Recipients: per-campaign opt-out/complaint attribution.
alter table buzzybee.crm_campaign_recipients
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists complained_at   timestamptz;

-- 'skipped' = suppressed server-side before any send attempt (unsubscribed /
-- bounced address / invalid email). Distinct from 'failed' (attempted, error).
alter table buzzybee.crm_campaign_recipients
  drop constraint if exists crm_campaign_recipients_status_check;
alter table buzzybee.crm_campaign_recipients
  add constraint crm_campaign_recipients_status_check
  check (status in ('pending','sent','failed','skipped'));

-- ── RLS realignment ───────────────────────────────────────────────────────────
-- Reads: staff only, scoped to accessible clients (was: any authenticated).
-- Writes: manage-rights on the campaign's client (was: any pm/admin role
-- check without client scoping — harmless under roaming PMs, but this keeps
-- the posture uniform with crm_companies/crm_contacts).

drop policy if exists crm_campaigns_read  on buzzybee.crm_campaigns;
drop policy if exists crm_campaigns_write on buzzybee.crm_campaigns;
create policy crm_campaigns_read on buzzybee.crm_campaigns
  for select to authenticated
  using (buzzybee.is_staff() and client_id in (select buzzybee.accessible_client_ids()));
create policy crm_campaigns_write on buzzybee.crm_campaigns
  for all to authenticated
  using (buzzybee.can_manage_client(client_id))
  with check (buzzybee.can_manage_client(client_id));

-- Recipients derive through the campaign (campaigns RLS scopes the subquery).
drop policy if exists crm_campaign_recipients_read  on buzzybee.crm_campaign_recipients;
drop policy if exists crm_campaign_recipients_write on buzzybee.crm_campaign_recipients;
create policy crm_campaign_recipients_read on buzzybee.crm_campaign_recipients
  for select to authenticated
  using (buzzybee.is_staff()
         and exists (select 1 from buzzybee.crm_campaigns c where c.id = campaign_id));
create policy crm_campaign_recipients_write on buzzybee.crm_campaign_recipients
  for all to authenticated
  using (exists (select 1 from buzzybee.crm_campaigns c
                 where c.id = campaign_id and buzzybee.can_manage_client(c.client_id)))
  with check (exists (select 1 from buzzybee.crm_campaigns c
                      where c.id = campaign_id and buzzybee.can_manage_client(c.client_id)));

comment on column buzzybee.crm_contacts.email_bounced_at is
  'Set by resend-webhook on a non-transient bounce; audience builder and sender both suppress.';
comment on column buzzybee.crm_contacts.complained_at is
  'Set by resend-webhook on a spam complaint; also sets unsubscribed_at.';
