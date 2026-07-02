-- Client time zone — the team is PH-based while most clients are in the US,
-- so PMs/VAs need to see "what time is it for this client" at a glance.
-- Stores an IANA zone name (e.g. 'America/New_York'); null = not set.
-- Rendering happens client-side via Intl, so no server dependency.

alter table buzzybee.clients
  add column if not exists timezone text;

comment on column buzzybee.clients.timezone is
  'IANA time zone of the client (e.g. America/New_York). Set in the client drawer; used to show the client''s local time across the workstation.';
