-- CRUD for /remind: allow the creator (or an admin) to edit a pending reminder.
-- 20260625c only shipped select / insert / delete policies.
drop policy if exists comms_reminders_update on buzzybee.comms_reminders;
create policy comms_reminders_update on buzzybee.comms_reminders
  for update to authenticated
  using (created_by = auth.uid() or buzzybee.is_admin())
  with check (created_by = auth.uid() or buzzybee.is_admin());
