-- 013_billing.sql
-- Platform revenue (ועד פלוס): vendors pay a fee per service call; buildings pay
-- a monthly usage fee scaled by unit count. A ledger — records + reports charges
-- and lets the admin mark them paid. No automatic charging. Admin-only.

create table if not exists public.billing_settings (
  id text primary key default 'default',
  vendor_call_fee numeric default 0,
  building_fee_per_unit numeric default 0,
  currency text default 'ILS',
  updated_at timestamptz default now()
);
insert into public.billing_settings (id) values ('default') on conflict (id) do nothing;

create table if not exists public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- 'vendor_call' | 'building_subscription'
  vendor_id uuid,
  building_id uuid,
  issue_id uuid,
  units int,
  period text,                        -- 'YYYY-MM' for subscriptions
  amount numeric not null default 0,
  status text not null default 'pending',  -- pending | paid | waived
  note text,
  created_at timestamptz default now()
);
-- Idempotency for the "generate charges" action.
create unique index if not exists uq_vendor_call on public.billing_charges (issue_id) where type = 'vendor_call';
create unique index if not exists uq_bld_sub on public.billing_charges (building_id, period) where type = 'building_subscription';

alter table public.billing_settings enable row level security;
alter table public.billing_charges enable row level security;
drop policy if exists bs_admin on public.billing_settings;
create policy bs_admin on public.billing_settings for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists bc_admin on public.billing_charges;
create policy bc_admin on public.billing_charges for all using (public.is_admin()) with check (public.is_admin());
