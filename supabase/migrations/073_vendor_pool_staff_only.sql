-- The vendor pool is ועד1's, not the committee's.
--
-- Until now a committee could read AND edit every vendor in the pool (162 rows,
-- names and phones). A committee handling an issue itself does so without our
-- vendors; work with a vendor goes through "ועד1 תטפל". So a committee reads
-- only the vendors already tied to its own building:
--   * the vendor on one of its issues (assigned, or the standing contractor copied on);
--   * a vendor whose quote reached it (recommended / won) or that it entered itself;
--   * its standing contractor in the routing rules.
-- Writing to the pool is ועד1's only. Edge Functions use the service role.

drop policy if exists vendors_committee on public.vendors;
drop policy if exists vendors_admin on public.vendors;
drop policy if exists vendors_committee_read on public.vendors;

create policy vendors_admin on public.vendors
  for all using (public.is_admin()) with check (public.is_admin());

create policy vendors_committee_read on public.vendors
  for select using (
    public.is_committee() and (
      exists (select 1 from public.issues i
               where i.building_id in (select public.my_building_ids())
                 and (i.vendor_id = vendors.id or i.vendor_name = vendors.name))
      or exists (select 1 from public.quotes q
                  where q.vendor_id = vendors.id and q.building_id in (select public.my_building_ids())
                    and (q.stage is null or q.recommended or q.stage = 'won'))
      or exists (select 1 from public.issue_routing_rules r
                  where r.vendor_name = vendors.name and r.building_id in (select public.my_building_ids()))
    ));
