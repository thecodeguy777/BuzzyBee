-- Email blasts, part 3: professional layouts. body_html stays the editable
-- content; the layout wrapper (plain / clean card / branded header) is applied
-- at send time by the edge function and mirrored in the composer preview.
alter table buzzybee.crm_campaigns
  add column if not exists layout text not null default 'plain'
    check (layout in ('plain','clean','branded')),
  add column if not exists accent text;
