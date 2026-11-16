-- ועד1's own handyman. Unlike pool vendors he is not paid by the building
-- per job: his time is logged on the issue (work_hours) and comes off the
-- building's punch card / ועד1 bill. Issues handed to "טיפול ועד1"
-- (next visit / urgent) are dispatched to him on WhatsApp.
alter table public.vendors add column if not exists is_internal boolean not null default false;

insert into public.vendors (name, category, phone, membership_status, source, contact_channel, is_internal, is_regular, available_24_7, specialties, notes)
select 'ועד1 — הנדימן', 'אחזקה כללית', '0542070020', 'agreed', 'manual', 'whatsapp', true, true, false,
  'תיקונים קטנים, אחזקה שוטפת, ביקור אחזקה חודשי',
  'הנדימן של ועד1. שעות הטיפול נרשמות על התקלה ויורדות מהכרטיסייה / חשבון ועד1 — לא דרך חשבון ספק.'
where not exists (select 1 from public.vendors where is_internal);
