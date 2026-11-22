-- A vendor we approached, when another vendor was chosen and his 24h WhatsApp
-- window is closed. Warmer than vendor_job_closed: it says why, and looks ahead.
insert into public.message_templates (key, meta_name, title, category, language, audience, body, variables, example, active, meta_status)
select 'vendor_job_other_chosen', 'vaad1_vendor_job_other_chosen', 'נבחר ספק אחר (תודה לספק)', 'UTILITY', 'he', 'vendor',
  E'שלום {{1}}, כאן ועד1.\nהעבודה "{{2}}" שפנינו אליך לגביה נסגרה הפעם עם ספק אחר, שהגיש הצעה שהתאימה יותר לוועד הבית.\nתודה על הזמינות. מקווים לעבוד יחד בעבודה הבאה.',
  '["שם הספק","העבודה"]'::jsonb, '["אבי","תיקון תאורה בחניון"]'::jsonb, true, 'draft'
where not exists (select 1 from public.message_templates where key = 'vendor_job_other_chosen');
