-- Vendor accounting (records only). A bill is what a vendor charged a building;
-- marking it paid records that the BUILDING paid the vendor directly. Money
-- never passes through ועד1 — this is the committee's payables ledger.
create table if not exists public.vendor_bills (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references public.buildings(id) on delete cascade,
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  issue_id      uuid references public.issues(id) on delete set null,
  bill_date     date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  due_date      date,
  doc_number    text,
  description   text not null default '',
  amount        numeric(12,2) not null check (amount >= 0),
  status        text not null default 'open' check (status in ('open','paid','cancelled')),
  paid_at       date,
  paid_amount   numeric(12,2),
  payment_method text,
  payment_ref   text,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists vendor_bills_vendor_idx on public.vendor_bills (vendor_id, building_id);
create index if not exists vendor_bills_building_idx on public.vendor_bills (building_id, status);

alter table public.vendor_bills enable row level security;
drop policy if exists vendor_bills_committee on public.vendor_bills;
create policy vendor_bills_committee on public.vendor_bills for all
  using (is_admin() or (is_committee() and building_id in (select my_building_ids())))
  with check (is_admin() or (is_committee() and building_id in (select my_building_ids())));

create or replace function public.vendor_bills_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists vendor_bills_touch on public.vendor_bills;
create trigger vendor_bills_touch before update on public.vendor_bills
  for each row execute function public.vendor_bills_touch();

-- Committee members of a building can read vendor replies that are not tied to
-- a building (inbound WhatsApp from a vendor their building works with).
drop policy if exists nl_committee_vendor_sel on public.notification_log;
create policy nl_committee_vendor_sel on public.notification_log for select
  using (
    is_committee() and building_id is null and vendor_id is not null and vendor_id in (
      select vendor_id from public.work_orders where building_id in (select my_building_ids()) and vendor_id is not null
      union
      select vendor_id from public.quotes where building_id in (select my_building_ids()) and vendor_id is not null
    )
  );
