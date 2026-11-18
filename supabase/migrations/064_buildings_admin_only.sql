-- Only the system admin creates a building.
-- And while here: the commercial terms on a building are ועד1's, not the
-- committee's. A committee member could update their own building row
-- directly and change its plan, its price, its included hours — or set
-- access_override to 'active' and lift a payment block. Those columns now
-- keep their value unless the admin changes them.

drop policy if exists buildings_insert on public.buildings;
create policy buildings_insert on public.buildings for insert to authenticated with check (public.is_admin());
revoke insert, update, delete, truncate on public.buildings from anon;

-- SECURITY INVOKER on purpose: inside a definer function current_user is the
-- owner, and the "is this a signed-in user" check would never be true.
create or replace function public.guard_building_terms()
returns trigger language plpgsql security invoker set search_path to 'public' as $fn$
begin
  if current_user = 'authenticated' and not coalesce(public.is_admin(), false) then
    new.service_plan              := old.service_plan;
    new.plan_price_override       := old.plan_price_override;
    new.included_punches_override := old.included_punches_override;
    new.access_override           := old.access_override;
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_building_terms on public.buildings;
create trigger trg_guard_building_terms before update on public.buildings
  for each row execute function public.guard_building_terms();
