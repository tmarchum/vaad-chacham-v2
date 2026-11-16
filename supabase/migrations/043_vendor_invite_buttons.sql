-- Vendor invite with quick-reply buttons ("מאשר" / "לא מעוניין"). The webhook
-- already reads button replies (msg.button.text) and flips membership.
insert into public.message_templates (key, title, category, language, audience, body, variables, active, meta_status)
select 'vendor_invite_btn', 'הזמנת ספק למאגר (עם כפתורים)', 'MARKETING', 'he', 'vendor',
  E'שלום {{1}},\nאנחנו ועד1 — מערכת לניהול ועדי בתים. נשמח לצרף אותך למאגר הספקים שלנו בתחום {{2}}.\nההצטרפות ללא עלות וללא עמלה על עבודות. הבניין משלם לך ישירות.',
  '["שם הספק","תחום"]'::jsonb, true, 'PENDING'
where not exists (select 1 from public.message_templates where key='vendor_invite_btn');
