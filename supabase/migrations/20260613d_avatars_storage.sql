-- Profile picture storage bucket + RLS.
-- Path convention: {user_id}/{uuid}.{ext}
-- Public bucket: avatars render everywhere (chat, boards, rosters) so URLs
-- must be stable and unsigned. Paths use unguessable uuids.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone signed in can read (public bucket serves via CDN anyway; this keeps
-- the storage API consistent for list/download calls).
drop policy if exists "avatars_select" on storage.objects;
create policy "avatars_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

-- Users write only inside their own {user_id}/ folder.
drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
