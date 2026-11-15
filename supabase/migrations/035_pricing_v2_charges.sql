-- Pricing v2 (agreed 2026-11-15): two tiers, money-priced extras, a committee
-- approval on every charge, parts, and a per-building choice of what happens
-- when the punch card runs out.
--
--   כניסה (basic)    ₪10/unit, floor ₪250 — self-serve, no vendor pool, no
--                     bank import, no monthly visit.
--   ליווי (assisted) ₪25/unit, floor ₪750 — adds bank import, the rated vendor
--                     pool, and one included hour a month (the defect walk).
--   ניהול מלא (managed) is retired: full management runs at ~8% operating
--   margin even at FirstService's scale. The row stays, inactive, because cards
--   and buildings may still reference its key.
--
-- Money rules that the schema enforces or records:
--   * vendor money never passes through ועד1 — the building pays vendors
--     directly; billing_charges only ever holds ועד1's own services;
--   * every charge carries an approval state. A charge the committee started
--     itself (it saw the price and clicked) is approved on creation; a charge
--     the management side raises is auto-approved only while the month stays
--     under the building's auto_approve_limit, otherwise it waits;
--   * parts: stock items at a fixed catalogue price, anything else at receipt
--     cost plus a disclosed handling percentage.

-- ── 1. Plans ───────────────────────────────────────────────────────────────
alter table public.service_plans add column if not exists active boolean not null default true;
alter table public.service_plans add column if not exists hour_price numeric not null default 0;
alter table public.service_plans add column if not exists handle_fee numeric not null default 0;
alter table public.service_plans add column if not exists card_bonus_punches integer not null default 0;
alter table public.service_plans add column if not exists includes_vendor_pool boolean not null default false;
alter table public.service_plans add column if not exists includes_bank_import boolean not null default false;

update public.service_plans set
  label = 'כניסה', price_per_unit = 10, min_per_building = 250,
  card_price = 3500, card_punches = 10, card_bonus_punches = 1,
  hour_price = 350, handle_fee = 200, included_punches = 0,
  includes_vendor_pool = false, includes_bank_import = false,
  active = true, updated_at = now()
where key = 'basic';

-- included_punches = 1: the monthly defect walk, up to an hour, is included.
update public.service_plans set
  label = 'ליווי', price_per_unit = 25, min_per_building = 750,
  card_price = 3000, card_punches = 10, card_bonus_punches = 1,
  hour_price = 300, handle_fee = 150, included_punches = 1,
  includes_vendor_pool = true, includes_bank_import = true,
  active = true, updated_at = now()
where key = 'assisted';

update public.service_plans set active = false, updated_at = now() where key = 'managed';

-- ── 2. Extras price list ───────────────────────────────────────────────────
create table if not exists public.service_price_items (
  key text primary key,
  label text not null,
  unit text not null default 'job' check (unit in ('job', 'event', 'year', 'item')),
  price_basic numeric check (price_basic is null or price_basic >= 0),       -- null = not offered
  price_assisted numeric check (price_assisted is null or price_assisted >= 0),
  payer text not null default 'building' check (payer in ('building', 'resident')),
  position integer not null default 0,
  active boolean not null default true,
  notes text default '',
  updated_at timestamptz default now()
);

insert into public.service_price_items (key, label, unit, price_basic, price_assisted, payer, position, notes) values
  ('onboarding',             'קליטת בניין',                       'event', null, 1500, 'building', 1, 'בכניסה — הקמה עצמית ללא תשלום'),
  ('assembly_annual',        'אסיפה שנתית ופרוטוקול',              'event', 450,  450,  'building', 2, 'הכנה, הזמנה, סיכום כספי ופרוטוקול — ללא הגעה'),
  ('assembly_annual_attend', 'אסיפה שנתית ופרוטוקול, כולל הגעה',  'event', 750,  750,  'building', 3, 'כולל הגעה והצגה, עד שעתיים'),
  ('assembly_extra',         'אסיפה נוספת',                        'event', 350,  350,  'building', 4, ''),
  ('assembly_extra_attend',  'אסיפה נוספת, כולל הגעה',            'event', 600,  600,  'building', 5, ''),
  ('no_debt_certificate',    'אישור היעדר חוב לדירה',             'item',  120,  120,  'resident', 6, 'משולם על ידי הדייר המבקש'),
  ('warranty_tracking',      'מעקב תקופת בדק ואחריות',            'year',  600,  600,  'building', 7, 'לבניינים עד 10 שנים')
on conflict (key) do nothing;

-- ── 3. Parts ───────────────────────────────────────────────────────────────
alter table public.service_settings add column if not exists parts_handling_pct numeric not null default 10;
update public.service_settings set parts_approval_threshold = 300 where parts_approval_threshold = 150;

