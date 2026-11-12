-- Service plans, pricing, punch cards, and who-handles-what on an issue.
--
-- The product is no longer one thing sold one way. A building sits on one of
-- three plans: basic (free software), assisted (the committee runs the
-- building with tools and a human behind them) or managed (the management
-- side takes every fault). On top of any plan it can buy a punch card:
-- prepaid maintenance work, one punch per hour started, double outside
-- business hours. Parts and licensed contractors are NOT covered by a punch;
-- the building pays those separately against a receipt or an approved quote.
--
-- Every price here is a setting, not a constant. The numbers seeded below are
-- the working assumptions from the pricing discussion and are expected to be
-- edited in the admin screen before the first outside building is signed.

-- Plans ----------------------------------------------------------------------
create table if not exists public.service_plans (
  key text primary key check (key in ('basic', 'assisted', 'managed')),
  label text not null,
  position integer not null default 0,
  price_per_unit numeric not null default 0 check (price_per_unit >= 0),
  min_per_building numeric not null default 0 check (min_per_building >= 0),
  card_price numeric not null default 0 check (card_price >= 0),
  card_punches integer not null default 10 check (card_punches > 0),
  -- Punches included in the monthly price (managed plan). The per-building
  -- override lives on buildings, because it is priced from that building's
  -- own fault history.
  included_punches integer not null default 0 check (included_punches >= 0),
  updated_at timestamptz default now()
);

insert into public.service_plans (key, label, position, price_per_unit, min_per_building, card_price, card_punches, included_punches) values
  ('basic',    'בסיסי',     1,  0,    0, 3500, 10, 0),
  ('assisted', 'ועד מלווה', 2, 17,  250, 3000, 10, 0),
  ('managed',  'ניהול מלא', 3, 40, 1500, 3000, 10, 4)
on conflict (key) do nothing;

-- Global service settings (single row) ----------------------------------------
create table if not exists public.service_settings (
  id boolean primary key default true check (id),
  business_days integer[] not null default array[0,1,2,3,4],
  business_start time not null default '08:00',
  business_end time not null default '17:00',
  off_hours_multiplier integer not null default 2 check (off_hours_multiplier >= 1),
  punch_minutes integer not null default 60 check (punch_minutes > 0),
  card_validity_months integer not null default 12 check (card_validity_months > 0),
  parts_approval_threshold numeric not null default 150 check (parts_approval_threshold >= 0),
  reopen_free_days integer not null default 30 check (reopen_free_days >= 0),
  updated_at timestamptz default now()
);
insert into public.service_settings (id) values (true) on conflict (id) do nothing;
-- A visit is what costs, not an issue: every call-out is at least this many
-- punches, and non-urgent issues wait (up to batch_max_days) to share one.
alter table public.service_settings
  add column if not exists visit_min_punches integer not null default 1 check (visit_min_punches >= 1),
  add column if not exists batch_max_days integer not null default 7 check (batch_max_days >= 0);

-- Which plan a building is on --------------------------------------------------
alter table public.buildings
  add column if not exists service_plan text not null default 'basic'
    references public.service_plans (key),
  add column if not exists plan_price_override numeric check (plan_price_override >= 0),
  add column if not exists included_punches_override integer check (included_punches_override >= 0);

