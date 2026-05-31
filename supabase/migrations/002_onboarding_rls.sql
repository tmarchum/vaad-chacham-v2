-- Allow any authenticated user to read all buildings and units.
-- Needed for the resident self-onboarding wizard: new users must be able to
-- browse buildings and pick their unit BEFORE they have a building_membership.
-- The existing policies (buildings_select, units_select) only allow users who
-- already belong to a building — this supplement covers the onboarding case.

DROP POLICY IF EXISTS "buildings_select_authenticated" ON public.buildings;
CREATE POLICY "buildings_select_authenticated"
  ON public.buildings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "units_select_authenticated" ON public.units;
CREATE POLICY "units_select_authenticated"
  ON public.units FOR SELECT TO authenticated USING (true);

-- Allow a resident to read their own unit_residents record by email.
-- This enables auto-match on login: useAuth checks unit_residents WHERE email = user.email
-- Existing policy (ur_select) only allows access via user_id or building_membership,
-- but admin-created resident records have user_id = NULL.

DROP POLICY IF EXISTS "ur_select_by_email" ON public.unit_residents;
CREATE POLICY "ur_select_by_email"
  ON public.unit_residents FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));
