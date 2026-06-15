-- Demo workspace: a seeded sandbox client ("Northstar (Demo)") so the product
-- tour — and any brand-new account — shows a populated, lively workstation
-- instead of blank screens. The tour switches to this client and drives the
-- REAL UI over it.
--
-- Visibility: read-only to ALL authenticated users via additive `demo_read`
-- policies + SECURITY DEFINER helpers (recursion-safe; the helpers bypass RLS
-- so child-table policies don't re-enter tasks/channels RLS). Admins keep full
-- access through existing policies, so they can interact with it live.
--
-- Re-runnable: clears prior demo rows first. Triggers are disabled during the
-- seed so it doesn't spray notifications / activity into real inboxes; the
-- showcase task's activity_log is set explicitly instead.

-- ── recursion-safe demo scoping helpers ──
create or replace function buzzybee.is_demo_project(p uuid) returns boolean
  language sql stable security definer set search_path = buzzybee, public as $$
  select exists (select 1 from buzzybee.projects where id = p and client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
$$;
create or replace function buzzybee.is_demo_task(p uuid) returns boolean
  language sql stable security definer set search_path = buzzybee, public as $$
  select exists (select 1 from buzzybee.tasks where id = p and client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
$$;
create or replace function buzzybee.is_demo_channel(p uuid) returns boolean
  language sql stable security definer set search_path = buzzybee, public as $$
  select exists (select 1 from buzzybee.channels where id = p and client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
$$;

-- ── quiet the triggers while we seed (incl. auto-seeders on clients/projects
--    so our explicit rows are the only source of truth) ──
alter table buzzybee.clients disable trigger user;
alter table buzzybee.projects disable trigger user;
alter table buzzybee.task_statuses disable trigger user;
alter table buzzybee.tasks disable trigger user;
alter table buzzybee.task_assignees disable trigger user;
alter table buzzybee.task_subtasks disable trigger user;
alter table buzzybee.task_comments disable trigger user;
alter table buzzybee.channels disable trigger user;
alter table buzzybee.messages disable trigger user;
alter table buzzybee.crm_companies disable trigger user;
alter table buzzybee.crm_deals disable trigger user;

-- ── reset prior demo rows (children first) ──
delete from buzzybee.task_comments  where task_id   in (select id from buzzybee.tasks    where client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
delete from buzzybee.task_subtasks  where task_id   in (select id from buzzybee.tasks    where client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
delete from buzzybee.task_assignees where task_id   in (select id from buzzybee.tasks    where client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
delete from buzzybee.tasks          where client_id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from buzzybee.task_statuses  where project_id in (select id from buzzybee.projects where client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
delete from buzzybee.projects       where client_id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from buzzybee.messages       where channel_id in (select id from buzzybee.channels where client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
delete from buzzybee.channels       where client_id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from buzzybee.crm_deals      where client_id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from buzzybee.crm_companies  where client_id = 'd0d0d0d0-0000-4000-8000-000000000001';
delete from buzzybee.clients        where id        = 'd0d0d0d0-0000-4000-8000-000000000001';

-- ── client ──
insert into buzzybee.clients (id, name, status, hivemind_enabled, tier, monthly_rate)
values ('d0d0d0d0-0000-4000-8000-000000000001', 'Northstar (Demo)', 'active', true, 'professional', 4500);

-- ── projects ──
insert into buzzybee.projects (id, client_id, name, description, status, display_order, created_by) values
 ('d0d0d0d0-0000-4000-8000-000000000101', 'd0d0d0d0-0000-4000-8000-000000000001', 'Spring Campaign', 'Q2 launch push', 'active', 0, '803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000102', 'd0d0d0d0-0000-4000-8000-000000000001', 'Client Delivery', 'Ongoing client work', 'active', 1, '803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000103', 'd0d0d0d0-0000-4000-8000-000000000001', 'Operations', 'Internal ops', 'active', 2, '803f834a-c4a4-451e-8139-8be669b2e7a3');

-- ── statuses (5 per project) ──
insert into buzzybee.task_statuses (project_id, key, label, color, sort_order, is_done, is_cancelled)
select p.id, s.key, s.label, s.color, s.sort_order, s.is_done, s.is_cancelled
from (values
  ('d0d0d0d0-0000-4000-8000-000000000101'::uuid),
  ('d0d0d0d0-0000-4000-8000-000000000102'::uuid),
  ('d0d0d0d0-0000-4000-8000-000000000103'::uuid)
) p(id)
cross join (values
  ('todo','To do','neutral',0,false,false),
  ('in_progress','In progress','info',1,false,false),
  ('blocked','Blocked','warning',2,false,false),
  ('done','Done','success',3,true,false),
  ('cancelled','Cancelled','error',4,false,true)
) s(key,label,color,sort_order,is_done,is_cancelled);

-- ── tasks ──
insert into buzzybee.tasks
 (id, reference_number, client_id, client_name, project_id, title, description, status, priority, priority_order, due_on, assignee_id, assignee_name, created_by, created_at, activity_log)
values
 ('d0d0d0d0-0000-4000-8000-000000000201','TASK-0001','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Draft spring-campaign quote','Pull last quarter''s numbers and draft the client quote.','in_progress',2,10,current_date+2,'185ada37-388e-40da-bf68-769de255b43e','Mark','185ada37-388e-40da-bf68-769de255b43e',now()-interval '3 days',
   jsonb_build_array(
     jsonb_build_object('kind','created','user_id','185ada37-388e-40da-bf68-769de255b43e','timestamp', now()-interval '3 days'),
     jsonb_build_object('kind','status','from','todo','to','in_progress','user_id','2806d3a2-e482-4da4-b68a-0ae99d5f88db','timestamp', now()-interval '2 days'),
     jsonb_build_object('kind','assignee','from',null,'to','2806d3a2-e482-4da4-b68a-0ae99d5f88db','to_name','Peter Gower','user_id','185ada37-388e-40da-bf68-769de255b43e','timestamp', now()-interval '2 days')
   )),
 ('d0d0d0d0-0000-4000-8000-000000000202','TASK-0002','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Update pricing sheet','','todo',3,20,current_date+5,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '2 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000203','TASK-0003','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Design new landing hero','New hero section for the campaign landing page.','in_progress',2,30,current_date+3,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','185ada37-388e-40da-bf68-769de255b43e',now()-interval '2 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000204','TASK-0004','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Write launch email sequence','','todo',1,40,current_date+4,'185ada37-388e-40da-bf68-769de255b43e','Mark','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '1 day','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000205','TASK-0005','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Book product photographer','','blocked',3,50,current_date+7,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','185ada37-388e-40da-bf68-769de255b43e',now()-interval '1 day','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000206','TASK-0006','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Finalize budget approval','','blocked',1,60,current_date+1,'803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '4 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000207','TASK-0007','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Onboard Acme Co','','done',2,70,current_date-3,'185ada37-388e-40da-bf68-769de255b43e','Mark','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '9 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000208','TASK-0008','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Set up analytics dashboard','','done',3,80,current_date-5,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','185ada37-388e-40da-bf68-769de255b43e',now()-interval '8 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000209','TASK-0009','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Audit current landing page','','todo',3,90,current_date+6,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','185ada37-388e-40da-bf68-769de255b43e',now()-interval '6 hours','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020a','TASK-0010','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Competitor teardown','','in_progress',2,100,current_date+2,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '5 hours','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020b','TASK-0011','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000101','Social calendar — April','','todo',3,110,current_date+8,'185ada37-388e-40da-bf68-769de255b43e','Mark','185ada37-388e-40da-bf68-769de255b43e',now()-interval '3 hours','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020c','TASK-0012','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000102','Weekly status report','','in_progress',2,10,current_date+1,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '2 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020d','TASK-0013','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000102','QA new feature build','','todo',2,20,current_date+3,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','185ada37-388e-40da-bf68-769de255b43e',now()-interval '1 day','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020e','TASK-0014','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000102','Client feedback round 2','','todo',3,30,current_date+4,'185ada37-388e-40da-bf68-769de255b43e','Mark','185ada37-388e-40da-bf68-769de255b43e',now()-interval '7 hours','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-00000000020f','TASK-0015','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000102','Ship v2.1','','done',1,40,current_date-2,'803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '6 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000210','TASK-0016','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000103','Update SOPs','','todo',3,10,current_date+10,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '3 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000211','TASK-0017','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000103','Payroll run','','done',2,20,current_date-1,'803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '5 days','[]'::jsonb),
 ('d0d0d0d0-0000-4000-8000-000000000212','TASK-0018','d0d0d0d0-0000-4000-8000-000000000001','Northstar (Demo)','d0d0d0d0-0000-4000-8000-000000000103','Team 1:1s','','in_progress',2,30,current_date+5,'185ada37-388e-40da-bf68-769de255b43e','Mark','803f834a-c4a4-451e-8139-8be669b2e7a3',now()-interval '4 hours','[]'::jsonb);

-- ── assignees (multi on several) ──
insert into buzzybee.task_assignees (task_id, user_id, added_by) values
 ('d0d0d0d0-0000-4000-8000-000000000201','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000201','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000202','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000204','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000204','803f834a-c4a4-451e-8139-8be669b2e7a3','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000205','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000206','803f834a-c4a4-451e-8139-8be669b2e7a3','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000208','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000209','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020a','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020b','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020c','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020c','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020d','2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020e','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020f','803f834a-c4a4-451e-8139-8be669b2e7a3','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000210','39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000211','803f834a-c4a4-451e-8139-8be669b2e7a3','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000212','185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3');

-- ── subtasks ──
insert into buzzybee.task_subtasks (task_id, title, done, position, assignee_id, created_by) values
 ('d0d0d0d0-0000-4000-8000-000000000201','Pull last quarter''s numbers',true,0,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000201','Draft the line items',false,1,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000201','Send for client review',false,2,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','Wireframe the hero',true,0,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','Pick hero image',true,1,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','Build responsive variant',false,2,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000203','Dev handoff',false,3,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000204','Welcome email',false,0,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000204','Day-3 nudge',false,1,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000204','Launch announcement',false,2,'803f834a-c4a4-451e-8139-8be669b2e7a3','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','Kickoff call',true,0,'185ada37-388e-40da-bf68-769de255b43e','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','Set up workspace',true,1,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000207','Invite the team',true,2,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020c','Gather metrics',false,0,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-00000000020c','Write summary',false,1,'39ddc0ea-3679-47a8-9eda-1d49f0217f70','803f834a-c4a4-451e-8139-8be669b2e7a3');

-- ── comments (one with a @mention) ──
insert into buzzybee.task_comments (task_id, user_id, user_name, message, mentioned_user_ids) values
 ('d0d0d0d0-0000-4000-8000-000000000201','2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','Added the latest pricing — thanks @Mark! Numbers look solid.', array['185ada37-388e-40da-bf68-769de255b43e']::uuid[]),
 ('d0d0d0d0-0000-4000-8000-000000000201','185ada37-388e-40da-bf68-769de255b43e','Mark','On it — sending the quote to the client today.', '{}'),
 ('d0d0d0d0-0000-4000-8000-000000000203','185ada37-388e-40da-bf68-769de255b43e','Mark','Love the new hero direction 🔥', '{}'),
 ('d0d0d0d0-0000-4000-8000-000000000207','39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','Client is thrilled with the onboarding 🎉', '{}'),
 ('d0d0d0d0-0000-4000-8000-000000000204','803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','Let''s get this sequence out before Friday.', '{}');

-- ── CRM companies ──
insert into buzzybee.crm_companies (id, name, industry, client_id, is_client, created_by, color) values
 ('d0d0d0d0-0000-4000-8000-000000000301','Northwind Traders','Logistics','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#2f6fed'),
 ('d0d0d0d0-0000-4000-8000-000000000302','Globex Corp','Manufacturing','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#7b2d86'),
 ('d0d0d0d0-0000-4000-8000-000000000303','Initech','Software','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#0d9488'),
 ('d0d0d0d0-0000-4000-8000-000000000304','Umbrella Wellness','Healthcare','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#d6336c'),
 ('d0d0d0d0-0000-4000-8000-000000000305','Acme Co','Retail','d0d0d0d0-0000-4000-8000-000000000001',true,'803f834a-c4a4-451e-8139-8be669b2e7a3','#c2700c'),
 ('d0d0d0d0-0000-4000-8000-000000000306','Soylent Foods','Food & Beverage','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#15803d'),
 ('d0d0d0d0-0000-4000-8000-000000000307','Hooli','Technology','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#4f46e5'),
 ('d0d0d0d0-0000-4000-8000-000000000308','Stark Industries','Energy','d0d0d0d0-0000-4000-8000-000000000001',false,'803f834a-c4a4-451e-8139-8be669b2e7a3','#c2253c');

-- ── CRM deals (across every stage; two Won) ──
insert into buzzybee.crm_deals (id, title, company_id, stage, value, owner_id, client_id, created_by, health, priority, won_at, sort) values
 ('d0d0d0d0-0000-4000-8000-000000000401','Northwind — Q2 retainer','d0d0d0d0-0000-4000-8000-000000000301','lead',4200,'185ada37-388e-40da-bf68-769de255b43e','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','Medium',null,0),
 ('d0d0d0d0-0000-4000-8000-000000000402','Globex — website refresh','d0d0d0d0-0000-4000-8000-000000000302','lead',2800,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','cold','Low',null,1),
 ('d0d0d0d0-0000-4000-8000-000000000403','Hooli — brand sprint','d0d0d0d0-0000-4000-8000-000000000307','lead',3500,'185ada37-388e-40da-bf68-769de255b43e','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','Medium',null,2),
 ('d0d0d0d0-0000-4000-8000-000000000404','Initech — automation pilot','d0d0d0d0-0000-4000-8000-000000000303','contacted',6500,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','hot','High',null,0),
 ('d0d0d0d0-0000-4000-8000-000000000405','Soylent — social management','d0d0d0d0-0000-4000-8000-000000000306','contacted',1800,'185ada37-388e-40da-bf68-769de255b43e','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','Medium',null,1),
 ('d0d0d0d0-0000-4000-8000-000000000406','Umbrella — wellness campaign','d0d0d0d0-0000-4000-8000-000000000304','proposal',9000,'803f834a-c4a4-451e-8139-8be669b2e7a3','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','hot','High',null,0),
 ('d0d0d0d0-0000-4000-8000-000000000407','Stark — launch package','d0d0d0d0-0000-4000-8000-000000000308','proposal',15000,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','High',null,1),
 ('d0d0d0d0-0000-4000-8000-000000000408','Globex — annual contract','d0d0d0d0-0000-4000-8000-000000000302','negotiation',12000,'185ada37-388e-40da-bf68-769de255b43e','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','hot','High',null,0),
 ('d0d0d0d0-0000-4000-8000-000000000409','Hooli — retainer upgrade','d0d0d0d0-0000-4000-8000-000000000307','negotiation',7400,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','Medium',null,1),
 ('d0d0d0d0-0000-4000-8000-00000000040a','Acme Co — full-service','d0d0d0d0-0000-4000-8000-000000000305','won',9500,'185ada37-388e-40da-bf68-769de255b43e','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','hot','High',now()-interval '7 days',0),
 ('d0d0d0d0-0000-4000-8000-00000000040b','Northwind — pilot project','d0d0d0d0-0000-4000-8000-000000000301','won',3200,'803f834a-c4a4-451e-8139-8be669b2e7a3','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','warm','Medium',now()-interval '20 days',1),
 ('d0d0d0d0-0000-4000-8000-00000000040c','Soylent — one-off','d0d0d0d0-0000-4000-8000-000000000306','lost',1200,'2806d3a2-e482-4da4-b68a-0ae99d5f88db','d0d0d0d0-0000-4000-8000-000000000001','803f834a-c4a4-451e-8139-8be669b2e7a3','cold','Low',null,0);

-- ── channels ──
insert into buzzybee.channels (id, client_id, name, topic, created_by) values
 ('d0d0d0d0-0000-4000-8000-000000000501','d0d0d0d0-0000-4000-8000-000000000001','general','Team-wide chatter','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000502','d0d0d0d0-0000-4000-8000-000000000001','sales','Pipeline & wins','803f834a-c4a4-451e-8139-8be669b2e7a3'),
 ('d0d0d0d0-0000-4000-8000-000000000503','d0d0d0d0-0000-4000-8000-000000000001','design','Creative reviews','803f834a-c4a4-451e-8139-8be669b2e7a3');

-- ── messages ──
insert into buzzybee.messages (channel_id, user_id, user_name, body, created_at, is_pinned, is_decision) values
 ('d0d0d0d0-0000-4000-8000-000000000501','185ada37-388e-40da-bf68-769de255b43e','Mark','Morning team! Big week — Spring Campaign kicks off 🐝', now()-interval '3 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000501','2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','Landing hero v2 is up for review whenever you have a sec', now()-interval '2 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000501','39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','Heads up: client call moved to 2pm today', now()-interval '90 minutes', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000501','803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','Great momentum everyone — pipeline is looking healthy 👏', now()-interval '40 minutes', true, false),
 ('d0d0d0d0-0000-4000-8000-000000000502','185ada37-388e-40da-bf68-769de255b43e','Mark','Closed Acme Co full-service — $9.5k! 🎉', now()-interval '1 day', false, true),
 ('d0d0d0d0-0000-4000-8000-000000000502','2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','Stark launch package proposal sent, fingers crossed', now()-interval '5 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000502','803f834a-c4a4-451e-8139-8be669b2e7a3','Jayson Remigio','Globex annual contract is in negotiation — could be our biggest yet', now()-interval '3 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000503','2806d3a2-e482-4da4-b68a-0ae99d5f88db','Peter Gower','Three hero options attached — thoughts?', now()-interval '6 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000503','185ada37-388e-40da-bf68-769de255b43e','Mark','Option B for me — cleaner', now()-interval '5 hours', false, false),
 ('d0d0d0d0-0000-4000-8000-000000000503','39ddc0ea-3679-47a8-9eda-1d49f0217f70','Dennis','+1 for B', now()-interval '4 hours', false, false);

-- ── re-enable triggers ──
alter table buzzybee.clients enable trigger user;
alter table buzzybee.projects enable trigger user;
alter table buzzybee.task_statuses enable trigger user;
alter table buzzybee.tasks enable trigger user;
alter table buzzybee.task_assignees enable trigger user;
alter table buzzybee.task_subtasks enable trigger user;
alter table buzzybee.task_comments enable trigger user;
alter table buzzybee.channels enable trigger user;
alter table buzzybee.messages enable trigger user;
alter table buzzybee.crm_companies enable trigger user;
alter table buzzybee.crm_deals enable trigger user;

-- ── RLS: demo is readable by ALL authenticated users (additive, read-only) ──
drop policy if exists demo_read on buzzybee.clients;
create policy demo_read on buzzybee.clients for select to authenticated using (id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.projects;
create policy demo_read on buzzybee.projects for select to authenticated using (client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.task_statuses;
create policy demo_read on buzzybee.task_statuses for select to authenticated using (buzzybee.is_demo_project(project_id));
drop policy if exists demo_read on buzzybee.tasks;
create policy demo_read on buzzybee.tasks for select to authenticated using (client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.task_assignees;
create policy demo_read on buzzybee.task_assignees for select to authenticated using (buzzybee.is_demo_task(task_id));
drop policy if exists demo_read on buzzybee.task_subtasks;
create policy demo_read on buzzybee.task_subtasks for select to authenticated using (buzzybee.is_demo_task(task_id));
drop policy if exists demo_read on buzzybee.task_comments;
create policy demo_read on buzzybee.task_comments for select to authenticated using (buzzybee.is_demo_task(task_id));
drop policy if exists demo_read on buzzybee.crm_companies;
create policy demo_read on buzzybee.crm_companies for select to authenticated using (client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.crm_deals;
create policy demo_read on buzzybee.crm_deals for select to authenticated using (client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.channels;
create policy demo_read on buzzybee.channels for select to authenticated using (client_id = 'd0d0d0d0-0000-4000-8000-000000000001');
drop policy if exists demo_read on buzzybee.messages;
create policy demo_read on buzzybee.messages for select to authenticated using (buzzybee.is_demo_channel(channel_id));
