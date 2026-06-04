-- Security hardening: replace wide-open ("qual = true") RLS policies with
-- scoped ones, and remove world-readable exposure of sensitive data.
--
-- Edge Functions use the service role, which bypasses RLS, so tightening these
-- policies does not affect server-side jobs (send-notification, mcp-proxy…).

-- Role helper: admin or committee
CREATE OR REPLACE FUNCTION public.is_committee() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','committee')); $$;

-- collection_cases: was fully public. Now admin/committee, building-scoped.
DROP POLICY IF EXISTS collection_cases_service ON public.collection_cases;
CREATE POLICY cc_committee ON public.collection_cases FOR ALL TO authenticated
  USING  (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())))
  WITH CHECK (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));

-- notification_log: was fully public. Now admin/committee, building-scoped.
DROP POLICY IF EXISTS notification_log_service ON public.notification_log;
CREATE POLICY nl_committee ON public.notification_log FOR ALL TO authenticated
  USING  (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())))
  WITH CHECK (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));

-- agent_alerts: was fully public. Now admin/committee, building-scoped.
DROP POLICY IF EXISTS agent_alerts_read  ON public.agent_alerts;
DROP POLICY IF EXISTS agent_alerts_write ON public.agent_alerts;
CREATE POLICY aa_committee ON public.agent_alerts FOR ALL TO authenticated
  USING  (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())))
  WITH CHECK (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));

-- bookings: was public (anyone could read/modify/delete any booking). Now
-- building-scoped read/insert; residents update only their own unit's bookings;
-- delete is admin/committee.
DROP POLICY IF EXISTS bk_select ON public.bookings;
DROP POLICY IF EXISTS bk_insert ON public.bookings;
DROP POLICY IF EXISTS bk_update ON public.bookings;
DROP POLICY IF EXISTS bk_delete ON public.bookings;
CREATE POLICY bk_select ON public.bookings FOR SELECT TO authenticated
  USING (public.is_admin() OR building_id IN (SELECT public.my_building_ids()));
CREATE POLICY bk_insert ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (building_id IN (SELECT public.my_building_ids()));
CREATE POLICY bk_update ON public.bookings FOR UPDATE TO authenticated
  USING (public.is_admin() OR unit_id IN (SELECT public.my_unit_ids()) OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));
CREATE POLICY bk_delete ON public.bookings FOR DELETE TO authenticated
  USING (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));

-- booking_resources: read building-scoped; only admin/committee may manage.
DROP POLICY IF EXISTS br_select ON public.booking_resources;
DROP POLICY IF EXISTS br_insert ON public.booking_resources;
DROP POLICY IF EXISTS br_update ON public.booking_resources;
DROP POLICY IF EXISTS br_delete ON public.booking_resources;
CREATE POLICY br_select ON public.booking_resources FOR SELECT TO authenticated
  USING (public.is_admin() OR building_id IN (SELECT public.my_building_ids()));
CREATE POLICY br_write ON public.booking_resources FOR ALL TO authenticated
  USING  (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())))
  WITH CHECK (public.is_admin() OR (public.is_committee() AND building_id IN (SELECT public.my_building_ids())));

-- Onboarding browse: expose ONLY non-sensitive fields via SECURITY DEFINER
-- functions, so the wide buildings/units read policies can be dropped (they
-- exposed bank details and parking gate codes to every logged-in user).
CREATE OR REPLACE FUNCTION public.onboarding_buildings()
  RETURNS TABLE(id uuid, name text, street text, house_number text, city text, total_units integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT id, name, street, house_number, city, total_units FROM public.buildings ORDER BY name $$;
CREATE OR REPLACE FUNCTION public.onboarding_units(p_building uuid)
  RETURNS TABLE(id uuid, number text, floor integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT id, number, floor FROM public.units WHERE building_id = p_building $$;
REVOKE EXECUTE ON FUNCTION public.onboarding_buildings()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.onboarding_units(uuid)    FROM anon;
GRANT  EXECUTE ON FUNCTION public.onboarding_buildings()    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.onboarding_units(uuid)    TO authenticated;

DROP POLICY IF EXISTS buildings_select_authenticated ON public.buildings;
DROP POLICY IF EXISTS units_select_authenticated      ON public.units;

-- Stop privilege escalation: a non-admin may set profiles.unit_id/building_id
-- once (onboarding) but cannot change them afterwards to hop to another unit.
CREATE OR REPLACE FUNCTION public.lock_profile_unit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS
$$ BEGIN
  IF NOT public.is_admin() THEN
    IF OLD.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN NEW.unit_id := OLD.unit_id; END IF;
    IF OLD.building_id IS NOT NULL AND NEW.building_id IS DISTINCT FROM OLD.building_id THEN NEW.building_id := OLD.building_id; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lock_profile_unit ON public.profiles;
CREATE TRIGGER trg_lock_profile_unit BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_profile_unit();
