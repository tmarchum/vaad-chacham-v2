-- Joining a building needs the committee's approval.
--
-- Until now anyone signed in with Google could pick any apartment in any
-- building and was linked on the spot. The approval flag (profiles.is_verified,
-- migration 009) existed but the access functions had stopped reading it.
--
-- From here on:
--   * e-mail the committee registered in advance → linked and verified at once (unchanged)
--   * anyone else picks a building and an apartment → waits; sees nothing of the
--     building until a committee member approves
--   * an apartment that already has residents can still be requested (owner and
--     tenant, a couple) — the committee sees who is registered there
--   * everyone linked today is marked verified once, so nobody is locked out

-- 1. Nobody loses access they already have.
update public.profiles set is_verified = true where unit_id is not null and not is_verified;

-- 2. A profile link counts only once it is verified.
create or replace function public.my_unit_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $fn$
  select unit_id from public.unit_residents where user_id = auth.uid()
  union
  select unit_id from public.unit_residents
   where user_id is null and lower(email) = lower(auth.jwt() ->> 'email') and email <> ''
  union
  select unit_id from public.profiles where id = auth.uid() and unit_id is not null and is_verified
$fn$;

create or replace function public.my_building_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $fn$
  select building_id from public.building_memberships where user_id = auth.uid()
  union
  select id from public.buildings where public.is_admin()
  union
  select u.building_id from public.units u where u.id in (select public.my_unit_ids())
  union
  select building_id from public.profiles where id = auth.uid() and building_id is not null and is_verified
$fn$;

-- 3. Acting for a building (approving charges, buying a card, transferring an
--    issue, choosing the treasurer) is the committee's — not any resident's.
create or replace function public.can_act_for_building(p_building uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(public.is_admin(), false)
      or (coalesce(public.is_committee(), false)
          and p_building is not null and p_building in (select public.my_building_ids()));
$fn$;

-- 4. The joining screen shows every apartment and who is registered in it.
create or replace function public.onboarding_units(p_building uuid)
returns table (id uuid, number text, floor integer, owner_name text)
language sql security definer set search_path to 'public' stable as $fn$
  select u.id, u.number::text, u.floor::integer,
         (select nullif(trim(r.last_name), '') from public.unit_residents r
           where r.unit_id = u.id and r.archived = false order by r.is_primary desc limit 1) as owner_name
  from public.units u
  where u.building_id = p_building
  order by u.number
$fn$;

-- 5. Requests waiting for the committee.
create or replace function public.pending_residents(p_building uuid)
returns table (id uuid, email text, name text, unit_number text, registered text, requested_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $fn$
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  return query
    select p.id, p.email, nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           u.number::text,
           (select string_agg(distinct nullif(trim(r.last_name), ''), ', ')
              from public.unit_residents r where r.unit_id = p.unit_id and r.archived = false),
           p.updated_at
      from public.profiles p join public.units u on u.id = p.unit_id
     where p.building_id = p_building and not p.is_verified and p.role = 'resident'
     order by p.updated_at;
end $fn$;
revoke all on function public.pending_residents(uuid) from public, anon;
grant execute on function public.pending_residents(uuid) to authenticated;

-- Approve: the person gets the resident's view of the building.
-- Decline: the link is removed and they can choose again.
create or replace function public.decide_resident(p_profile uuid, p_approve boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_building uuid;
begin
  select building_id into v_building from public.profiles
   where id = p_profile and not is_verified and role = 'resident';
  if v_building is null then raise exception 'not_found'; end if;
  if not public.can_act_for_building(v_building) then raise exception 'forbidden'; end if;
  if p_approve then
    update public.profiles set is_verified = true, updated_at = now() where id = p_profile;
  else
    update public.profiles set unit_id = null, building_id = null, updated_at = now() where id = p_profile;
  end if;
end $fn$;
revoke all on function public.decide_resident(uuid, boolean) from public, anon;
grant execute on function public.decide_resident(uuid, boolean) to authenticated;
