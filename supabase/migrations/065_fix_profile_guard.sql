-- SECURITY FIX. guard_profile is meant to stop a signed-in user from changing
-- their own role, approval or apartment. It checked current_user =
-- 'authenticated' — but it was SECURITY DEFINER, and inside a definer
-- function current_user is the owner, so the check was never true and the
-- guard never ran: any signed-in user could set their own role to 'admin'.
-- (Verified 2026-11-18 by impersonating a resident in a rolled-back test.)
-- Running it as the caller makes the check mean what it says.
create or replace function public.guard_profile()
returns trigger language plpgsql security invoker set search_path to 'public' as $fn$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'UPDATE' then
      new.role := old.role;
      new.is_verified := old.is_verified;
      if old.unit_id is not null and new.unit_id is distinct from old.unit_id then new.unit_id := old.unit_id; end if;
      if old.building_id is not null and new.building_id is distinct from old.building_id then new.building_id := old.building_id; end if;
    elsif tg_op = 'INSERT' then
      new.role := 'resident';
      new.is_verified := false;
    end if;
  end if;
  return new;
end $fn$;
