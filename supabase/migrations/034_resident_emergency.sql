-- Emergency: the one case where a resident reaches the contractor directly.
--
-- Every other issue waits for the committee to hand it on (030). That is right
-- for a dripping tap and wrong for someone shut inside a lift at 2am, where the
-- committee's inbox is the slowest part of the chain. The system cannot tell
-- the two apart from the text — guessing by keyword would either miss the real
-- one or scramble Kone over a scuffed door — so the person who knows says so,
-- with a button that says plainly what it is for.
--
-- It is deliberately narrow:
--   * only in a category that already has a standing contractor for this
--     building (issue_routing_rules.send_to_vendor), so it can only ever reach
--     a vendor the committee itself appointed;
--   * only on the reporter's own issue;
--   * costs no punches (a contractor call never does);
--   * leaves a mark — is_emergency + emergency_by — because an action that
--     skips the committee has to be answerable to it afterwards.

alter table public.issues add column if not exists is_emergency boolean not null default false;
alter table public.issues add column if not exists emergency_at timestamptz;
alter table public.issues add column if not exists emergency_by uuid;

-- Which categories offer the button, for this building. Residents cannot read
-- issue_routing_rules (committee-only), so the portal asks through this.
create or replace function public.emergency_categories_of(p_building uuid)
returns setof text language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not (
    public.is_admin()
    or p_building in (select public.my_building_ids())
    or exists (
      select 1 from public.units u
      where u.building_id = p_building and u.id in (select public.my_unit_ids())
    )
  ) then
    return;             -- not your building: an empty list, not an error
  end if;

  return query
    select r.category from public.issue_routing_rules r
    where r.building_id = p_building
      and r.active
      and coalesce(r.send_to_vendor, false)
      and coalesce(r.vendor_name, '') <> '';
end $fn$;

grant execute on function public.emergency_categories_of(uuid) to authenticated;

-- Dispatch an already-reported issue to the category's standing contractor,
-- now. Returns the vendor's name so the caller can say who is on the way.
create or replace function public.report_emergency(p_issue uuid)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_issue public.issues%rowtype;
  v_vendor text;
  v_allowed boolean;
begin
  select * into v_issue from public.issues where id = p_issue;
  if v_issue.id is null then raise exception 'not_found'; end if;

  -- The reporter, someone living in that flat, or the committee/admin.
  -- Every branch is guarded against NULL and the whole thing is coalesced:
  -- an unattributed issue (reported_by null) makes `= auth.uid()` NULL, and
  -- `not (false or NULL)` is NULL, which skips the raise and lets a stranger
  -- scramble the contractor. Default to refusing.
  v_allowed :=
    public.is_admin()
    or (v_issue.reported_by is not null and v_issue.reported_by = auth.uid())
    or (v_issue.unit_id is not null and v_issue.unit_id in (select public.my_unit_ids()))
    or (v_issue.building_id is not null and v_issue.building_id in (select public.my_building_ids()));
  if not coalesce(v_allowed, false) then
    raise exception 'forbidden';
  end if;

  select r.vendor_name into v_vendor
  from public.issue_routing_rules r
  where r.building_id = v_issue.building_id
    and r.category = v_issue.category
    and r.active
    and coalesce(r.send_to_vendor, false)
    and coalesce(r.vendor_name, '') <> ''
  limit 1;

  -- No standing contractor for this category: the committee is the only route,
  -- and the caller must say so rather than imply someone was sent.
  if v_vendor is null then raise exception 'no_contractor'; end if;

  update public.issues
     set priority     = 'urgent',
         is_emergency = true,
         emergency_at = now(),
         emergency_by = auth.uid(),
         handler      = 'management',
         handler_kind = 'contractor',   -- costs no punches
         stage        = 'sent_to_vendor',
         vendor_name  = v_vendor,
         status       = 'acknowledged',
         handled_at   = now()
   where id = p_issue;

  return v_vendor;
end $fn$;

grant execute on function public.report_emergency(uuid) to authenticated;
