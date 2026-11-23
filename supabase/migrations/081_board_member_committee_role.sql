-- A unit marked "חבר ועד" gives its verified users the committee role, and
-- unmarking it takes the role back. Until now the mark only routed issues and
-- messages to that person, who then had no access to the committee screens.

create or replace function public.board_role_for_profile()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role = 'resident' and coalesce(new.is_verified, false) and new.unit_id is not null
     and exists (select 1 from public.units u where u.id = new.unit_id and u.board_member) then
    new.role := 'committee';
  end if;
  return new;
end $$;

-- Named to run after trg_guard_profile, which resets role for ordinary users.
drop trigger if exists trg_z_board_role on public.profiles;
create trigger trg_z_board_role before insert or update of unit_id, is_verified, role on public.profiles
  for each row execute function public.board_role_for_profile();

create or replace function public.sync_board_roles()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.board_member, false) is distinct from coalesce(old.board_member, false) then
    if coalesce(new.board_member, false) then
      update public.profiles set role = 'committee', updated_at = now()
       where unit_id = new.id and role = 'resident' and is_verified;
    else
      update public.profiles set role = 'resident', updated_at = now()
       where unit_id = new.id and role = 'committee';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_board_roles on public.units;
create trigger trg_sync_board_roles after update of board_member on public.units
  for each row execute function public.sync_board_roles();

update public.profiles p set role = 'committee', updated_at = now()
  from public.units u
 where u.id = p.unit_id and u.board_member and p.role = 'resident' and p.is_verified;
