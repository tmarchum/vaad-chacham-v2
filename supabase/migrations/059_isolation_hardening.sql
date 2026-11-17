-- Isolation between buildings — two leftovers found in the audit.

-- 1. Onboarding listed, for ANY building, each apartment with its owner's
--    surname, to anyone who had merely signed in with Google. A person who
--    has not joined a building yet now sees apartment numbers and floors only.
create or replace function public.onboarding_units(p_building uuid)
returns table (id uuid, number text, floor integer, owner_name text)
language sql security definer set search_path to 'public' stable as $fn$
  select u.id, u.number::text, u.floor::integer,
         case when public.is_admin() or p_building in (select public.my_building_ids())
              then (select nullif(trim(r.last_name), '') from public.unit_residents r
                     where r.unit_id = u.id and r.archived = false order by r.is_primary desc limit 1)
         end as owner_name
  from public.units u
  where u.building_id = p_building
  order by u.number
$fn$;

-- 2. Housekeeping functions that only a trigger and the nightly job call were
--    executable by anyone, signed in or not.
revoke all on function public.resident_after_departure(uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_departed_residents() from public, anon, authenticated;
