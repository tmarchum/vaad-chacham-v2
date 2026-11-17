-- 1. Referral fees from vendors (דמי הפניה): prepared, switched OFF.
--    They are settled between ועד1 and the vendor. The building never sees
--    them and they never enter a building's statement.
-- 2. One source for prices: the marketing site reads the same plan prices the
--    admin edits in "מסלולים ותמחור".

alter table public.billing_settings
  add column if not exists vendor_referral_active boolean not null default false;

-- The building reads its own charges, but never what ועד1 settles with vendors.
drop policy if exists bc_building_read on public.billing_charges;
create policy bc_building_read on public.billing_charges for select
  using (type <> 'vendor_call' and building_id in (select public.my_building_ids()));

-- A referral fee can only be recorded while the switch is on.
create or replace function public.guard_vendor_referral()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.type = 'vendor_call'
     and not coalesce((select vendor_referral_active from public.billing_settings where id = 'default'), false) then
    raise exception 'vendor_referral_off';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_vendor_referral on public.billing_charges;
create trigger trg_guard_vendor_referral before insert on public.billing_charges
  for each row execute function public.guard_vendor_referral();

-- Public price list for the site: plan prices and the setup fee only.
create or replace function public.public_price_list()
returns json language sql security definer set search_path to 'public' stable as $fn$
  select json_build_object(
    'plans', (select json_object_agg(key, json_build_object(
                'unit', price_per_unit, 'min', min_per_building, 'hour', hour_price,
                'card', card_price, 'card_hours', card_punches, 'card_bonus', card_bonus_punches, 'handle', handle_fee))
              from public.service_plans where active),
    'setup', (select price_assisted from public.service_price_items where key = 'onboarding' and active))
$fn$;
revoke all on function public.public_price_list() from public;
grant execute on function public.public_price_list() to anon, authenticated;

-- The building's statement never carries what ועד1 settles with vendors.
create or replace function public.build_statement(p_building uuid, p_period text)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_b public.buildings%rowtype;
  v_plan public.service_plans%rowtype;
  v_units integer;
  v_sub numeric := 0;
  v_charges numeric := 0;
  v_awaiting numeric := 0;
  v_lines jsonb;
  v_id uuid;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(auth.role(), '') = 'service_role') then raise exception 'forbidden'; end if;
  if p_period !~ '^\d{4}-\d{2}$' then raise exception 'bad_period'; end if;
  select * into v_b from public.buildings where id = p_building;
  if not found then raise exception 'not_found'; end if;
  select * into v_plan from public.service_plans where key = v_b.service_plan;
  select count(*) into v_units from public.units where building_id = p_building;

  if v_b.plan_price_override is not null then
    v_sub := v_b.plan_price_override;
  elsif v_plan.key is not null and coalesce(v_plan.price_per_unit, 0) > 0 then
    v_sub := greatest(v_plan.price_per_unit * v_units, coalesce(v_plan.min_per_building, 0));
  end if;

  select coalesce(sum(amount) filter (where approval in ('approved', 'auto')), 0),
         coalesce(sum(amount) filter (where approval = 'awaiting'), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'type', type, 'note', note, 'quantity', quantity, 'unit_price', unit_price,
           'amount', amount, 'approval', approval, 'date', created_at::date) order by created_at)
           filter (where approval <> 'rejected'), '[]'::jsonb)
    into v_charges, v_awaiting, v_lines
    from public.billing_charges
   where building_id = p_building and period = p_period and type not in ('building_subscription', 'vendor_call');

  insert into public.billing_statements (building_id, period, subscription, charges, awaiting, total, lines)
  values (p_building, p_period, v_sub, v_charges, v_awaiting, v_sub + v_charges,
          jsonb_build_array(jsonb_build_object('type', 'building_subscription', 'amount', v_sub, 'approval', 'approved',
            'note', format('מנוי חודשי · %s · %s דירות', coalesce(v_plan.label, ''), v_units))) || v_lines)
  on conflict (building_id, period) do update
    set subscription = excluded.subscription, charges = excluded.charges, awaiting = excluded.awaiting,
        total = excluded.total, lines = excluded.lines, updated_at = now()
    where public.billing_statements.status = 'draft'
  returning id into v_id;
  if v_id is null then select id into v_id from public.billing_statements where building_id = p_building and period = p_period; end if;
  return v_id;
end $fn$;
