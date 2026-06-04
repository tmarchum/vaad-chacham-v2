-- Secure self-registration: a resident who self-onboards (picks a building/unit
-- without an email match to a vaad-created record) gets NO data access until an
-- admin approves them. Residents the vaad created (email match) are auto-verified.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
-- Grandfather everyone who already onboarded so they keep access.
UPDATE public.profiles SET is_verified = true WHERE is_verified = false;

-- Profile-based authorization now requires is_verified. (Email-matched residents
-- are authorized via their unit_residents row regardless.)
CREATE OR REPLACE FUNCTION public.my_unit_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS $f$
  SELECT unit_id FROM public.unit_residents WHERE user_id = auth.uid()
  UNION SELECT unit_id FROM public.unit_residents
    WHERE user_id IS NULL AND lower(email) = lower(auth.jwt() ->> 'email') AND email <> ''
  UNION SELECT unit_id FROM public.profiles
    WHERE id = auth.uid() AND unit_id IS NOT NULL AND is_verified $f$;

CREATE OR REPLACE FUNCTION public.my_building_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS $g$
  SELECT building_id FROM public.building_memberships WHERE user_id = auth.uid()
  UNION SELECT id FROM public.buildings WHERE public.is_admin()
  UNION SELECT u.building_id FROM public.units u WHERE u.id IN (SELECT public.my_unit_ids())
  UNION SELECT building_id FROM public.profiles
    WHERE id = auth.uid() AND building_id IS NOT NULL AND is_verified $g$;

-- Guard: a real logged-in non-admin (current_user = 'authenticated') cannot set
-- their own role / is_verified, nor change their linked unit once set. Service
-- and SECURITY DEFINER contexts (current_user = postgres) are exempt.
CREATE OR REPLACE FUNCTION public.guard_profile() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.role := OLD.role; NEW.is_verified := OLD.is_verified;
      IF OLD.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN NEW.unit_id := OLD.unit_id; END IF;
      IF OLD.building_id IS NOT NULL AND NEW.building_id IS DISTINCT FROM OLD.building_id THEN NEW.building_id := OLD.building_id; END IF;
    ELSIF TG_OP = 'INSERT' THEN
      NEW.role := 'resident'; NEW.is_verified := false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Auto-verify on email match (the vaad already vouched by creating the record).
CREATE OR REPLACE FUNCTION public.claim_verified_unit() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_unit uuid; v_building uuid; BEGIN
  SELECT ur.unit_id, u.building_id INTO v_unit, v_building
  FROM public.unit_residents ur JOIN public.units u ON u.id = ur.unit_id
  WHERE ur.user_id IS NULL AND lower(ur.email) = lower(auth.jwt() ->> 'email') AND ur.email <> '' LIMIT 1;
  IF v_unit IS NOT NULL THEN
    UPDATE public.profiles SET unit_id = v_unit, building_id = v_building, is_verified = true WHERE id = auth.uid();
    RETURN true;
  END IF;
  RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_verified_unit() FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_verified_unit() TO authenticated;
