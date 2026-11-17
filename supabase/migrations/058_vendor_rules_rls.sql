-- vendor_rules (bank-expense → vendor/category rules) was open to everyone,
-- signed in or not: "using (true)". It is now the building's own data, like
-- every other table: the system admin, or the committee of that building.
drop policy if exists vendor_rules_all on public.vendor_rules;
drop policy if exists vendor_rules_scoped on public.vendor_rules;
create policy vendor_rules_scoped on public.vendor_rules for all to authenticated
  using (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())))
  with check (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())));
revoke all on public.vendor_rules from anon;
select json_build_object('null_building', (select count(*) from public.vendor_rules where building_id is null), 'total', (select count(*) from public.vendor_rules));
