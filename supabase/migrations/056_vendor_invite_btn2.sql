-- Vendor invite with buttons, without the line about commissions. Meta does not
-- allow editing a template that is still in review, so it is a new template
-- (vaadly_vendor_invite_btn2); the old row is switched off.
insert into public.message_templates (key, title, category, language, audience, body, variables, active, meta_status)
select 'vendor_invite_btn2', 'הזמנת ספק למאגר (עם כפתורים)', 'MARKETING', 'he', 'vendor',
  E'שלום {{1}},\nאנחנו ועד1 — מערכת לניהול ועדי בתים. נשמח לצרף אותך למאגר הספקים שלנו בתחום {{2}}.\nההצטרפות ללא עלות. הבניין משלם לך ישירות.',
  '["שם הספק","תחום"]'::jsonb, true, 'PENDING'
where not exists (select 1 from public.message_templates where key = 'vendor_invite_btn2');
update public.message_templates set active = false where key = 'vendor_invite_btn';
select key, meta_name, meta_status, active from public.message_templates where key like 'vendor_invite%' order by key;
