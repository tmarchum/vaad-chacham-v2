-- A building that does not pay loses access — the basic version.
--
-- Blocked when, and only when:
--   * the system admin suspended it by hand, or
--   * its direct-debit authorization was cancelled, or
--   * a statement was sent, its debit date passed more than 14 days ago,
--     and the admin has not marked it as debited.
-- A disputed statement (the treasurer objected) never blocks.
-- The admin can keep a building open regardless ("פתוח תמיד"), e.g. when it
-- paid another way. The admin is never blocked, and while blocked the
-- committee can still open "חשבון ועד1" to see what is owed.

alter table public.buildings
  add column if not exists access_override text check (access_override is null or access_override in ('active', 'suspended'));

create or replace function public.building_access(p_building uuid)
returns json language plpgsql security definer set search_path to 'public' stable as $fn$
declare v_override text; v_mandate text; v_late public.billing_statements%rowtype;
begin
  if p_building is null then return json_build_object('blocked', false); end if;
  if not (coalesce(public.is_admin(), false) or p_building in (select public.my_building_ids())) then
    return json_build_object('blocked', false);
  end if;
  select access_override into v_override from public.buildings where id = p_building;
  if v_override = 'active' then return json_build_object('blocked', false, 'override', 'active'); end if;
  if v_override = 'suspended' then return json_build_object('blocked', true, 'reason', 'suspended'); end if;
  select status into v_mandate from public.building_bank_mandates where building_id = p_building;
  if v_mandate = 'cancelled' then return json_build_object('blocked', true, 'reason', 'mandate_cancelled'); end if;
  select * into v_late from public.billing_statements
   where building_id = p_building and status = 'sent' and debit_on is not null
     and debit_on < (now() at time zone 'Asia/Jerusalem')::date - 14
   order by debit_on limit 1;
  if found then
    return json_build_object('blocked', true, 'reason', 'unpaid', 'period', v_late.period, 'total', v_late.total, 'debit_on', v_late.debit_on);
  end if;
  return json_build_object('blocked', false);
end $fn$;
revoke all on function public.building_access(uuid) from public, anon;
grant execute on function public.building_access(uuid) to authenticated;

create or replace function public.set_building_access(p_building uuid, p_override text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  if p_override is not null and p_override not in ('active', 'suspended') then raise exception 'bad_value'; end if;
  update public.buildings set access_override = p_override where id = p_building;
end $fn$;
revoke all on function public.set_building_access(uuid, text) from public, anon;
grant execute on function public.set_building_access(uuid, text) to authenticated;
