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
