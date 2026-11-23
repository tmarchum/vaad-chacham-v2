-- The committee role that a board-member unit gives goes to the unit's primary
-- resident only, not to every account registered on the unit (081 gave it to
-- all of them, a spouse included).

-- Is this account the primary resident of the unit? Matched the way accounts
-- are matched to residents elsewhere: the linked user, else email, else phone.
create or replace function public.is_primary_resident_account(p_unit uuid, p_profile uuid, p_email text, p_phone text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.unit_residents r
     where r.unit_id = p_unit and r.is_primary and not coalesce(r.archived, false)
       and (r.user_id = p_profile
         or (coalesce(r.email, '') <> '' and lower(r.email) = lower(coalesce(p_email, '')))
         or (length(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g')) >= 9
             and right(regexp_replace(r.phone, '\D', '', 'g'), 9) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9))))
$$;

create or replace function public.board_role_for_profile()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role = 'resident' and coalesce(new.is_verified, false) and new.unit_id is not null
     and exists (select 1 from public.units u where u.id = new.unit_id and u.board_member)
     and public.is_primary_resident_account(new.unit_id, new.id, new.email, new.phone) then
    new.role := 'committee';
  end if;
  return new;
end $$;

-- One unit, both directions: the primary resident of a board unit is committee,
-- any other committee account on the unit goes back to resident.
create or replace function public.resync_board_unit(p_unit uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_board boolean;
begin
  select coalesce(board_member, false) into v_board from public.units where id = p_unit;
  update public.profiles p set role = 'resident', updated_at = now()
   where p.unit_id = p_unit and p.role = 'committee'
     and not (coalesce(v_board, false) and public.is_primary_resident_account(p_unit, p.id, p.email, p.phone));
  if coalesce(v_board, false) then
    update public.profiles p set role = 'committee', updated_at = now()
     where p.unit_id = p_unit and p.role = 'resident' and p.is_verified
       and public.is_primary_resident_account(p_unit, p.id, p.email, p.phone);
  end if;
end $$;
revoke all on function public.resync_board_unit(uuid) from public, anon, authenticated;

create or replace function public.sync_board_roles()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.board_member, false) is distinct from coalesce(old.board_member, false) then
    perform public.resync_board_unit(new.id);
  end if;
  return new;
end $$;

-- Changing who the primary resident is moves the role with it.
create or replace function public.sync_board_roles_from_resident()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op <> 'INSERT' then perform public.resync_board_unit(old.unit_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.unit_id is distinct from old.unit_id) then
    perform public.resync_board_unit(new.unit_id);
  elsif tg_op = 'UPDATE' then
    null;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_board_roles_resident on public.unit_residents;
create trigger trg_sync_board_roles_resident
  after insert or delete or update of is_primary, archived, email, phone, user_id, unit_id on public.unit_residents
  for each row execute function public.sync_board_roles_from_resident();

select public.resync_board_unit(id) from public.units where board_member;
