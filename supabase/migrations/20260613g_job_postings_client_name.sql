-- Display-name snapshot on postings. VAs browse the whole pool but client RLS
-- only lets them resolve names of clients they're assigned to — so the posting
-- carries the name it was created with.
alter table buzzybee.job_postings
  add column if not exists client_name text;
