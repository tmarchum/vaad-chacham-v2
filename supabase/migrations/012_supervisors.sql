-- 012_supervisors.sql
-- Supervisors (מפקחים) — a SEPARATE registry from vendors. After the committee
-- approves a vendor for an issue, it can flag that a supervisor is needed and
-- pick one from this list to oversee the work.

create table if not exists public.supervisors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  area text,
  specialty text,
  rating numeric,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.supervisors enable row level security;
drop policy if exists sup_rw on public.supervisors;
create policy sup_rw on public.supervisors
  for all using (public.is_admin() or public.is_committee())
  with check (public.is_admin() or public.is_committee());

alter table public.issues add column if not exists needs_supervisor boolean default false;
alter table public.issues add column if not exists supervisor_id uuid references public.supervisors(id);
