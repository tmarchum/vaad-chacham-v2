-- Monthly statement: wording templates, and a per-building switch that turns on
-- automatic sending on the 1st of the month. Off by default — nothing is sent
-- on its own until the system admin switches it on for that building.

alter table public.buildings add column if not exists statement_auto_send boolean not null default false;

-- Wording, editable by the admin. Placeholders: {building} {month} {total}
alter table public.billing_settings add column if not exists statement_subject text not null
  default 'ועד1 — חשבון חודשי {month} · {building}';
alter table public.billing_settings add column if not exists statement_intro text not null
  default E'שלום,\nמצורף החשבון החודשי של ועד1 עבור {building} לחודש {month}.\nסה"כ לתשלום: {total} לפני מע"מ.';
alter table public.billing_settings add column if not exists statement_payment text not null
  default 'התשלום בהעברה בנקאית תוך 14 יום. פרטי החשבון יישלחו בנפרד. לשאלות על החשבון אפשר להשיב למייל הזה.';
alter table public.billing_settings add column if not exists statement_footer text not null
  default 'החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות, וועד1 לא מקבלת עמלה מאף ספק.';

-- build_statement: the scheduler (service role) may run it too.
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
   where building_id = p_building and period = p_period and type <> 'building_subscription';

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
revoke all on function public.build_statement(uuid, text) from public, anon;
grant execute on function public.build_statement(uuid, text) to authenticated, service_role;

-- The public statement page shows the payment line and footer too.
create or replace function public.get_statement(p_token uuid)
returns json language sql security definer set search_path to 'public' stable as $fn$
  select json_build_object(
    'building', b.name, 'period', s.period, 'status', s.status,
    'subscription', s.subscription, 'charges', s.charges, 'awaiting', s.awaiting, 'total', s.total,
    'lines', s.lines, 'sent_at', s.sent_at,
    'payment', (select statement_payment from public.billing_settings where id = 'default'),
    'footer', (select statement_footer from public.billing_settings where id = 'default'))
  from public.billing_statements s join public.buildings b on b.id = s.building_id
  where s.token = p_token
$fn$;

create or replace function public.statement_recipients(p_building uuid)
returns json language plpgsql security definer set search_path to 'public' stable as $fn$
declare v json;
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  select json_build_object(
    'treasurer', (select json_build_object('id', r.id, 'name', r.last_name, 'unit', u.number, 'phone', r.phone,
                         'email', coalesce(nullif(b.billing_email, ''), nullif(r.email, '')))
                    from public.unit_residents r join public.units u on u.id = r.unit_id where r.id = b.treasurer_resident_id),
    'cc', b.statement_cc_committee, 'billing_email', b.billing_email, 'auto_send', b.statement_auto_send,
    'committee', coalesce((select json_agg(json_build_object('id', r.id, 'name', r.last_name, 'unit', u.number,
                         'phone', r.phone, 'email', nullif(r.email, '')) order by u.number)
                    from public.unit_residents r join public.units u on u.id = r.unit_id
                   where u.building_id = b.id and u.board_member and r.is_primary and coalesce(r.archived, false) = false), '[]'::json))
    into v from public.buildings b where b.id = p_building;
  return v;
end $fn$;

-- The switch. ועד1's own invoice, so only the system admin turns it on.
create or replace function public.set_statement_auto_send(p_building uuid, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  if p_on and (select treasurer_resident_id from public.buildings where id = p_building) is null then raise exception 'no_treasurer'; end if;
  update public.buildings set statement_auto_send = coalesce(p_on, false) where id = p_building;
end $fn$;
revoke all on function public.set_statement_auto_send(uuid, boolean) from public, anon;
grant execute on function public.set_statement_auto_send(uuid, boolean) to authenticated;

-- Treasurer of the pilot building (2026-11-16, by the owner's instruction): apt 29.
update public.buildings b
   set treasurer_resident_id = r.id
  from public.unit_residents r join public.units u on u.id = r.unit_id
 where b.name = 'משורר ישעיהו 18' and u.building_id = b.id and u.number::text = '29' and r.is_primary
   and coalesce(r.archived, false) = false;
