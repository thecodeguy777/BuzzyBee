-- Task attachments storage bucket + RLS.
-- Path convention: {client_id}/{task_id}/{uuid}-{filename}
-- Private bucket: access only via signed URLs issued to authenticated users.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 26214400, null)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  public = excluded.public;

-- Helpers: pull client_id and task_id out of the storage object path.
-- storage.foldername(name) returns the path split by '/' (skipping the file).
-- For 'aaa/bbb/file.png' it returns {aaa, bbb}.

-- ---------------------------------------------------------------
-- SELECT: user can read a file if they can read the underlying task.
-- ---------------------------------------------------------------
drop policy if exists "task_attachments_select" on storage.objects;
create policy "task_attachments_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from buzzybee.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  );

-- ---------------------------------------------------------------
-- INSERT: user can upload to a task they can write to.
-- Verify the task exists (tasks RLS already gates which rows the user
-- can see/write — when the EXISTS query runs under the user's auth
-- context, RLS limits visibility to writable tasks).
-- ---------------------------------------------------------------
drop policy if exists "task_attachments_insert" on storage.objects;
create policy "task_attachments_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from buzzybee.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  );

-- ---------------------------------------------------------------
-- DELETE: user can delete a file if they can write the underlying task.
-- ---------------------------------------------------------------
drop policy if exists "task_attachments_delete" on storage.objects;
create policy "task_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from buzzybee.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  );

-- ---------------------------------------------------------------
-- UPDATE: rare (we replace via delete+insert), but allow same gate.
-- ---------------------------------------------------------------
drop policy if exists "task_attachments_update" on storage.objects;
create policy "task_attachments_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from buzzybee.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from buzzybee.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  );
