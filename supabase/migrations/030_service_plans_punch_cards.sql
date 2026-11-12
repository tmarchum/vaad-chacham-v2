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

-- Balance per building: unexpired purchases minus everything used.
create or replace view public.building_punch_balance
with (security_invoker = true) as
select
  b.id as building_id,
  coalesce((select sum(c.punches) from public.punch_cards c
            where c.building_id = b.id and (c.expires_at is null or c.expires_at > now())), 0)::integer as purchased,
  coalesce((select sum(l.punches) from public.punch_ledger l where l.building_id = b.id), 0)::integer as used,
  (coalesce((select sum(c.punches) from public.punch_cards c
             where c.building_id = b.id and (c.expires_at is null or c.expires_at > now())), 0)
   - coalesce((select sum(l.punches) from public.punch_ledger l where l.building_id = b.id), 0))::integer as balance
from public.buildings b;

-- Issues: who handles it, and where it stands inside "in treatment" -------------
-- Status stays the resident-facing answer to "where is it". These columns
-- answer the two questions status was being abused for: whose court the ball
-- is in, and what is happening right now.
alter table public.issues
  add column if not exists handler text check (handler in ('committee', 'management')),
  add column if not exists handler_kind text check (handler_kind in ('handyman', 'vendor')),
  add column if not exists stage text check (stage in
    ('awaiting_assignment', 'awaiting_quote_approval', 'scheduled', 'done_awaiting_confirmation')),
  add column if not exists close_reason text,
  add column if not exists work_hours numeric check (work_hours >= 0),
  add column if not exists off_hours boolean not null default false,
  add column if not exists punches_charged integer not null default 0,
  add column if not exists parts_cost numeric check (parts_cost >= 0),
  add column if not exists after_photo_url text,
  add column if not exists handled_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_count integer not null default 0;

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
