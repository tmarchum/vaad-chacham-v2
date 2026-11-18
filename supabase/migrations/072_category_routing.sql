-- Routing a new issue by trade, per building, the moment it is opened.
--
-- Each category gets one of three routes (issue_routing_rules.route):
--   vendor     the building's standing contractor (lift company, cleaner):
--              the issue goes straight to them, the committee and ועד1 are told.
--   committee  (default) the committee gets "ועד1 תטפל" / "הוועד יטפל" buttons.
--              "הוועד יטפל" = the committee does it alone, without our vendors.
--   vaad1      ועד1 gets it to decide: our handyman or vendor quotes.
-- buildings.handling_mode = 'vaad1' (071) is "every category is vaad1".
--
-- "ועד1 תטפל" from the committee also lands with ועד1 to decide (stage
-- awaiting_vaad1). Urgent/דחוף: if ועד1 has not decided within 30 minutes,
-- the suggested route goes out by itself.

alter table public.issue_routing_rules add column if not exists route text not null default 'committee';
alter table public.issue_routing_rules drop constraint if exists issue_routing_rules_route_check;
alter table public.issue_routing_rules add constraint issue_routing_rules_route_check check (route in ('vendor', 'committee', 'vaad1'));
update public.issue_routing_rules set route = 'vendor'
 where coalesce(send_to_vendor, false) and coalesce(vendor_name, '') <> '' and route = 'committee';

-- Waiting for ועד1's decision (handyman or quotes).
alter table public.issues drop constraint if exists issues_stage_check;
alter table public.issues add constraint issues_stage_check check (stage = any (array[
  'queued_for_visit', 'sent_to_vendor', 'awaiting_assignment', 'awaiting_quote_approval',
  'scheduled', 'done_awaiting_confirmation', 'awaiting_vaad1']));

alter table public.issues add column if not exists routed_at timestamptz;          -- the opening route ran (once)
alter table public.issues add column if not exists route text;                     -- vendor | committee | vaad1
alter table public.issues add column if not exists vaad1_suggestion text;          -- handyman | quotes | admin
alter table public.issues add column if not exists vaad1_asked_at timestamptz;     -- sent to ועד1 to decide
alter table public.issues add column if not exists committee_reminded_at timestamptz;
alter table public.issues add column if not exists closed_notified_at timestamptz; -- resident got "נסגרה" on WhatsApp

-- Nothing that exists today is routed, reminded or announced as closed again.
update public.issues set routed_at = coalesce(routed_at, now());
update public.issues set closed_notified_at = now()
 where status in ('completed', 'resolved', 'closed', 'rejected') and closed_notified_at is null;
update public.issues set committee_reminded_at = now()
 where committee_reminded_at is null and (handler = 'committee' or handler_kind = 'contractor');

-- Money (prices before VAT): handyman cost to ועד1 per hour, and the per-job
-- fee a vendor pays ועד1 for work done in a building. The fee stays OFF.
update public.billing_settings set handyman_hour_cost = 200 where id = 'default' and coalesce(handyman_hour_cost, 0) = 0;
update public.billing_settings set vendor_call_fee = 25 where id = 'default' and coalesce(vendor_call_fee, 0) = 0;

-- The route is fixed at insert, so the app's own "issue opened" fan-out knows
-- at once that the server tells the committee and the contractor (no race).
create or replace function public.pick_issue_route()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare r record; v_has boolean; v_mode text;
begin
  if new.route is not null then return new; end if;
  select route, vendor_name, active into r from public.issue_routing_rules
   where building_id = new.building_id and category = new.category limit 1;
  v_has := found;
  select handling_mode into v_mode from public.buildings where id = new.building_id;
  new.route := case
    when v_has and coalesce(r.active, true) and r.route = 'vendor' and coalesce(r.vendor_name, '') <> '' then 'vendor'
    when v_has and coalesce(r.active, true) and r.route = 'vaad1' then 'vaad1'
    when v_mode = 'vaad1' then 'vaad1'
    else 'committee' end;
  return new;
end $fn$;
drop trigger if exists trg_pick_issue_route on public.issues;
create trigger trg_pick_issue_route before insert on public.issues
  for each row execute function public.pick_issue_route();

-- The fast path: a new issue is routed at once (the scheduler is the fallback).
create or replace function public.trg_route_issue()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_secret text;
begin
  select api_token into v_secret from public.messaging_secrets where provider = 'edge-internal';
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://stncskqjrmecjckxldvi.supabase.co/functions/v1/whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0bmNza3Fqcm1lY2pja3hsZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDExNzcsImV4cCI6MjA5MDExNzE3N30.7HOgnQskv6RblMQvoDaQzXE3kj2KP7lpugSbjYeVG2g',
      'x-internal-secret', v_secret),
    body := jsonb_build_object('action', 'issue-route', 'issueId', new.id));
  return new;
end $fn$;
drop trigger if exists trg_route_issue on public.issues;
create trigger trg_route_issue after insert on public.issues
  for each row execute function public.trg_route_issue();

-- The upgrade hint counts work ועד1 did, not calls passed to a standing contractor.
create or replace function public.upgrade_hint(p_building uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_plan text;
  v_counts int[];
begin
  if not public.can_act_for_building(p_building) then return null; end if;
  select service_plan into v_plan from public.buildings where id = p_building;
  select array_agg(coalesce(c.n, 0) order by m.m) into v_counts
  from generate_series(date_trunc('month', now()) - interval '3 months', date_trunc('month', now()) - interval '1 month', interval '1 month') m(m)
  left join lateral (
    select count(*)::int n from public.issues i
     where i.building_id = p_building and i.handler = 'management' and coalesce(i.handler_kind, '') <> 'contractor'
       and coalesce(i.handled_at, i.created_at) >= m.m and coalesce(i.handled_at, i.created_at) < m.m + interval '1 month'
  ) c on true;
  return jsonb_build_object(
    'show', coalesce(v_plan, 'basic') = 'basic' and (select bool_and(x > 3) from unnest(v_counts) x),
    'counts', to_jsonb(v_counts));
end $fn$;

-- The committee closes what it took on (the 7-day reminder's "טופל" button).
create or replace function public.close_issue_by_phone(p_issue uuid, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_iss public.issues%rowtype;
  v_t text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
begin
  select * into v_iss from public.issues where id = p_issue;
  if not found then return 'not_found'; end if;
  if length(v_t) < 9 or not exists (
    select 1 from public.unit_residents r join public.units u on u.id = r.unit_id
     where u.building_id = v_iss.building_id and u.board_member and coalesce(r.archived, false) = false
       and right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 9) = v_t) then return 'forbidden'; end if;
  if v_iss.status in ('completed', 'resolved', 'closed', 'rejected') then return 'already_closed'; end if;
  update public.issues set status = 'completed', resolved_at = coalesce(resolved_at, now()) where id = p_issue;
  return 'ok';
end $$;
revoke all on function public.close_issue_by_phone(uuid, text) from public, anon, authenticated;
