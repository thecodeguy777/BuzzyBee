-- Comms: public bucket for chat attachments (files render via public URL, so
-- no storage select policy is needed). Reconstructed from the deployed
-- database — applied remotely as migration 20260602012938
-- "comms_attachments_bucket" but never committed to the repo.

insert into storage.buckets (id, name, public)
values ('comms-attachments', 'comms-attachments', true)
on conflict (id) do nothing;

drop policy if exists comms_attachments_insert on storage.objects;
create policy comms_attachments_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comms-attachments');

drop policy if exists comms_attachments_delete on storage.objects;
create policy comms_attachments_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'comms-attachments' and owner = auth.uid());
