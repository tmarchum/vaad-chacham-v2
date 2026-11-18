-- 069: how long vendors have to send a price, set by ועד1 in "מסלולים ותמחור".
-- Urgent 3 hours, otherwise 24 (decided 2026-11-18).
alter table public.service_settings add column if not exists quote_hours_urgent numeric not null default 3
  check (quote_hours_urgent > 0 and quote_hours_urgent <= 72);
alter table public.service_settings add column if not exists quote_hours_normal numeric not null default 24
  check (quote_hours_normal > 0 and quote_hours_normal <= 168);