-- Punch cards: what a building bought ------------------------------------------
create table if not exists public.punch_cards (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings on delete cascade,
  plan_key text references public.service_plans (key),
  punches integer not null check (punches > 0),
  price numeric not null default 0 check (price >= 0),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  paid boolean not null default false,
  notes text default '',
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists punch_cards_building_idx on public.punch_cards (building_id, purchased_at desc);

-- Punch ledger: what was used, and on what -------------------------------------
create table if not exists public.punch_ledger (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings on delete cascade,
  issue_id uuid references public.issues on delete set null,
  punches integer not null,
  hours numeric,
  off_hours boolean not null default false,
  kind text not null default 'handyman'
    check (kind in ('handyman', 'vendor_coordination', 'adjustment')),
  note text default '',
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists punch_ledger_building_idx on public.punch_ledger (building_id, created_at desc);
create index if not exists punch_ledger_issue_idx on public.punch_ledger (issue_id);
alter table public.punch_ledger add column if not exists visit_id uuid;

-- Balance per building. Plain rules, the same ones the screens explain:
--   1. A month's included punches (managed plan) are used first that month and
--      do not carry over.
--   2. Beyond that, punches come off the OLDEST card first.
--   3. Whatever is left on a card when it expires is gone.
--   4. Work done with nothing left is a debt (negative balance); the next
--      card pays it off first.
create or replace function public.punch_balance_of(p_building uuid)
returns table (purchased integer, used integer, included_left integer, expired integer, balance integer)
language plpgsql stable set search_path to 'public' as $fn$
declare
  v_included integer;
  v_to_cards integer;
  v_month_used integer;
  v_purch integer := 0;
  v_exp integer := 0;
  v_bal integer := 0;
  v_used integer;
  r record;
begin
  select coalesce(b.included_punches_override, p.included_punches, 0) into v_included
    from public.buildings b left join public.service_plans p on p.key = b.service_plan
   where b.id = p_building;
  v_included := coalesce(v_included, 0);

  select coalesce(sum(l.punches), 0) into v_used from public.punch_ledger l where l.building_id = p_building;
  select coalesce(sum(l.punches), 0) into v_month_used from public.punch_ledger l
   where l.building_id = p_building and l.created_at >= date_trunc('month', now());
  select coalesce(sum(greatest(m.u - v_included, 0)), 0) into v_to_cards
    from (select date_trunc('month', l.created_at) as mo, sum(l.punches) as u
            from public.punch_ledger l where l.building_id = p_building group by 1) m;

  for r in select c.punches, c.expires_at from public.punch_cards c
            where c.building_id = p_building order by c.purchased_at loop
    v_purch := v_purch + r.punches;
    if v_to_cards >= r.punches then
      v_to_cards := v_to_cards - r.punches;
    else
      if r.expires_at is not null and r.expires_at <= now() then
        v_exp := v_exp + (r.punches - v_to_cards);
      else
        v_bal := v_bal + (r.punches - v_to_cards);
      end if;
      v_to_cards := 0;
    end if;
  end loop;

  return query select v_purch, v_used, greatest(v_included - v_month_used, 0), v_exp,
    v_bal - v_to_cards + greatest(v_included - v_month_used, 0);
end $fn$;

create or replace view public.building_punch_balance
with (security_invoker = true) as
select b.id as building_id, x.purchased, x.used, x.included_left, x.expired, x.balance
from public.buildings b cross join lateral public.punch_balance_of(b.id) x;

-- Issues: who handles it, and where it stands inside "in treatment" -------------
-- Status stays the resident-facing answer to "where is it". These columns
-- answer the two questions status was being abused for: whose court the ball
-- is in, and what is happening right now.
alter table public.issues
  add column if not exists handler text check (handler in ('committee', 'management')),
  add column if not exists handler_kind text check (handler_kind in ('handyman', 'vendor')),
  add column if not exists stage text check (stage in
    ('queued_for_visit', 'awaiting_assignment', 'awaiting_quote_approval', 'scheduled', 'done_awaiting_confirmation')),
  add column if not exists close_reason text,
  add column if not exists work_hours numeric check (work_hours >= 0),
  add column if not exists off_hours boolean not null default false,
  add column if not exists punches_charged integer not null default 0,
  add column if not exists parts_cost numeric check (parts_cost >= 0),
  add column if not exists after_photo_url text,
  add column if not exists handled_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_count integer not null default 0,
  add column if not exists visit_id uuid;

-- RLS --------------------------------------------------------------------------
alter table public.service_plans enable row level security;
alter table public.service_settings enable row level security;
alter table public.punch_cards enable row level security;
alter table public.punch_ledger enable row level security;

-- Prices and hours are readable by any signed-in member (a committee has to be
-- able to see what a card costs); only the management side edits them.
drop policy if exists service_plans_read on public.service_plans;
create policy service_plans_read on public.service_plans for select using (auth.uid() is not null);
drop policy if exists service_plans_admin on public.service_plans;
create policy service_plans_admin on public.service_plans for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_settings_read on public.service_settings;
create policy service_settings_read on public.service_settings for select using (auth.uid() is not null);
drop policy if exists service_settings_admin on public.service_settings;
create policy service_settings_admin on public.service_settings for all using (public.is_admin()) with check (public.is_admin());

-- A building sees its own cards and punches. Only the management side records
-- a purchase or a punch: a committee cannot credit itself.
drop policy if exists punch_cards_read on public.punch_cards;
create policy punch_cards_read on public.punch_cards for select
  using (public.is_admin() or building_id in (select public.my_building_ids()));
drop policy if exists punch_cards_admin on public.punch_cards;
create policy punch_cards_admin on public.punch_cards for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists punch_ledger_read on public.punch_ledger;
create policy punch_ledger_read on public.punch_ledger for select
  using (public.is_admin() or building_id in (select public.my_building_ids()));
drop policy if exists punch_ledger_admin on public.punch_ledger;
create policy punch_ledger_admin on public.punch_ledger for all using (public.is_admin()) with check (public.is_admin());

grant select on public.building_punch_balance to authenticated;

-- Resident reopens a fault that was marked done but is not actually fixed.
-- Same authorisation shape as rate_resolved_issue: only for a unit the caller
-- belongs to, and only from a finished state. The handler is kept, so the
-- fault goes back to whoever treated it; reopened_at is what lets the next
-- visit inside the free window cost no punch.
create or replace function public.reopen_issue(p_issue uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  update public.issues
     set status = case when handler = 'management' then 'acknowledged'
                       when handler = 'committee' then 'in_progress'
                       else 'reported' end,
         stage = case when handler = 'management' then 'awaiting_assignment' else null end,
         reopened_at = now(),
         reopen_count = reopen_count + 1,
         resident_rating = null,
         resident_rated_at = null
   where id = p_issue
     and unit_id in (select public.my_unit_ids())
     and status in ('completed', 'closed');
end $fn$;
grant execute on function public.reopen_issue(uuid) to authenticated;


-- Hand an issue to the management side. The committee can do this only while
-- the building has at least one punch; management itself is never blocked.
-- Not urgent = waits for the next visit and shares its cost.
create or replace function public.transfer_issue(p_issue uuid, p_urgent boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_building uuid;
  v_balance integer;
begin
  select building_id into v_building from public.issues where id = p_issue;
  if v_building is null then raise exception 'not_found'; end if;
  if not (public.is_admin() or v_building in (select public.my_building_ids())) then
    raise exception 'forbidden';
  end if;
  if not public.is_admin() then
    select balance into v_balance from public.punch_balance_of(v_building);
    if coalesce(v_balance, 0) < 1 then raise exception 'no_punches'; end if;
  end if;
  update public.issues
     set handler = 'management',
         stage = case when p_urgent then 'awaiting_assignment' else 'queued_for_visit' end,
         status = 'acknowledged',
         handled_at = now()
   where id = p_issue;
end $fn$;
grant execute on function public.transfer_issue(uuid, boolean) to authenticated;
