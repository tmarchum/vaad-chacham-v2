-- 036_vendor_google_sourcing.sql
-- Admin sources vendor candidates from Google (Places API) by trade + area,
-- keeping only businesses with an Israeli mobile and a rating/review count
-- above the admin's threshold. Candidates enter the pool as 'pending' and
-- join only after they answer the invite with "מאשר".

alter table public.vendors add column if not exists google_place_id text;
alter table public.vendors add column if not exists review_count integer;
alter table public.vendors add column if not exists maps_url text;
alter table public.vendors add column if not exists source text not null default 'manual';

-- Plain (non-partial) unique index so upsert ON CONFLICT can use it; NULLs never collide.
create unique index if not exists vendors_google_place_id_key
  on public.vendors (google_place_id);

comment on column public.vendors.source is 'manual | google — where the vendor record came from';
