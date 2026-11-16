-- Vendor location, so dispatch can weigh distance to the building.
-- geo_source: 'google' (the business's Google listing), 'address' (geocoded
-- street address), 'area' (city/service area only — approximate).
alter table public.vendors add column if not exists geo_lat double precision;
alter table public.vendors add column if not exists geo_lng double precision;
alter table public.vendors add column if not exists geo_source text;
