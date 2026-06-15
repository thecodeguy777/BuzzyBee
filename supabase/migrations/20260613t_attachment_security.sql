-- Task attachments: server-side MIME allowlist + tightened write-gate.
-- (1) Bucket allowed_mime_types (was NULL = anything). Excludes svg+xml
--     (stored-XSS via signed URL) and octet-stream.
-- (2) storage.objects write policies move from read-visibility to
--     write-visibility (creator/assignee/multi-assignee/PM/admin) and require
--     the path's client segment to match the task. SELECT stays broad so any
--     viewer can preview. Helpers are SECURITY DEFINER (no RLS recursion).

update storage.buckets
set allowed_mime_types = array[
  'image/png','image/jpeg','image/gif','image/webp','image/heic','image/avif',
  'application/pdf','text/plain','text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','application/x-zip-compressed'
]
where id = 'task-attachments';

drop policy if exists "task_attachments_insert" on storage.objects;
create policy "task_attachments_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from buzzybee.tasks t
    where t.id::text = (storage.foldername(name))[2]
      and t.client_id::text = (storage.foldername(name))[1]
      and ( t.created_by = auth.uid()
            or t.assignee_id = auth.uid()
            or buzzybee.is_task_assignee(t.id, auth.uid())
            or buzzybee.is_client_pm(auth.uid(), t.client_id)
            or buzzybee.is_admin() )
  )
);

drop policy if exists "task_attachments_delete" on storage.objects;
create policy "task_attachments_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments'
  and ( owner = auth.uid()
        or exists (
          select 1 from buzzybee.tasks t
          where t.id::text = (storage.foldername(name))[2]
            and ( t.created_by = auth.uid()
                  or buzzybee.is_client_pm(auth.uid(), t.client_id)
                  or buzzybee.is_admin() )
        ))
);

drop policy if exists "task_attachments_update" on storage.objects;
create policy "task_attachments_update" on storage.objects for update to authenticated
using ( bucket_id = 'task-attachments' and owner = auth.uid() )
with check (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from buzzybee.tasks t
    where t.id::text = (storage.foldername(name))[2]
      and t.client_id::text = (storage.foldername(name))[1]
  )
);
