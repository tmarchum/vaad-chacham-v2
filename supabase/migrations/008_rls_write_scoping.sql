-- Prevent residents from writing vaad-managed data.
--
-- Many write policies were "is_admin() OR building_id IN my_building_ids()".
-- Since a resident's my_building_ids() includes their own building, that let
-- residents INSERT/UPDATE/DELETE financial and management records (e.g. mark
-- their own debt paid, delete payments, edit expenses/vendors/documents).
-- Tighten writes to admin/committee, while keeping the resident reads/writes
-- they legitimately need (own unit, own residents, report issues, read their
-- payments and building announcements).

-- Privilege-escalation guard: a non-admin cannot change their own role, and a
-- self-created profile is always a resident.
CREATE OR REPLACE FUNCTION public.guard_profile() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS
$$ BEGIN
  IF NOT public.is_admin() THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.role := OLD.role;
      IF OLD.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN NEW.unit_id := OLD.unit_id; END IF;
      IF OLD.building_id IS NOT NULL AND NEW.building_id IS DISTINCT FROM OLD.building_id THEN NEW.building_id := OLD.building_id; END IF;
    ELSIF TG_OP = 'INSERT' THEN
      NEW.role := 'resident';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lock_profile_unit ON public.profiles;
DROP TRIGGER IF EXISTS trg_guard_profile ON public.profiles;
CREATE TRIGGER trg_guard_profile BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile();

-- Committee/admin-only ALL on vaad-managed tables (residents do not read these
-- in the portal):  expenses, documents, compliance, meeting_minutes,
-- building_assets, quotes, recurring_tasks, work_orders, vendors.
-- (See migration body applied in production for the per-table DROP/CREATE.)
-- payments / announcements: read kept for residents (own unit / building),
-- writes restricted to admin/committee.
-- units / unit_residents: writable for the resident's OWN unit, or admin/committee.
-- issues: residents may INSERT (report); only admin/committee update/delete.
--
-- NOTE: the exact statements were applied via the Supabase management API in the
-- same change; this file documents intent. Helper used everywhere:
--   USING (is_admin() OR (is_committee() AND building_id IN (SELECT my_building_ids())))
