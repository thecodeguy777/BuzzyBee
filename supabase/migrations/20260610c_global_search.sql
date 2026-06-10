-- Unified global search (Slack-style ⌘K) across tasks, messages, channels,
-- people and clients. pg_trgm is already installed; these GIN indexes accelerate
-- ilike '%q%' + similarity() ranking. The RPC is SECURITY INVOKER so each
-- table's RLS scopes results to what the caller may see (messages → channels
-- they can_see, profiles → teammates, etc.). Ranking = trigram similarity +
-- exact ref#/name/handle boost + recency decay + current-client bias.
create index if not exists messages_body_trgm_gin on buzzybee.messages using gin (body gin_trgm_ops);
create index if not exists tasks_title_trgm_gin on buzzybee.tasks using gin (title gin_trgm_ops);

create or replace function buzzybee.search_global(
  q text,
  p_client uuid default null,
  max_per int default 6
)
returns table (
  rtype text, rid text, label text, sub text, score real,
  task_id uuid, message_id uuid, channel_id uuid, client_id uuid, user_id uuid, is_dm boolean
)
language sql
stable
set search_path = buzzybee, public
as $$
  with pat as (select '%' || q || '%' as p),
  task_hits as (
    select 'task' as rtype, 'task:' || t.id as rid, t.title as label,
           t.reference_number || ' · ' || coalesce(t.client_name, 'No client') as sub,
           ( 0.6 * greatest(similarity(t.title, q), similarity(coalesce(t.description, ''), q))
           + (case when lower(t.reference_number) = lower(q) then 4
                   when t.reference_number ilike q || '%' then 2.5 else 0 end)
           + 0.5 * exp(-extract(epoch from (now() - t.updated_at)) / 1209600)
           + (case when p_client is not null and t.client_id = p_client then 0.5 else 0 end)
           )::real as score,
           t.id as task_id, null::uuid as message_id, null::uuid as channel_id,
           t.client_id as client_id, null::uuid as user_id, null::boolean as is_dm
    from buzzybee.tasks t, pat
    where t.title ilike pat.p or coalesce(t.description, '') ilike pat.p or t.reference_number ilike pat.p
    order by 5 desc limit max_per
  ),
  msg_hits as (
    select 'message', 'msg:' || m.id, m.body,
           coalesce(m.user_name, 'Someone') || ' · ' || (case when c.is_dm then 'DM' else '#' || c.name end),
           ( 0.6 * similarity(m.body, q)
           + 0.4 * exp(-extract(epoch from (now() - m.created_at)) / 604800)
           )::real,
           null::uuid, m.id, m.channel_id, c.client_id, m.user_id, c.is_dm
    from buzzybee.messages m
    join buzzybee.channels c on c.id = m.channel_id, pat
    where m.body ilike pat.p
    order by 5 desc limit max_per
  ),
  chan_hits as (
    select 'channel', 'chan:' || c.id, c.name, coalesce(c.topic, 'Channel'),
           ( 0.6 * similarity(c.name, q)
           + (case when c.name ilike q || '%' then 2 else 0 end)
           )::real,
           null::uuid, null::uuid, c.id, c.client_id, null::uuid, false
    from buzzybee.channels c, pat
    where not c.is_dm and c.name ilike pat.p
    order by 5 desc limit max_per
  ),
  person_hits as (
    select 'person', 'user:' || p.id, coalesce(p.full_name, p.email, 'Member'),
           initcap(p.role) || coalesce(' · ' || p.email, ''),
           ( 0.6 * similarity(coalesce(p.full_name, p.email, ''), q)
           + (case when coalesce(p.full_name, p.email, '') ilike q || '%' then 2 else 0 end)
           )::real,
           null::uuid, null::uuid, null::uuid, null::uuid, p.id, null::boolean
    from buzzybee.profiles p, pat
    where coalesce(p.full_name, '') ilike pat.p or coalesce(p.email, '') ilike pat.p
    order by 5 desc limit max_per
  ),
  client_hits as (
    select 'client', 'client:' || c.id, c.name,
           (case when c.status = 'active' then 'Client' else 'Client · ' || c.status end),
           ( 0.6 * similarity(c.name, q)
           + (case when c.name ilike q || '%' then 2 else 0 end)
           + (case when p_client is not null and c.id = p_client then 0.3 else 0 end)
           )::real,
           null::uuid, null::uuid, null::uuid, c.id, null::uuid, null::boolean
    from buzzybee.clients c, pat
    where c.name ilike pat.p or coalesce(c.notes, '') ilike pat.p
    order by 5 desc limit max_per
  )
  select * from (
    select * from task_hits
    union all select * from msg_hits
    union all select * from chan_hits
    union all select * from person_hits
    union all select * from client_hits
  ) all_hits
  order by score desc;
$$;

grant execute on function buzzybee.search_global(text, uuid, int) to authenticated;
