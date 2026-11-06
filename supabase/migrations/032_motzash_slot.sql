-- 032 — a מוצ"ש slot: Saturday 19:00-23:00, booked separately from the Shabbat.
--
-- In winter time Shabbat ends around 17:00, so Saturday evening is free. The
-- committee wants to let the residents' room out for that window as a booking
-- of its own, which may belong to a different flat than the Shabbat itself.
-- The app offers it on Saturdays in winter time only (src/lib/israelTime.js);
-- in summer Shabbat ends past 20:00 and there is no window.
--
-- Pricing: a dedicated price, falling back to the evening price while it is 0,
-- so the slot is sellable the moment it appears without the committee having
-- to go and configure a room first.

alter table public.booking_resources
  add column if not exists price_motzash numeric default 0;

-- The existing check listed the three slots explicitly, so an insert with
-- 'motzash' would be refused by the database however correct the UI was.
alter table public.bookings
  drop constraint if exists bookings_slot_check;
alter table public.bookings
  add constraint bookings_slot_check
  check (slot = any (array['morning'::text, 'evening'::text, 'full_day'::text, 'motzash'::text]));
