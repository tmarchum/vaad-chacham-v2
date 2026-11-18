-- 070: a vendor's question before pricing goes to the committee through ועד1,
-- and the answer goes back the same way (no names or phones exchanged before a
-- quote is chosen). ועד1 sees every question; a committee sees its building's.

create table if not exists public.quote_questions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  question text not null,
  asked_at timestamptz not null default now(),
  committee_phones text[] not null default '{}',
  relayed boolean not null default false,
  answer text,
  answered_at timestamptz,
  answered_by text,
  status text not null default 'pending' check (status in ('pending', 'answered', 'closed')),
  admin_alerted boolean not null default false
);
create index if not exists quote_questions_pending on public.quote_questions (status, asked_at);
create index if not exists quote_questions_issue on public.quote_questions (issue_id);

alter table public.quote_questions enable row level security;
drop policy if exists qq_admin on public.quote_questions;
drop policy if exists qq_committee_read on public.quote_questions;
create policy qq_admin on public.quote_questions for all using (public.is_admin()) with check (public.is_admin());
create policy qq_committee_read on public.quote_questions for select using (
  public.is_committee() and building_id in (select public.my_building_ids()));
revoke all on public.quote_questions from anon;
