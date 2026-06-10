-- Tighten CRM access: reads stay open to the team, but writes (insert/update/
-- delete — incl. drag-restage, convert, deletes) are scoped to PM/admin so a VA
-- can't rewrite or wipe the pipeline. Also make UPDATE/DELETE realtime payloads
-- complete (replica identity full) and keep updated_at honest via a trigger.

do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts','crm_deals','crm_deal_tasks','crm_deal_activities']
  loop
    execute format('drop policy if exists %I_all on buzzybee.%I', t, t);
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

alter table buzzybee.crm_deals replica identity full;
alter table buzzybee.crm_companies replica identity full;

create or replace function buzzybee.crm_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists crm_companies_touch on buzzybee.crm_companies;
create trigger crm_companies_touch before update on buzzybee.crm_companies
  for each row execute function buzzybee.crm_touch_updated_at();
drop trigger if exists crm_deals_touch on buzzybee.crm_deals;
create trigger crm_deals_touch before update on buzzybee.crm_deals
  for each row execute function buzzybee.crm_touch_updated_at();
