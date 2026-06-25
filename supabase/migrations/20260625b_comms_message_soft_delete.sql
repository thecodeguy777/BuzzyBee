-- Comms: message edit & delete.
--
-- Edit reuses the existing messages.edited_at column (the client stamps it on
-- update). Delete is a SOFT delete: a tombstone (deleted_at + cleared body),
-- not a hard DELETE — messages.parent_id cascades, so removing a threaded
-- parent would wipe its replies. Deleted rows still SELECT (the UI renders
-- "This message was deleted").
--
-- No new RLS needed: the existing messages_update policy (author / admin /
-- client PM, from 20260601_comms_chat.sql) already gates both edit and the
-- soft-delete update, and the broadcast_message trigger already fans UPDATEs
-- out over the channel:{id} topic.

alter table buzzybee.messages
  add column if not exists deleted_at timestamptz;