create table if not exists public.parts_catalog (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  price numeric not null check (price >= 0),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz default now()
);

insert into public.parts_catalog (label, price, position)
select v.label, v.price, v.pos from (values ('נורה', 15, 1), ('אטם', 10, 2), ('סוללה לשלט', 10, 3)) as v(label, price, pos)
where not exists (select 1 from public.parts_catalog);

create table if not exists public.issue_parts (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.issues on delete cascade,
  building_id uuid not null references public.buildings on delete cascade,
  visit_id uuid,
  catalog_id uuid references public.parts_catalog on delete set null,
  label text not null,
  qty numeric not null default 1 check (qty > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  handling_pct numeric not null default 0 check (handling_pct >= 0),
  total numeric not null check (total >= 0),
  receipt_url text,
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists issue_parts_issue_idx on public.issue_parts (issue_id);
create index if not exists issue_parts_building_idx on public.issue_parts (building_id, created_at desc);

-- ── 4. Charges: approval and line detail ───────────────────────────────────
alter table public.billing_charges add column if not exists item_key text;
alter table public.billing_charges add column if not exists quantity numeric;
alter table public.billing_charges add column if not exists unit_price numeric;
alter table public.billing_charges add column if not exists visit_id uuid;
alter table public.billing_charges add column if not exists approval text not null default 'approved';
alter table public.billing_charges add column if not exists requested_by uuid;
alter table public.billing_charges add column if not exists approved_by uuid;
alter table public.billing_charges add column if not exists approved_at timestamptz;
alter table public.billing_charges add column if not exists receipt_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_charges_approval_chk') then
    alter table public.billing_charges add constraint billing_charges_approval_chk
      check (approval in ('awaiting', 'approved', 'auto', 'rejected'));
  end if;
end $$;
create index if not exists billing_charges_building_idx on public.billing_charges (building_id, created_at desc);

-- ── 5. Building preferences ────────────────────────────────────────────────
alter table public.buildings add column if not exists auto_approve_limit numeric not null default 0;
alter table public.buildings add column if not exists card_exhausted_policy text not null default 'bill_hourly';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'buildings_card_policy_chk') then
    alter table public.buildings add constraint buildings_card_policy_chk
      check (card_exhausted_policy in ('bill_hourly', 'block', 'auto_renew'));
  end if;
end $$;

-- ── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.service_price_items enable row level security;
alter table public.parts_catalog enable row level security;
alter table public.issue_parts enable row level security;

drop policy if exists spi_read on public.service_price_items;
create policy spi_read on public.service_price_items for select using (auth.uid() is not null);
drop policy if exists spi_admin on public.service_price_items;
create policy spi_admin on public.service_price_items for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists parts_catalog_read on public.parts_catalog;
create policy parts_catalog_read on public.parts_catalog for select using (auth.uid() is not null);
drop policy if exists parts_catalog_admin on public.parts_catalog;
create policy parts_catalog_admin on public.parts_catalog for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists issue_parts_read on public.issue_parts;
create policy issue_parts_read on public.issue_parts for select
  using (public.is_admin() or building_id in (select public.my_building_ids()));
drop policy if exists issue_parts_admin on public.issue_parts;
create policy issue_parts_admin on public.issue_parts for all using (public.is_admin()) with check (public.is_admin());

-- The committee reads its own building's charges; writes go through the RPCs.
drop policy if exists bc_building_read on public.billing_charges;
create policy bc_building_read on public.billing_charges for select
  using (building_id in (select public.my_building_ids()));

-- ── 7. Functions ───────────────────────────────────────────────────────────

-- Is the caller the admin, or a committee member of this building? NULL-safe:
-- an unknown building is a refusal, never a pass.
create or replace function public.can_act_for_building(p_building uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.is_admin(), false)
      or (p_building is not null and p_building in (select public.my_building_ids()));
$$;
grant execute on function public.can_act_for_building(uuid) to authenticated;

-- Internal: write one charge and decide its approval. Not callable from the
-- client — every public path checks permission first.
create or replace function public._insert_charge(
  p_building uuid, p_type text, p_amount numeric, p_item_key text, p_quantity numeric,
  p_unit_price numeric, p_issue uuid, p_visit uuid, p_note text, p_receipt text,
  p_committee_initiated boolean
) returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_id uuid;
  v_limit numeric;
  v_used numeric;
  v_approval text;
begin
  if p_type not in ('hours', 'card', 'handle_fee', 'service_item', 'parts') then raise exception 'bad_type'; end if;
  if coalesce(p_amount, -1) < 0 then raise exception 'bad_amount'; end if;

  if p_committee_initiated then
    v_approval := 'approved';
  else
    select coalesce(auto_approve_limit, 0) into v_limit from public.buildings where id = p_building;
    select coalesce(sum(amount), 0) into v_used from public.billing_charges
     where building_id = p_building and approval in ('approved', 'auto')
       and type <> 'building_subscription'
       and created_at >= date_trunc('month', now());
    v_approval := case when v_used + p_amount <= coalesce(v_limit, 0) then 'auto' else 'awaiting' end;
  end if;

  insert into public.billing_charges (
    type, building_id, issue_id, visit_id, item_key, quantity, unit_price, amount,
    period, status, approval, requested_by, approved_by, approved_at, note, receipt_url
  ) values (
    p_type, p_building, p_issue, p_visit, p_item_key, p_quantity, p_unit_price, p_amount,
    to_char(now(), 'YYYY-MM'), 'pending', v_approval, auth.uid(),
    case when v_approval in ('approved', 'auto') then auth.uid() end,
    case when v_approval in ('approved', 'auto') then now() end,
    coalesce(p_note, ''), p_receipt
  ) returning id into v_id;
  return v_id;
end $fn$;
revoke all on function public._insert_charge(uuid, text, numeric, text, numeric, numeric, uuid, uuid, text, text, boolean) from public, anon, authenticated;

-- Public: raise a charge. A committee member's own request is approved on
-- creation; the management side's goes through the auto-approve limit.
create or replace function public.create_charge(
  p_building uuid, p_type text, p_amount numeric,
  p_item_key text default null, p_quantity numeric default null, p_unit_price numeric default null,
  p_issue uuid default null, p_visit uuid default null, p_note text default '', p_receipt text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  return public._insert_charge(p_building, p_type, p_amount, p_item_key, p_quantity, p_unit_price,
    p_issue, p_visit, p_note, p_receipt, not coalesce(public.is_admin(), false));
end $fn$;
grant execute on function public.create_charge(uuid, text, numeric, text, numeric, numeric, uuid, uuid, text, text) to authenticated;

-- The committee (or admin) approves or rejects a waiting charge.
create or replace function public.decide_charge(p_charge uuid, p_approve boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_building uuid;
  v_approval text;
begin
  select building_id, approval into v_building, v_approval from public.billing_charges where id = p_charge;
  if v_building is null then raise exception 'not_found'; end if;
  if not public.can_act_for_building(v_building) then raise exception 'forbidden'; end if;
  if v_approval <> 'awaiting' then raise exception 'not_awaiting'; end if;
  update public.billing_charges
     set approval = case when p_approve then 'approved' else 'rejected' end,
         approved_by = auth.uid(), approved_at = now()
   where id = p_charge;
end $fn$;
grant execute on function public.decide_charge(uuid, boolean) to authenticated;

-- The committee sets how much may be approved automatically each month and
-- what happens when the card runs out.
create or replace function public.set_building_billing_prefs(p_building uuid, p_auto_limit numeric, p_policy text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  if p_policy not in ('bill_hourly', 'block', 'auto_renew') then raise exception 'bad_policy'; end if;
  update public.buildings
     set auto_approve_limit = greatest(coalesce(p_auto_limit, 0), 0),
         card_exhausted_policy = p_policy
   where id = p_building;
end $fn$;
grant execute on function public.set_building_billing_prefs(uuid, numeric, text) to authenticated;

-- Buy a card: the plan's punches plus the bonus hour, valid per settings.
create or replace function public.buy_card(p_building uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_plan public.service_plans%rowtype;
  v_months integer;
  v_card uuid;
  v_punches integer;
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  select p.* into v_plan from public.buildings b join public.service_plans p on p.key = b.service_plan where b.id = p_building;
  if v_plan.key is null then raise exception 'no_plan'; end if;
  select coalesce(card_validity_months, 12) into v_months from public.service_settings limit 1;
  v_punches := v_plan.card_punches + coalesce(v_plan.card_bonus_punches, 0);
  insert into public.punch_cards (building_id, plan_key, punches, price, expires_at, paid, notes, created_by)
  values (p_building, v_plan.key, v_punches, v_plan.card_price,
          now() + make_interval(months => coalesce(v_months, 12)), false,
          format('%s שעות + %s בונוס', v_plan.card_punches, coalesce(v_plan.card_bonus_punches, 0)), auth.uid())
  returning id into v_card;
  perform public._insert_charge(p_building, 'card', v_plan.card_price, 'card', 1, v_plan.card_price,
    null, null, format('כרטיסייה: %s שעות + %s בונוס', v_plan.card_punches, coalesce(v_plan.card_bonus_punches, 0)),
    null, not coalesce(public.is_admin(), false));
  return v_card;
end $fn$;
grant execute on function public.buy_card(uuid) to authenticated;

-- Close the punches of one visit. Whatever the card covers comes off it; the
-- rest follows the building's choice: billed by the hour, a new card bought
-- automatically, or recorded as debt (the "block" building already stopped
-- new work at transfer, so debt here is only work that had already begun).
create or replace function public.settle_visit_punches(
  p_building uuid, p_visit uuid, p_issue uuid, p_punches integer,
  p_hours numeric, p_off_hours boolean, p_note text
) returns json language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_balance integer;
  v_policy text;
  v_plan public.service_plans%rowtype;
  v_covered integer;
  v_uncovered integer;
  v_charge uuid;
  v_card uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  if coalesce(p_punches, 0) <= 0 then return json_build_object('covered', 0, 'billed', 0); end if;

  select balance into v_balance from public.punch_balance_of(p_building);
  select card_exhausted_policy into v_policy from public.buildings where id = p_building;
  select p.* into v_plan from public.buildings b join public.service_plans p on p.key = b.service_plan where b.id = p_building;

  v_covered := least(greatest(coalesce(v_balance, 0), 0), p_punches);
  v_uncovered := p_punches - v_covered;

  if v_uncovered > 0 and v_policy = 'bill_hourly' then
    if v_covered > 0 then
      insert into public.punch_ledger (building_id, issue_id, visit_id, punches, hours, off_hours, kind, note, created_by)
      values (p_building, p_issue, p_visit, v_covered, p_hours, p_off_hours, 'handyman', p_note, auth.uid());
    end if;
    v_charge := public._insert_charge(p_building, 'hours', v_uncovered * coalesce(v_plan.hour_price, 0), 'hour',
      v_uncovered, v_plan.hour_price, p_issue, p_visit,
      format('%s שעות מעבר לכרטיסייה · %s', v_uncovered, coalesce(p_note, '')), null, false);
  else
    if v_uncovered > 0 and v_policy = 'auto_renew' then
      v_card := public.buy_card(p_building);
    end if;
    insert into public.punch_ledger (building_id, issue_id, visit_id, punches, hours, off_hours, kind, note, created_by)
    values (p_building, p_issue, p_visit, p_punches, p_hours, p_off_hours, 'handyman', p_note, auth.uid());
  end if;

  return json_build_object('covered', v_covered, 'billed', case when v_charge is null then 0 else v_uncovered end,
    'charge_id', v_charge, 'card_id', v_card, 'policy', v_policy);
end $fn$;
grant execute on function public.settle_visit_punches(uuid, uuid, uuid, integer, numeric, boolean, text) to authenticated;

-- Transfer: the punch block now applies only where the building chose it, and
-- "ועד1 תטפל" is a money fee on the plan, not a punch.
create or replace function public.transfer_issue(p_issue uuid, p_mode text, p_vendor text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_building uuid;
  v_title text;
  v_balance integer;
  v_policy text;
  v_fee numeric;
begin
  if p_mode not in ('next_visit', 'urgent', 'contractor', 'vendor') then raise exception 'bad_mode'; end if;
  if p_mode = 'contractor' and coalesce(p_vendor, '') = '' then raise exception 'no_vendor'; end if;
  select building_id, title into v_building, v_title from public.issues where id = p_issue;
  if v_building is null then raise exception 'not_found'; end if;
  if not public.can_act_for_building(v_building) then raise exception 'forbidden'; end if;

  if p_mode in ('next_visit', 'urgent') and not coalesce(public.is_admin(), false) then
    select card_exhausted_policy into v_policy from public.buildings where id = v_building;
    if v_policy = 'block' then
      select balance into v_balance from public.punch_balance_of(v_building);
      if coalesce(v_balance, 0) < 1 then raise exception 'no_punches'; end if;
    end if;
  end if;

  update public.issues
     set handler = 'management',
         handler_kind = case p_mode when 'contractor' then 'contractor'
                                    when 'vendor' then 'vendor' else 'handyman' end,
         stage = case p_mode when 'next_visit' then 'queued_for_visit'
                             when 'contractor' then 'sent_to_vendor'
                             else 'awaiting_assignment' end,
         vendor_name = case when p_mode = 'contractor' then p_vendor else vendor_name end,
         status = 'acknowledged',
         handled_at = now()
   where id = p_issue;

  if p_mode = 'vendor' then
    select coalesce(p.handle_fee, 0) into v_fee
      from public.buildings b join public.service_plans p on p.key = b.service_plan where b.id = v_building;
    if coalesce(v_fee, 0) > 0 then
      perform public._insert_charge(v_building, 'handle_fee', v_fee, 'handle_fee', 1, v_fee,
        p_issue, null, format('ועד1 מטפלת בספק · %s', coalesce(v_title, '')), null, not coalesce(public.is_admin(), false));
    end if;
  end if;
end $fn$;
grant execute on function public.transfer_issue(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
