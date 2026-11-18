-- How many days after the debit date an unpaid statement blocks the building.
-- Set by the admin in "מסלולים ותמחור" (default 14).
alter table public.billing_settings
  add column if not exists access_grace_days integer not null default 14 check (access_grace_days between 0 and 120);

create or replace function public.building_access(p_building uuid)
returns json language plpgsql security definer set search_path to 'public' stable as $fn$
declare v_override text; v_mandate text; v_late public.billing_statements%rowtype; v_grace integer;
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
  select coalesce(access_grace_days, 14) into v_grace from public.billing_settings where id = 'default';
  select * into v_late from public.billing_statements
   where building_id = p_building and status = 'sent' and debit_on is not null
     and debit_on < (now() at time zone 'Asia/Jerusalem')::date - coalesce(v_grace, 14)
   order by debit_on limit 1;
  if found then
    return json_build_object('blocked', true, 'reason', 'unpaid', 'period', v_late.period, 'total', v_late.total, 'debit_on', v_late.debit_on);
  end if;
  return json_build_object('blocked', false, 'grace_days', coalesce(v_grace, 14));
end $fn$;
