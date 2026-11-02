-- 016_drift_baseline.sql
-- Codifies objects that existed ONLY in production (created live via the
-- management API) so a fresh `supabase db reset` reproduces them.
-- Everything here is idempotent and matches production as of 2026-11-02.
-- (A full `db dump` baseline needs Docker, which this machine doesn't have;
-- these are the known-drifted objects.)

-- ── notification_log — audit of every outbound message ──────────────────────
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null,
  unit_id uuid,
  case_id uuid,
  channel text default 'email',
  recipient text,
  subject text,
  body text,
  status text default 'sent',
  error_message text,
  created_at timestamptz default now()
);
alter table public.notification_log enable row level security;
drop policy if exists nl_committee_sel on public.notification_log;
create policy nl_committee_sel on public.notification_log
  for select to authenticated
  using (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())));

-- ── push_tokens — FCM device tokens per user ────────────────────────────────
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  platform text,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── vendor_rules — auto-tagging of bank-imported expenses ───────────────────
create table if not exists public.vendor_rules (
  id uuid primary key default gen_random_uuid(),
  building_id uuid,
  match_text text not null,
  vendor text not null,
  category text not null,
  priority integer default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.vendor_rules enable row level security;
drop policy if exists vendor_rules_all on public.vendor_rules;
create policy vendor_rules_all on public.vendor_rules
  for all using (true) with check (true);

-- ── issue_routing_rules — automatic routing of reports by category ──────────
create table if not exists public.issue_routing_rules (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  category text not null,
  assigned_to text,
  vendor_name text,
  notify_email text,
  auto_acknowledge boolean default false,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (building_id, category)
);
alter table public.issue_routing_rules enable row level security;
drop policy if exists irr_committee_all on public.issue_routing_rules;
create policy irr_committee_all on public.issue_routing_rules
  for all using (public.is_admin() or public.is_committee())
  with check (public.is_admin() or public.is_committee());

create or replace function public.apply_issue_routing() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare r record;
begin
  if new.building_id is null or new.category is null or new.category = '' then return new; end if;
  select * into r from public.issue_routing_rules
    where building_id = new.building_id and category = new.category and active = true
    limit 1;
  if not found then return new; end if;
  if (new.assigned_to is null or new.assigned_to = '') and r.assigned_to is not null then
    new.assigned_to := r.assigned_to;
  end if;
  if (new.vendor_name is null or new.vendor_name = '') and r.vendor_name is not null then
    new.vendor_name := r.vendor_name;
  end if;
  if r.auto_acknowledge and new.status = 'reported' then
    new.status := 'acknowledged';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_issue_routing on public.issues;
create trigger trg_issue_routing before insert on public.issues
  for each row execute function public.apply_issue_routing();

-- ── processed_webhooks — idempotency lock for inbound webhooks ──────────────
create table if not exists public.processed_webhooks (
  provider text not null,
  external_id text not null,
  created_at timestamptz default now(),
  primary key (provider, external_id)
);
alter table public.processed_webhooks enable row level security;
-- no policies: service-role only.

-- ── rate_resolved_issue — resident rates a finished issue ───────────────────
-- 'completed' is what the committee's "סמן כבוצע" writes, so it must be
-- ratable (originally only resolved/closed were).
create or replace function public.rate_resolved_issue(p_issue uuid, p_rating integer)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'rating must be 1-5'; end if;
  update public.issues
     set resident_rating = p_rating, resident_rated_at = now()
   where id = p_issue
     and unit_id in (select public.my_unit_ids())
     and status in ('completed','awaiting_payment','resolved','closed');
end $fn$;
