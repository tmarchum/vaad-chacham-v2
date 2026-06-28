-- 010_vendor_db_fields.sql
-- Pre-built in-house vendor database: add the fields the committee curates per
-- vendor, replacing runtime web search. Issues are dispatched straight from this
-- pool (see src/lib/vendorMatch.js + Issues.jsx step 3).
--
--   address     — vendor street address (optional)
--   is_regular  — "נותן שירות קבוע": a standing provider for the building,
--                 distinct from on-demand ("לפי צורך") vendors. Boosted in
--                 dispatch ranking.

alter table public.vendors add column if not exists address text;
alter table public.vendors add column if not exists is_regular boolean default false;

-- Vaad Plus membership: once the database is finalized, the committee invites
-- each vendor (WhatsApp) to confirm they want to receive the building's work
-- requests. pending → invited → agreed | declined (managed in the Vendors page,
-- "הזמנות למאגר" tab).
alter table public.vendors add column if not exists membership_status text default 'pending';
alter table public.vendors add column if not exists invited_at timestamptz;
