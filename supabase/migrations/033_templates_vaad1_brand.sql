-- Rebrand: the five WhatsApp templates that still named the app "ועדלי".
-- Same placeholders, same order — only the brand word changes. Setting
-- meta_status back to 'draft' makes the admin "sync templates" action EDIT the
-- existing Meta template (by meta_id) and send it back into review.

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nנפתחה פנייה חדשה ב{{2}} בקטגוריית {{3}}:\n{{4}}\nדירה: {{5}}\nהפנייה ממתינה לטיפולך באפליקציית ועד1.'
where key = 'committee_issue_opened';

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nהודעה חדשה מוועד הבית ב{{2}}:\n{{3}}\n\nלפרטים נוספים היכנסו לאפליקציית ועד1.'
where key = 'resident_announcement';

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nבקשת השריון של {{2}} לתאריך {{3}} — הסטטוס: {{4}}.\nפרטים נוספים באפליקציית ועד1.'
where key = 'resident_booking_status';

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nהפנייה שלך בנושא "{{2}}" התקבלה ונפתחה לטיפול.\nמספר פנייה: {{3}}\nנעדכן אותך בהתקדמות.\n\nועד הבית {{4}}\nנשלח מאפליקציית ועד1'
where key = 'resident_issue_opened';

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nאנחנו ועד1 — מערכת לניהול ועדי בתים. נשמח לצרף אותך למאגר הספקים שלנו בתחום {{2}}.\nלהצטרפות השב "מאשר", להסרה השב "מסרב".'
where key = 'vendor_invite';

update public.message_templates set meta_status = 'draft', rejection_reason = null, updated_at = now(),
  body = E'שלום {{1}},\nועד הבית ב{{2}} מבקש הצעת מחיר עבור: {{3}}\nנשמח לתשובה עם מחיר ומועד אפשרי.\nתודה, {{4}}\nנשלח מאפליקציית ועד1'
where key = 'vendor_quote_request';
