-- ועד1: הפעלת פיילוט על הבניין (מיגרציות 030 + 031 + שיוך הבניין למסלול ועד מלווה)
begin;
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

-- Resident polls: the committee asks, every apartment answers once.
--
-- The competitor ships this and a committee expects it. What it is, and what it
-- is not, is written into the product rather than left to assumption:
--
--   * ONE vote per apartment, not per person. A building is run by apartments;
--     two residents of the same flat do not get two votes. A unit's vote can
--     be changed while the poll is open, and the last answer counts.
--   * owners_only restricts voting to residents registered as owners. Under
--     the Land Law it is the apartment owners who decide; a tenant's view is
--     worth asking for, but it is a different question, and the committee
--     chooses which one it is asking.
--   * It is a poll of residents, not a decision of the general assembly. Where
--     the law or the building's bylaws require an assembly and a majority,
--     this does not replace it. The app says so next to every poll.
--
-- Residents never touch poll_votes directly: they vote through cast_poll_vote
-- and read through poll_results, both of which enforce the rules above and
-- whether results may be shown yet.

-- Which apartment(s) the caller votes for, and whether as an owner.
--
-- unit_residents.user_id is filled for only a handful of residents; the link
-- the resident portal actually runs on is profiles.unit_id (73 of 75 signed-up
-- users). Both are accepted. Ownership is read from the resident directory:
-- the caller counts as an owner when a non-archived owner row in that unit is
-- theirs by user_id or by the same email. A resident whose ownership cannot be
-- matched simply cannot vote in an owners-only poll, and is told to contact
-- the committee, rather than being let through on a guess.
create or replace function public.my_voter_units()
returns table (unit_id uuid, is_owner boolean)
language sql security definer stable set search_path to 'public' as $fn$
  select ur.unit_id, bool_or(ur.resident_type = 'owner')
    from public.unit_residents ur
   where ur.user_id = auth.uid() and coalesce(ur.archived, false) = false
   group by ur.unit_id
  union
  select p.unit_id,
         exists (select 1 from public.unit_residents ur
                  where ur.unit_id = p.unit_id
                    and coalesce(ur.archived, false) = false
                    and ur.resident_type = 'owner'
                    and (ur.user_id = auth.uid()
                         or (ur.email is not null and lower(ur.email) = lower(p.email))))
    from public.profiles p
   where p.id = auth.uid() and p.unit_id is not null
$fn$;
grant execute on function public.my_voter_units() to authenticated;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings on delete cascade,
  title text not null,
  description text default '',
  options jsonb not null default '["בעד","נגד","נמנע"]'::jsonb
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 10),
  owners_only boolean not null default false,
  -- When residents may see the tally: always, once they have voted, or only
  -- after the poll closes (so early results do not sway later voters).
  show_results text not null default 'after_vote'
    check (show_results in ('always', 'after_vote', 'after_close')),
  closes_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists polls_building_idx on public.polls (building_id, created_at desc);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  unit_id uuid not null references public.units on delete cascade,
  option_index integer not null check (option_index >= 0),
  voted_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (poll_id, unit_id)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

-- Who can read a poll: staff of the building, and residents of a unit in it.
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select using (
  public.is_admin()
  or building_id in (select public.my_building_ids())
  or building_id in (select u.building_id from public.units u
                      where u.id in (select v.unit_id from public.my_voter_units() v))
);
-- Who can create, edit and close one: the management side and the committee.
drop policy if exists polls_write on public.polls;
create policy polls_write on public.polls for all
  using (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())))
  with check (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())));

-- Raw votes (which apartment chose what) are for staff only. Residents get
-- totals through poll_results.
drop policy if exists poll_votes_staff on public.poll_votes;
create policy poll_votes_staff on public.poll_votes for select using (
  public.is_admin() or (public.is_committee() and poll_id in (
    select p.id from public.polls p where p.building_id in (select public.my_building_ids())))
);

-- Cast or change a vote ---------------------------------------------------------
create or replace function public.cast_poll_vote(p_poll uuid, p_option integer)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_poll public.polls%rowtype;
  v_unit uuid;
begin
  select * into v_poll from public.polls where id = p_poll;
  if not found then raise exception 'poll_not_found'; end if;
  if v_poll.status <> 'open' or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    raise exception 'poll_closed';
  end if;
  if p_option < 0 or p_option >= jsonb_array_length(v_poll.options) then
    raise exception 'bad_option';
  end if;

  select v.unit_id into v_unit
    from public.my_voter_units() v
    join public.units u on u.id = v.unit_id
   where u.building_id = v_poll.building_id
     and (not v_poll.owners_only or v.is_owner)
   limit 1;
  if v_unit is null then
    if v_poll.owners_only and exists (
         select 1 from public.my_voter_units() v join public.units u on u.id = v.unit_id
          where u.building_id = v_poll.building_id) then
      raise exception 'owners_only';
    end if;
    raise exception 'not_a_resident';
  end if;

  insert into public.poll_votes (poll_id, unit_id, option_index, voted_by)
  values (p_poll, v_unit, p_option, auth.uid())
  on conflict (poll_id, unit_id)
  do update set option_index = excluded.option_index, voted_by = excluded.voted_by, updated_at = now();
end $fn$;
grant execute on function public.cast_poll_vote(uuid, integer) to authenticated;

-- Results, respecting when they may be shown ------------------------------------
create or replace function public.poll_results(p_poll uuid)
returns jsonb language plpgsql security definer stable set search_path to 'public' as $fn$
declare
  v_poll public.polls%rowtype;
  v_staff boolean;
  v_member boolean;
  v_my integer;
  v_closed boolean;
  v_visible boolean;
  v_counts jsonb;
  v_voted integer;
  v_total integer;
begin
  select * into v_poll from public.polls where id = p_poll;
  if not found then return null; end if;

  v_staff := public.is_admin()
    or (public.is_committee() and v_poll.building_id in (select public.my_building_ids()));
  v_member := v_staff or v_poll.building_id in (
    select u.building_id from public.units u
     where u.id in (select v.unit_id from public.my_voter_units() v));
  if not v_member then return null; end if;

  select pv.option_index into v_my
    from public.poll_votes pv
   where pv.poll_id = p_poll and pv.unit_id in (select v.unit_id from public.my_voter_units() v)
   limit 1;

  v_closed := v_poll.status = 'closed' or (v_poll.closes_at is not null and v_poll.closes_at <= now());
  v_visible := v_staff
    or v_poll.show_results = 'always'
    or (v_poll.show_results = 'after_vote' and (v_my is not null or v_closed))
    or (v_poll.show_results = 'after_close' and v_closed);

  select count(*) into v_voted from public.poll_votes where poll_id = p_poll;
  select count(*) into v_total from public.units where building_id = v_poll.building_id;

  if v_visible then
    select jsonb_agg(coalesce(c.n, 0) order by g.i) into v_counts
      from generate_series(0, jsonb_array_length(v_poll.options) - 1) as g(i)
      left join (select option_index, count(*)::integer n from public.poll_votes
                  where poll_id = p_poll group by option_index) c on c.option_index = g.i;
  end if;

  return jsonb_build_object(
    'visible', v_visible, 'counts', v_counts, 'my_option', v_my,
    'voted_units', v_voted, 'total_units', v_total, 'closed', v_closed);
end $fn$;
grant execute on function public.poll_results(uuid) to authenticated;

update public.buildings set service_plan = 'assisted' where id = 'ecceb10a-8f55-4ac7-9adb-f13117f5f55b';
commit;
notify pgrst, 'reload schema';
