-- Monthly statement of ועד1's charges to a building, addressed to the treasurer.
-- The treasurer is one of the building's committee residents (chosen later in
-- "חשבון ועד1"); until one is set nothing is sent to anyone.

alter table public.buildings add column if not exists treasurer_resident_id uuid references public.unit_residents(id) on delete set null;
alter table public.buildings add column if not exists billing_email text;          -- optional override of the treasurer's email
alter table public.buildings add column if not exists statement_cc_committee boolean not null default true;

create table if not exists public.billing_statements (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  period       text not null check (period ~ '^\d{4}-\d{2}$'),
  subscription numeric(12,2) not null default 0,
  charges      numeric(12,2) not null default 0,     -- approved + auto, excluding subscription
  awaiting     numeric(12,2) not null default 0,     -- waiting for committee approval: NOT in total
  total        numeric(12,2) not null default 0,     -- subscription + charges, before VAT
  lines        jsonb not null default '[]'::jsonb,
  status       text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  token        uuid not null default gen_random_uuid(),
  sent_at      timestamptz,
  sent_to      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (building_id, period)
);
create unique index if not exists billing_statements_token_key on public.billing_statements (token);
alter table public.billing_statements enable row level security;
drop policy if exists billing_statements_read on public.billing_statements;
create policy billing_statements_read on public.billing_statements for select
  using (is_admin() or (is_committee() and building_id in (select my_building_ids())));
drop policy if exists billing_statements_admin on public.billing_statements;
create policy billing_statements_admin on public.billing_statements for all
  using (is_admin()) with check (is_admin());

-- Build (or rebuild, while still a draft) the statement of one building for one
-- month. Admin only. Numbers come straight from billing_charges and the plan.
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
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
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
grant execute on function public.build_statement(uuid, text) to authenticated;

-- The treasurer opens the statement from a link, without signing in.
create or replace function public.get_statement(p_token uuid)
returns json language sql security definer set search_path to 'public' stable as $fn$
  select json_build_object(
    'building', b.name, 'period', s.period, 'status', s.status,
    'subscription', s.subscription, 'charges', s.charges, 'awaiting', s.awaiting, 'total', s.total,
    'lines', s.lines, 'sent_at', s.sent_at)
  from public.billing_statements s join public.buildings b on b.id = s.building_id
  where s.token = p_token
$fn$;
grant execute on function public.get_statement(uuid) to anon, authenticated;

-- Who gets the statement: the treasurer (+ the rest of the committee as copy).
create or replace function public.statement_recipients(p_building uuid)
returns json language plpgsql security definer set search_path to 'public' stable as $fn$
declare v json;
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  select json_build_object(
    'treasurer', (select json_build_object('id', r.id, 'name', r.last_name, 'unit', u.number, 'phone', r.phone,
                         'email', coalesce(nullif(b.billing_email, ''), nullif(r.email, '')))
                    from public.unit_residents r join public.units u on u.id = r.unit_id where r.id = b.treasurer_resident_id),
    'cc', b.statement_cc_committee, 'billing_email', b.billing_email,
    'committee', coalesce((select json_agg(json_build_object('id', r.id, 'name', r.last_name, 'unit', u.number,
                         'phone', r.phone, 'email', nullif(r.email, '')) order by u.number)
                    from public.unit_residents r join public.units u on u.id = r.unit_id
                   where u.building_id = b.id and u.board_member and r.is_primary and coalesce(r.archived, false) = false), '[]'::json))
    into v from public.buildings b where b.id = p_building;
  return v;
end $fn$;
grant execute on function public.statement_recipients(uuid) to authenticated;

create or replace function public.set_building_treasurer(p_building uuid, p_resident uuid, p_email text, p_cc boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  if p_resident is not null and not exists (
       select 1 from public.unit_residents r join public.units u on u.id = r.unit_id
        where r.id = p_resident and u.building_id = p_building) then raise exception 'not_in_building'; end if;
  update public.buildings set treasurer_resident_id = p_resident, billing_email = nullif(trim(coalesce(p_email, '')), ''),
         statement_cc_committee = coalesce(p_cc, true) where id = p_building;
end $fn$;
grant execute on function public.set_building_treasurer(uuid, uuid, text, boolean) to authenticated;

create or replace function public.mark_statement_sent(p_statement uuid, p_to text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  update public.billing_statements set status = 'sent', sent_at = now(), sent_to = p_to, updated_at = now()
   where id = p_statement and status in ('draft', 'sent');
end $fn$;
grant execute on function public.mark_statement_sent(uuid, text) to authenticated;

insert into public.message_templates (key, title, category, language, audience, body, variables, active, meta_status)
select 'committee_monthly_statement', 'חשבון חודשי של ועד1 לגזבר', 'UTILITY', 'he', 'resident',
  E'שלום,\nהחשבון החודשי של ועד1 עבור {{1}} לחודש {{2}} מוכן.\nסה"כ לתשלום: {{3}} ₪ לפני מע"מ.\nהפירוט המלא בקישור.',
  '["בניין","חודש","סכום"]'::jsonb, true, 'PENDING'
where not exists (select 1 from public.message_templates where key = 'committee_monthly_statement');
