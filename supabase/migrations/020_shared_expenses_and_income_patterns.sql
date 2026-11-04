-- 020 — Shared expenses (year-end settlement with a neighbouring building)
--       + learned income patterns (recurring credits with no name on them).
--
-- Two things the owner asked for on 2026-11-04:
--
-- 1. Some expenses are paid by this building but serve both it and the
--    neighbouring one (building 16). They need to be marked one by one, so at
--    year end there is a settlement figure instead of a guess. The neighbour is
--    NOT a managed building in this system, so it is stored as free text plus a
--    share percentage rather than a foreign key.
--
-- 2. A standing-order credit that carries no name can be matched by hand once;
--    from then on the same day-of-month + amount (+ description) should land on
--    the same unit by itself. That learned rule lives in income_patterns and is
--    applied both by the app and by the monthly Drive import.

-- ─── 1. Shared expenses ──────────────────────────────────────────────────────

alter table public.expenses
  add column if not exists is_shared       boolean not null default false,
  add column if not exists shared_with     text,
  add column if not exists shared_percent  numeric(5,2) not null default 50,
  add column if not exists shared_settled  boolean not null default false,
  add column if not exists shared_note     text;

comment on column public.expenses.is_shared      is 'הוצאה משותפת עם בניין שכן — נכנסת להתחשבנות סוף שנה';
comment on column public.expenses.shared_with    is 'עם מי ההוצאה משותפת (טקסט חופשי, למשל "משורר ישעיהו 16")';
comment on column public.expenses.shared_percent is 'אחוז החלק של הצד השני (ברירת מחדל 50%)';
comment on column public.expenses.shared_settled is 'סומן כמוסדר — כבר נכלל בהתחשבנות שבוצעה';

-- The settlement screens filter on these two, on top of the building scope.
create index if not exists expenses_shared_idx
  on public.expenses (building_id, is_shared)
  where is_shared;

-- ─── 2. Learned income patterns ──────────────────────────────────────────────

create table if not exists public.income_patterns (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references public.buildings(id) on delete cascade,
  unit_id       uuid not null references public.units(id) on delete cascade,
  -- The fingerprint of a recurring credit.
  day_of_month  int  not null check (day_of_month between 1 and 31),
  amount        numeric(12,2) not null,
  description   text not null default '',   -- normalized, may be '' for nameless credits
  -- Housekeeping: how sure are we, and is it still alive.
  times_seen    int  not null default 1,
  last_seen     date,
  active        boolean not null default true,
  source        text not null default 'manual',  -- manual | auto
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One rule per (building, day, amount, description): re-matching the same
-- recurring credit bumps times_seen instead of piling up duplicates.
create unique index if not exists income_patterns_key
  on public.income_patterns (building_id, day_of_month, amount, description);

create index if not exists income_patterns_lookup
  on public.income_patterns (building_id, active, amount);

comment on table public.income_patterns is
  'כללים נלמדים לשיוך הכנסות חוזרות: תאריך בחודש + סכום (+תיאור) → דירה. נוצר בשיוך ידני ומוחל אוטומטית בחודשים הבאים.';

alter table public.income_patterns enable row level security;

drop policy if exists ip_admin_all on public.income_patterns;
create policy ip_admin_all on public.income_patterns
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ip_committee_all on public.income_patterns;
create policy ip_committee_all on public.income_patterns
  for all using (public.is_committee()) with check (public.is_committee());
