-- Designer v2 docs compile to a COMPLETE email body (own background, card,
-- footer block). layout 'doc' tells the sender to use body_html as-is instead
-- of wrapping it in a preset.
alter table buzzybee.crm_campaigns drop constraint if exists crm_campaigns_layout_check;
alter table buzzybee.crm_campaigns add constraint crm_campaigns_layout_check
  check (layout in ('plain','clean','branded','doc'));
alter table buzzybee.crm_email_templates drop constraint if exists crm_email_templates_layout_check;
alter table buzzybee.crm_email_templates add constraint crm_email_templates_layout_check
  check (layout in ('plain','clean','branded','doc'));
