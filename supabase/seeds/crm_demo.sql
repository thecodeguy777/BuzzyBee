-- CRM demo seed (one-off, applied to the live project on 2026-06-10). NOT a
-- migration: it references real client/channel/profile/task ids that only exist
-- in this database. Re-runnable — guarded by `where not exists` on crm_companies.
-- Kept for reference / to re-seed an empty CRM.

with co as (
  insert into buzzybee.crm_companies (name, industry, site, color, is_client, client_id, channel_id)
  select v.name, v.industry, v.site, v.color, v.is_client, v.client_id::uuid,
    case when v.channel_name is null then null
         else (select id from buzzybee.channels
                 where name = v.channel_name
                   and (v.client_id is null or client_id = v.client_id::uuid)
                 limit 1) end
  from (values
    ('Mike Steel Construction Inc','Construction','mikesteel.co','#7b2d86', true, '3f3d1e72-8a4c-430d-bbf7-e6f7a10aef9b','general'),
    ('Acme Co','Manufacturing','acme.co','#2f6fed', true, '83a96c81-b2b8-4d95-b2bf-400d65f5febc','website-development'),
    ('Vertex Builders','Construction','vertexbuilt.com','#0d9488', false, null, null),
    ('Nova Logistics','Logistics','novalogistics.io','#c2700c', false, null, null),
    ('Bayview Properties','Real Estate','bayview.estate','#4f46e5', false, null, null),
    ('Summit Realty','Real Estate','summitrealty.ph','#d6336c', false, null, null),
    ('Globex Media','Media','globex.media','#15803d', false, null, null)
  ) as v(name,industry,site,color,is_client,client_id,channel_name)
  where not exists (select 1 from buzzybee.crm_companies)
  returning id, name, channel_id
),
ct as (
  insert into buzzybee.crm_contacts (company_id, name, role, email, phone, color, is_primary)
  select co.id, v.name, v.role, v.email, v.phone, v.color, v.is_primary
  from (values
    ('Mike Steel Construction Inc','Miguel Aquino','Operations Director','miguel@mikesteel.co','+63 917 555 0142','#7b2d86', true),
    ('Mike Steel Construction Inc','Elena Reyes','Finance Lead','elena@mikesteel.co','+63 917 555 0190','#d6336c', false),
    ('Acme Co','Tom Harper','VP Operations','tom@acme.co','+1 415 555 0110','#2f6fed', true),
    ('Vertex Builders','Rafael Cruz','Owner','rafael@vertexbuilt.com','+63 918 555 0177','#0d9488', true),
    ('Nova Logistics','Daniela Lim','Fleet Manager','daniela@novalogistics.io','+63 919 555 0133','#c2700c', true),
    ('Bayview Properties','Grace Tan','Marketing Head','grace@bayview.estate','+63 920 555 0188','#4f46e5', true),
    ('Summit Realty','Paolo Mendez','Managing Partner','paolo@summitrealty.ph','+63 921 555 0166','#d6336c', true)
  ) as v(company_name,name,role,email,phone,color,is_primary)
  join co on co.name = v.company_name
  returning id
),
de as (
  insert into buzzybee.crm_deals (title, company_id, stage, value, owner_id, close_on, source, health, priority, channel_id, won_at, sort)
  select v.title, co.id, v.stage, v.value, v.owner_id::uuid, v.close_on, v.source, v.health, v.priority,
    co.channel_id, case when v.stage = 'won' then now() else null end, v.sort
  from (values
    ('Website + CRM onboarding','Vertex Builders','negotiation',24000,'803f834a-c4a4-451e-8139-8be669b2e7a3','Jun 20','Referral','warm','High',1),
    ('Fleet tracking system','Nova Logistics','proposal',48000,'109e6475-89d6-4c9e-bb65-dcdcff6ca3e5','Jun 28','Web inquiry','hot','Urgent',1),
    ('Marketing retainer','Bayview Properties','contacted',12000,'1b648c41-0a69-4770-9add-991d67e91b16','Jul 5','Web inquiry','warm','Medium',1),
    ('Office build-out estimate','Summit Realty','lead',8000,'4fedf657-509b-4983-938e-653af439d4a3','—','Cold outreach','cold','Low',1),
    ('Brand refresh + microsite','Globex Media','lead',15000,'1b648c41-0a69-4770-9add-991d67e91b16','—','Referral','warm','Medium',2),
    ('Q3 site expansion package','Mike Steel Construction Inc','won',62000,'803f834a-c4a4-451e-8139-8be669b2e7a3','Won Jun 1','Existing client','hot','High',1),
    ('Website rebuild','Acme Co','won',28000,'1b648c41-0a69-4770-9add-991d67e91b16','Won May 24','Referral','hot','Medium',2)
  ) as v(title,company_name,stage,value,owner_id,close_on,source,health,priority,sort)
  join co on co.name = v.company_name
  returning id, title
),
dt as (
  insert into buzzybee.crm_deal_tasks (deal_id, task_id)
  select de.id, v.task_id::uuid
  from (values
    ('Website rebuild','319fa5a2-65cd-4d7d-992b-4a36c782cc31'),
    ('Website rebuild','7925a3e3-2277-4077-8533-c8e4c5a52d65'),
    ('Website + CRM onboarding','8b0dc1f8-493f-4048-b822-9cda56090628'),
    ('Website + CRM onboarding','30a54747-888d-41b7-8ee5-7c1f248e2365'),
    ('Q3 site expansion package','405d0941-480d-46b1-b89d-256e4280a69e'),
    ('Q3 site expansion package','33eb09e2-9db3-4ae9-9b02-1b48081d5e3c'),
    ('Fleet tracking system','8ee56a26-e41c-4886-93cc-966edd552b8c')
  ) as v(deal_title,task_id)
  join de on de.title = v.deal_title
  returning deal_id
),
ac as (
  insert into buzzybee.crm_deal_activities (deal_id, type, actor_id, body, meta, created_at)
  select de.id, v.type, v.actor_id::uuid, v.body, v.meta, now() - (v.mins || ' minutes')::interval
  from (values
    ('Website + CRM onboarding','stage','803f834a-c4a4-451e-8139-8be669b2e7a3','moved deal to Negotiation',null,60),
    ('Website + CRM onboarding','message','803f834a-c4a4-451e-8139-8be669b2e7a3','Sent revised SOW to Vertex','SOW v2',180),
    ('Website + CRM onboarding','task','1b648c41-0a69-4770-9add-991d67e91b16','Task “Create a website for this” in progress','TASK-0018',300),
    ('Website + CRM onboarding','email','803f834a-c4a4-451e-8139-8be669b2e7a3','Email opened: “Proposal v2 — Vertex”','Opened 2×',1440),
    ('Website + CRM onboarding','call','803f834a-c4a4-451e-8139-8be669b2e7a3','Discovery call with Rafael (32 min)',null,2880),
    ('Fleet tracking system','email','109e6475-89d6-4c9e-bb65-dcdcff6ca3e5','Proposal sent: “Fleet Tracking — Nova”','Delivered',120),
    ('Fleet tracking system','task','109e6475-89d6-4c9e-bb65-dcdcff6ca3e5','Linked task “Incident Report | Driver Accident”','TASK-0009',1440),
    ('Fleet tracking system','meeting','109e6475-89d6-4c9e-bb65-dcdcff6ca3e5','Scoping meeting booked for Thu',null,1500),
    ('Marketing retainer','message','1b648c41-0a69-4770-9add-991d67e91b16','Replied to inbound enquiry','Inbound',240),
    ('Marketing retainer','note','1b648c41-0a69-4770-9add-991d67e91b16','Wants monthly content + paid social',null,1440),
    ('Q3 site expansion package','won','803f834a-c4a4-451e-8139-8be669b2e7a3','Deal won — converted to active client workspace','Mike Steel',12960),
    ('Q3 site expansion package','task','109e6475-89d6-4c9e-bb65-dcdcff6ca3e5','Tasks spun up in the tracker','TASK-0029',12960),
    ('Q3 site expansion package','message','803f834a-c4a4-451e-8139-8be669b2e7a3','Kickoff posted in #general','#general',12960),
    ('Website rebuild','won','1b648c41-0a69-4770-9add-991d67e91b16','Deal won — Acme is now an active client','Acme Co',25920),
    ('Website rebuild','task','1b648c41-0a69-4770-9add-991d67e91b16','Task “Make me a website” linked','TASK-0012',25920)
  ) as v(deal_title,type,actor_id,body,meta,mins)
  join de on de.title = v.deal_title
  returning id
)
select 'seeded' as status;
