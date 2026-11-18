-- Who handles a building's issues, by default.
--
--   committee  (default) every issue waits for the committee: "ועד1 תטפל" or
--              "הוועד יטפל", issue by issue — what 049/068 built.
--   vaad1      the building wants a management company without one: every new
--              issue goes to ועד1 automatically (the same "ועד1 תטפל" path —
--              handyman, regular contractor, or quotes), and the committee is
--              told, not asked. A vendor quote up to vendor_auto_limit is
--              approved without them; above it, it still waits for them.
--
-- Separate from auto_approve_limit (035), which caps ועד1's own monthly charges.

alter table public.buildings add column if not exists handling_mode text not null default 'committee';
alter table public.buildings drop constraint if exists buildings_handling_mode_check;
alter table public.buildings add constraint buildings_handling_mode_check check (handling_mode in ('committee', 'vaad1'));
alter table public.buildings add column if not exists vendor_auto_limit numeric not null default 0;
-- Only issues opened after the switch are taken automatically: turning it on
-- must not fire off every old undecided issue at once.
alter table public.buildings add column if not exists handling_mode_since timestamptz;

-- Set by the scheduler when it took an issue on its own (vaad1 mode, or an
-- urgent issue nobody answered within the hour). One mark, so it acts once.
alter table public.issues add column if not exists auto_taken_at timestamptz;
alter table public.issues add column if not exists auto_taken_reason text;

create or replace function public.set_building_handling(p_building uuid, p_mode text, p_vendor_limit numeric)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.can_act_for_building(p_building) then raise exception 'forbidden'; end if;
  if p_mode not in ('committee', 'vaad1') then raise exception 'bad_mode'; end if;
  update public.buildings
     set handling_mode_since = case when p_mode = 'vaad1' and handling_mode <> 'vaad1' then now()
                                    when p_mode = 'vaad1' then handling_mode_since else null end,
         handling_mode = p_mode,
         vendor_auto_limit = least(greatest(coalesce(p_vendor_limit, 0), 0), 20000)
   where id = p_building;
end $fn$;
grant execute on function public.set_building_handling(uuid, text, numeric) to authenticated;

-- Upgrade hint: a basic-plan building that handed more than 3 issues a month
-- to ועד1 in each of the last three full months. Returns the three counts,
-- oldest first, and whether to show the hint.
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
     where i.building_id = p_building and i.handler = 'management'
       and coalesce(i.handled_at, i.created_at) >= m.m and coalesce(i.handled_at, i.created_at) < m.m + interval '1 month'
  ) c on true;
  return jsonb_build_object(
    'show', coalesce(v_plan, 'basic') = 'basic' and (select bool_and(x > 3) from unnest(v_counts) x),
    'counts', to_jsonb(v_counts));
end $fn$;
grant execute on function public.upgrade_hint(uuid) to authenticated;
