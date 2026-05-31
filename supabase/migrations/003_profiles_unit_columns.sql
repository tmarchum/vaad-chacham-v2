-- Add unit_id and building_id to profiles so that resident auto-match
-- and the ResidentPortal can read/write the linked unit per user.
--
-- These columns were missing from the initial schema, causing the onboarding
-- auto-match update to silently fail and residents to land in the admin view.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unit_id     UUID REFERENCES public.units(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_unit_id     ON public.profiles(unit_id);
CREATE INDEX IF NOT EXISTS idx_profiles_building_id ON public.profiles(building_id);
