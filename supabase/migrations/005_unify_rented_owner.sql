-- Unify the "landlord owner" of a rented unit into a single source of truth:
-- units.custom_fields.owner ({first_name,last_name,phone,email}).
--
-- Previously the owner of a rented unit was a unit_residents row with
-- resident_type='owner'. That overloaded resident_type (owner-occupiers in
-- OWNED units are also 'owner'), which caused residents to be reclassified as
-- the owner when a unit's type was toggled. The resident portal and the admin
-- Units screen now both read/write custom_fields.owner for rented units.
--
-- IMPORTANT: only rented-unit owner rows are migrated. Owner rows in OWNED
-- units are the actual occupants (residents) and must stay as resident rows.

WITH ro AS (
  SELECT DISTINCT ON (ur.unit_id)
    ur.unit_id, ur.first_name, ur.last_name, ur.phone, ur.email
  FROM public.unit_residents ur
  JOIN public.units u ON u.id = ur.unit_id
  WHERE ur.resident_type = 'owner'
    AND ur.archived = false
    AND COALESCE(u.custom_fields->>'unit_type', 'owned') = 'rented'
  ORDER BY ur.unit_id, ur.is_primary DESC, ur.created_at
)
UPDATE public.units u
SET custom_fields = COALESCE(u.custom_fields, '{}'::jsonb) || jsonb_build_object(
  'owner', jsonb_build_object(
    'first_name', ro.first_name,
    'last_name',  ro.last_name,
    'phone',      COALESCE(ro.phone, ''),
    'email',      COALESCE(ro.email, '')
  ))
FROM ro
WHERE u.id = ro.unit_id;

-- Archive the migrated owner rows so they no longer appear as residents.
UPDATE public.unit_residents ur
SET archived = true, updated_at = now()
FROM public.units u
WHERE ur.unit_id = u.id
  AND ur.resident_type = 'owner'
  AND ur.archived = false
  AND COALESCE(u.custom_fields->>'unit_type', 'owned') = 'rented';
