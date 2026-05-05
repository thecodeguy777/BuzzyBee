-- Dev seed: two test clients + assignments for jayson.remigio7@gmail.com.
-- Idempotent — re-running won't create duplicates.
-- DO NOT run this in a production project.

do $seed$
declare
  jay_id uuid;
  acme_id uuid;
  beta_id uuid;
begin
  select id into jay_id from auth.users where email = 'jayson.remigio7@gmail.com';
  if jay_id is null then
    raise notice 'Skipping seed: user jayson.remigio7@gmail.com not found.';
    return;
  end if;

  -- Acme Co
  select id into acme_id from buzzybee.clients where name = 'Acme Co';
  if acme_id is null then
    insert into buzzybee.clients (name, preferred_channel, monthly_rate, tier, hivemind_enabled, notes)
    values ('Acme Co', 'slack', 60000, 'professional', true, 'Test client — Slack-first, HiveMind on.')
    returning id into acme_id;
  end if;

  -- Beta Industries
  select id into beta_id from buzzybee.clients where name = 'Beta Industries';
  if beta_id is null then
    insert into buzzybee.clients (name, preferred_channel, monthly_rate, tier, hivemind_enabled, notes)
    values ('Beta Industries', 'email', 45000, 'starter', false, 'Test client — email-first, no HiveMind.')
    returning id into beta_id;
  end if;

  -- Assignments
  insert into buzzybee.assignments (va_id, client_id, pm_id, status)
  values (jay_id, acme_id, jay_id, 'active')
  on conflict do nothing;

  insert into buzzybee.assignments (va_id, client_id, pm_id, status)
  values (jay_id, beta_id, jay_id, 'active')
  on conflict do nothing;
end
$seed$;
