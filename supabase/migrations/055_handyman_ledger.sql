-- What ועד1 owes its own handyman: hours worked and parts he paid for, minus
-- what was already paid to him. Internal to ועד1 — the building sees only its
-- own charges (hours at the plan price, parts with handling).

-- The hourly cost is ועד1's own business: it lives in billing_settings (admin only),
-- not in service_settings, which every signed-in user can read.
alter table public.billing_settings
  add column if not exists handyman_hour_cost numeric(10,2) not null default 0;

create table if not exists public.handyman_ledger (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('hours', 'parts', 'payment', 'adjustment')),
  building_id uuid references public.buildings(id) on delete set null,
  issue_id    uuid references public.issues(id) on delete set null,
  visit_id    uuid,
  hours       numeric(6,2),
  amount      numeric(12,2) not null,      -- owed to the handyman; a payment is negative
  note        text,
  receipt_url text,
  created_at  timestamptz not null default now(),
  created_by  uuid
);
create index if not exists handyman_ledger_created_idx on public.handyman_ledger (created_at desc);
alter table public.handyman_ledger enable row level security;
drop policy if exists handyman_ledger_admin on public.handyman_ledger;
create policy handyman_ledger_admin on public.handyman_ledger for all
  using (public.is_admin()) with check (public.is_admin());

-- Called when a handyman visit is closed. Hours are paid at the cost set in
-- "מסלולים ותמחור"; parts he bought are returned at the receipt price.
-- p_parts: [{ "label": "...", "amount": 100, "receipt": "https://..." }]
create or replace function public.log_handyman_work(
  p_building uuid, p_issue uuid, p_visit uuid, p_hours numeric, p_note text, p_parts jsonb)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_rate numeric; v_p jsonb;
begin
  if not (coalesce(public.is_admin(), false)
          or (coalesce(public.is_committee(), false) and p_building in (select public.my_building_ids()))) then
    raise exception 'forbidden';
  end if;
  select coalesce(handyman_hour_cost, 0) into v_rate from public.billing_settings where id = 'default';
  if coalesce(p_hours, 0) > 0 then
    insert into public.handyman_ledger (kind, building_id, issue_id, visit_id, hours, amount, note, created_by)
    values ('hours', p_building, p_issue, p_visit, p_hours, round(p_hours * coalesce(v_rate, 0), 2), nullif(btrim(p_note), ''), auth.uid());
  end if;
  for v_p in select * from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) loop
    if coalesce((v_p->>'amount')::numeric, 0) > 0 then
      insert into public.handyman_ledger (kind, building_id, issue_id, visit_id, amount, note, receipt_url, created_by)
      values ('parts', p_building, p_issue, p_visit, round((v_p->>'amount')::numeric, 2),
              nullif(btrim(v_p->>'label'), ''), nullif(btrim(v_p->>'receipt'), ''), auth.uid());
    end if;
  end loop;
end $fn$;
revoke all on function public.log_handyman_work(uuid, uuid, uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.log_handyman_work(uuid, uuid, uuid, numeric, text, jsonb) to authenticated;

-- The statement footer no longer speaks about vendor commissions.
alter table public.billing_settings
  alter column statement_footer set default 'החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות.';
update public.billing_settings
   set statement_footer = 'החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות.'
 where statement_footer like '%עמלה%';
