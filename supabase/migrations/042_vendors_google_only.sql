-- 2026-11-16 (user request): merge duplicate vendors and keep only vendors that
-- appear on Google. Removed rows are kept in vendors_removed_20261116 so any of
-- them can be restored. None had work orders, quotes, issues, bills or messages.
create table if not exists public.vendors_removed_20261116 as select * from public.vendors where false;
alter table public.vendors_removed_20261116 enable row level security;

-- Merge: a non-Google duplicate (same phone) folds its trade into the Google row.
with g as (select id, right(regexp_replace(phone,'\D','','g'),9) p9 from public.vendors where google_place_id is not null),
     d as (select v.id, v.category, g.id gid from public.vendors v join g on right(regexp_replace(v.phone,'\D','','g'),9)=g.p9 where v.google_place_id is null)
update public.vendors t set specialties = trim(both ', ' from concat_ws(', ', nullif(t.specialties,''), (select string_agg(distinct d.category, ', ') from d where d.gid=t.id)))
where t.id in (select gid from d);

insert into public.vendors_removed_20261116 select * from public.vendors where google_place_id is null;
delete from public.vendors where google_place_id is null;
