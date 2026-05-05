-- Explicitly add the buzzybee tables to Supabase's realtime publication.
-- The dashboard's per-table replication toggle sometimes doesn't pick up
-- non-public schemas, so we set it via SQL to be sure.

-- Drop-and-add is idempotent across re-runs.
do $pub$
declare
  t text;
begin
  for t in select unnest(array['tasks', 'task_comments', 'task_comment_reads']) loop
    begin
      execute format('alter publication supabase_realtime drop table buzzybee.%I', t);
    exception when undefined_object then
      -- table wasn't in the publication; that's fine
      null;
    end;
    execute format('alter publication supabase_realtime add table buzzybee.%I', t);
  end loop;
end
$pub$;
