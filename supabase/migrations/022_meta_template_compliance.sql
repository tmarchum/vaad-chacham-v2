-- Make every template survive Meta's template review.
--
-- Meta rejects a template body outright — before a human ever reads it — when
-- it ends with a {{n}} placeholder, or when two placeholders sit next to each
-- other with nothing but whitespace between them. Four of ours did exactly
-- that, so a sync would have come back as four rejections and no way to tell
-- from the error why.
--
-- The wording is unchanged in meaning; only a closing static line was added,
-- and the booking status now names what the status refers to. Variable order
-- and count are untouched, so no calling code changes.

update public.message_templates set
  body = E'שלום {{1}},\nבקשת השריון של {{2}} לתאריך {{3}} — הסטטוס: {{4}}.\nפרטים נוספים באפליקציית ועדלי.',
  meta_status = 'draft', rejection_reason = null, updated_at = now()
where key = 'resident_booking_status';

update public.message_templates set
  body = E'שלום {{1}},\nהפנייה שלך בנושא "{{2}}" התקבלה ונפתחה לטיפול.\nמספר פנייה: {{3}}\nנעדכן אותך בהתקדמות.\n\nועד הבית {{4}}\nנשלח מאפליקציית ועדלי',
  meta_status = 'draft', rejection_reason = null, updated_at = now()
where key = 'resident_issue_opened';

update public.message_templates set
  body = E'שלום {{1}},\nאושרה עבודה בכתובת {{2}}: {{3}}\nמועד מתוכנן: {{4}}\nאיש קשר בבניין: {{5}}\nנא לאשר קבלת ההודעה.',
  meta_status = 'draft', rejection_reason = null, updated_at = now()
where key = 'vendor_job_assignment';

update public.message_templates set
  body = E'שלום {{1}},\nועד הבית ב{{2}} מבקש הצעת מחיר עבור: {{3}}\nנשמח לתשובה עם מחיר ומועד אפשרי.\nתודה, {{4}}\nנשלח מאפליקציית ועדלי',
  meta_status = 'draft', rejection_reason = null, updated_at = now()
where key = 'vendor_quote_request';
