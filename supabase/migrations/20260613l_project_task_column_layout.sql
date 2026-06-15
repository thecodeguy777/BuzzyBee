-- Per-project, shared task-table column layout: which columns show + their order.
-- NULL = use built-in defaults (no backfill; distinguishable from an explicit
-- empty config). Column WIDTHS stay per-user (localStorage), not here. The
-- existing projects RLS already governs who can write this column.
alter table buzzybee.projects
  add column if not exists task_column_layout jsonb;
