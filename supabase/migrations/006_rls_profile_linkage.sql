-- Authorise residents to read/write their unit's data based on their PROFILE
-- linkage (profiles.unit_id / building_id), not only via an existing
-- unit_residents row.
--
-- Chicken-and-egg fix: a freshly onboarded resident has profiles.unit_id set
-- (by completeOnboarding) but no unit_residents row yet. The ur_write policy
-- derives access from my_building_ids -> my_unit_ids, which only looked at
-- unit_residents, so the resident could not insert their own (first) resident
-- row. Adding the profile as an authorisation source unblocks it.

CREATE OR REPLACE FUNCTION public.my_unit_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $f$
  SELECT unit_id FROM public.unit_residents WHERE user_id = auth.uid()
  UNION
  SELECT unit_id FROM public.unit_residents
    WHERE user_id IS NULL AND lower(email) = lower(auth.jwt() ->> 'email') AND email <> ''
  UNION
  SELECT unit_id FROM public.profiles WHERE id = auth.uid() AND unit_id IS NOT NULL
$f$;

CREATE OR REPLACE FUNCTION public.my_building_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $g$
  SELECT building_id FROM public.building_memberships WHERE user_id = auth.uid()
  UNION SELECT id FROM public.buildings WHERE public.is_admin()
  UNION SELECT u.building_id FROM public.units u WHERE u.id IN (SELECT public.my_unit_ids())
  UNION SELECT building_id FROM public.profiles WHERE id = auth.uid() AND building_id IS NOT NULL
$g$;
