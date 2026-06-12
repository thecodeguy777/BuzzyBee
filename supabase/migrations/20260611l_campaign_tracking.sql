-- Email blasts, part 2: real engagement metrics.
-- Resend webhooks (opened / clicked / bounced) land in the resend-webhook edge
-- function, which matches events to recipients by provider_id and stamps these.

alter table buzzybee.crm_campaign_recipients
  add column if not exists opened_at  timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists bounced_at timestamptz;

create index if not exists crm_campaign_recipients_provider_idx
  on buzzybee.crm_campaign_recipients(provider_id) where provider_id is not null;

-- One call per send batch instead of one UPDATE per recipient: rows are
-- matched positionally (ids[i] ↔ provider_ids[i], the order Resend returns).
create or replace function buzzybee.bb_mark_campaign_batch_sent(p_ids uuid[], p_provider_ids text[])
returns void language sql security definer
set search_path to ''
as $$
  update buzzybee.crm_campaign_recipients r
  set status = 'sent', sent_at = now(), provider_id = v.pid
  from (select unnest(p_ids) as id, unnest(p_provider_ids) as pid) v
  where r.id = v.id;
$$;

-- Service-role only — the edge function calls this; browsers must not.
revoke execute on function buzzybee.bb_mark_campaign_batch_sent(uuid[], text[]) from public, anon, authenticated;
grant execute on function buzzybee.bb_mark_campaign_batch_sent(uuid[], text[]) to service_role;
