-- No-code email builder: designs persist as block JSON alongside the compiled
-- body_html (which stays the single source the sender reads). body_blocks
-- present = the composer reopens in the block editor.
alter table buzzybee.crm_campaigns       add column if not exists body_blocks jsonb;
alter table buzzybee.crm_email_templates add column if not exists body_blocks jsonb;
