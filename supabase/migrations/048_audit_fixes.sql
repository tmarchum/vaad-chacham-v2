-- 2026-11-16 audit.
-- 1. Onboarding lookups were callable without signing in and returned the
--    primary resident's first + last name for every apartment. Onboarding runs
--    after sign-in, and identification is apartment + family name only.
create or replace function public.onboarding_units(p_building uuid)
returns table(id uuid, number text, floor integer, owner_name text)
language sql security definer set search_path to 'public' stable as $fn$
  select u.id, u.number::text, u.floor::integer, nullif(trim(r.last_name), '') as owner_name
  from public.units u
  left join lateral (select last_name from public.unit_residents
                     where unit_id = u.id and archived = false order by is_primary desc limit 1) r on true
  where u.building_id = p_building
$fn$;
revoke execute on function public.onboarding_units(uuid) from public, anon;
revoke execute on function public.onboarding_buildings() from public, anon;
grant execute on function public.onboarding_units(uuid) to authenticated;
grant execute on function public.onboarding_buildings() to authenticated;

-- 2. Vendors added from מידרג have only a service area, not an address: place
--    them at the city centre (approximate), not on the building itself.
update public.vendors set geo_lat = 32.0871, geo_lng = 34.8878
 where source = 'midrag' and geo_source = 'area' and service_area like 'פתח תקווה%';
