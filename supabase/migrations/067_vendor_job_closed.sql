-- "העבודה נתפסה, תודה" — for a vendor we approached and did not pick, when
-- their 24h WhatsApp window is already closed.
insert into public.message_templates (key, meta_name, title, category, language, audience, body, variables, example, active, meta_status)
select 'vendor_job_closed', 'vaad1_vendor_job_closed', 'העבודה נתפסה (תודה לספק)', 'UTILITY', 'he', 'vendor',
  E'שלום {{1}}, כאן ועד1.\nהעבודה "{{2}}" שפנינו אליך לגביה כבר נתפסה. תודה על הזמינות, נפנה אליך שוב בעבודה הבאה.',
  '["שם הספק","העבודה"]'::jsonb, '["אבי","תיקון תאורה בחניון"]'::jsonb, true, 'draft'
where not exists (select 1 from public.message_templates where key = 'vendor_job_closed');
