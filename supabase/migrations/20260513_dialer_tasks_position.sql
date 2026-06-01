-- Merge "Next Action" into the tasks list.
--
-- Adds a position column to buzzybee.dialer_tasks so reps can physically
-- reorder a lead's tasks by priority. The topmost task IS the next action.
--
-- Backfills:
--   1) Per-lead initial position values, lowest = highest priority.
--      We seed positions based on a deterministic baseline:
--        - status open/in_progress first,
--        - earlier due_at first (NULLs last),
--        - then created_at desc as final tie-breaker.
--   2) For any lead that has nextActionAt populated on dialer_leads, create
--      a synthetic task at position 0 with that note + due date, then null
--      the legacy fields. This preserves user-entered "next action" data.
--
-- The legacy columns (next_action_at, next_action_note) are NOT dropped here
-- to preserve rollback safety. A follow-up migration can drop them once the
-- UI no longer reads them.

begin;

-- 1) Add the position column. Default = 1000 so newly-created tasks sit
--    below explicitly-positioned ones unless the UI sets a lower value.
alter table buzzybee.dialer_tasks
  add column if not exists position integer not null default 1000;

create index if not exists dialer_tasks_lead_position_idx
  on buzzybee.dialer_tasks (lead_id, position);

-- 2) Backfill positions for existing rows, per lead.
--    Open tasks first, then by due_at asc (NULLs last), then created_at desc.
with ordered as (
  select
    id,
    row_number() over (
      partition by lead_id
      order by
        case when status in ('open','in_progress') then 0 else 1 end,
        (due_at is null),
        due_at asc,
        created_at desc
    ) * 10 as new_position
  from buzzybee.dialer_tasks
  where lead_id is not null
)
update buzzybee.dialer_tasks t
  set position = o.new_position
  from ordered o
  where t.id = o.id;

-- 3) Migrate legacy lead.next_action_* into a position-0 task per lead.
--    Only runs for leads with nextActionAt set AND no existing position-0 task.
insert into buzzybee.dialer_tasks
  (lead_id, title, description, task_type, status, due_at, position, metadata, created_at, updated_at)
select
  l.id,
  coalesce(nullif(trim(l.next_action_note), ''), 'Follow up'),
  null,
  'manual',
  'open',
  l.next_action_at,
  0,
  jsonb_build_object('migrated_from', 'next_action_field'),
  now(),
  now()
from buzzybee.dialer_leads l
where l.next_action_at is not null
  and not exists (
    select 1 from buzzybee.dialer_tasks t
    where t.lead_id = l.id and t.position = 0
  );

-- 4) Null out the legacy fields once their data is preserved as a task.
--    (Doesn't drop the columns — that's a separate, later migration.)
update buzzybee.dialer_leads
  set next_action_at = null, next_action_note = null
  where next_action_at is not null;

commit;
