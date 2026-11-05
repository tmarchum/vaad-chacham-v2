-- A committee running without a management company has no one watching the
-- annual plan, because there is no plan. This building spends ~27,000 ₪ a
-- month against roughly 29,900 ₪ of dues — a margin thin enough that one
-- 16,460 ₪ lift repair turns a month negative, and nobody sees it coming.
--
-- One row per category per year. Deliberately not seeded: a budget invented
-- from last year's spending is not a decision anyone made.

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  year int not null,
  category text not null,
  annual_amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, year, category)
);

create index if not exists budgets_building_year on public.budgets (building_id, year);

alter table public.budgets enable row level security;

drop policy if exists budgets_read on public.budgets;
create policy budgets_read on public.budgets
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.building_memberships m
      where m.building_id = budgets.building_id and m.user_id = auth.uid()
    )
  );

drop policy if exists budgets_write on public.budgets;
create policy budgets_write on public.budgets
  for all using (public.is_admin()) with check (public.is_admin());
