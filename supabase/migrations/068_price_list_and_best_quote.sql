-- 068: the agreed price list, and "the committee gets one quote".
--
-- Price list (2026-11-18):
--  * No "ועד1 תטפל בספק" fee: ועד1 does not take over a vendor job for a fee.
--  * No monthly included handyman hour: a building buys an hour or a card.
--  * Setup: self-setup free on both plans; by ועד1 ₪490 (basic) / ₪990 (assisted),
--    free with a one-year commitment.
--  * Extras are not published; on assisted they are free for now.
--    No-debt certificate and the "with attendance" assemblies are withdrawn.
--  * Automatic quote requests are a plan feature (assisted only for now).
--
-- Quotes: vendors are asked for a price that holds availability (today when
-- urgent, within 7 days otherwise). When the replies are in, ONE quote - the
-- cheapest - is marked recommended and that is what the committee sees.
-- ועד1 (admin) sees all of them.

update public.service_plans set handle_fee = 0, included_punches = 0 where key in ('basic', 'assisted');

alter table public.service_plans add column if not exists includes_auto_quotes boolean not null default false;
update public.service_plans set includes_auto_quotes = (key = 'assisted');

update public.service_price_items set price_basic = 490, price_assisted = 990 where key = 'onboarding';
update public.service_price_items set active = false
 where key in ('no_debt_certificate', 'assembly_annual_attend', 'assembly_extra_attend');
update public.service_price_items set price_assisted = 0
 where key in ('assembly_annual', 'assembly_extra', 'warranty_tracking');

create or replace function public.public_price_list()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plans', (select json_object_agg(p.key, json_build_object(
                'unit', p.price_per_unit, 'min', p.min_per_building, 'hour', p.hour_price,
                'card', p.card_price, 'card_hours', p.card_punches, 'card_bonus', p.card_bonus_punches,
                'setup', case p.key when 'basic' then i.price_basic else i.price_assisted end,
                'auto_quotes', p.includes_auto_quotes))
              from public.service_plans p
              left join public.service_price_items i on i.key = 'onboarding' and i.active
             where p.active),
    -- kept for pages that still read the single number
    'setup', (select price_assisted from public.service_price_items where key = 'onboarding' and active))
$$;
grant execute on function public.public_price_list() to anon, authenticated;

-- ── Quotes: availability window and the one the committee sees ─────────────
alter table public.quotes add column if not exists recommended boolean not null default false;
alter table public.quotes add column if not exists available_by timestamptz;
alter table public.quotes add column if not exists committee_choice text
  check (committee_choice in ('take', 'coordinate', 'reject'));
alter table public.quotes add column if not exists committee_choice_at timestamptz;

-- A committee sees quotes it recorded itself (no WhatsApp stage), and from the
-- WhatsApp flow only the recommended or the chosen one.
drop policy if exists quotes_committee on public.quotes;
drop policy if exists quotes_admin on public.quotes;
drop policy if exists quotes_committee_read on public.quotes;
drop policy if exists quotes_committee_insert on public.quotes;
drop policy if exists quotes_committee_update on public.quotes;
drop policy if exists quotes_committee_delete on public.quotes;
create policy quotes_admin on public.quotes for all using (public.is_admin()) with check (public.is_admin());
create policy quotes_committee_read on public.quotes for select using (
  public.is_committee() and building_id in (select public.my_building_ids())
  and (stage is null or recommended or stage = 'won'));
create policy quotes_committee_insert on public.quotes for insert with check (
  public.is_committee() and building_id in (select public.my_building_ids()));
create policy quotes_committee_update on public.quotes for update using (
  public.is_committee() and building_id in (select public.my_building_ids())
  and (stage is null or recommended or stage = 'won'))
  with check (public.is_committee() and building_id in (select public.my_building_ids()));
create policy quotes_committee_delete on public.quotes for delete using (
  public.is_committee() and building_id in (select public.my_building_ids()) and stage is null);

-- ── Committee WhatsApp decision: "vendor" = quotes from vendors, no fee ────
create or replace function public.decide_issue_by_phone(p_issue uuid, p_phone text, p_action text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_iss public.issues%rowtype;
  v_t text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_ok boolean;
  v_policy text;
  v_balance integer;
  v_auto boolean;
begin
  if p_action not in ('vaad1', 'vendor', 'self') then return 'bad_action'; end if;
  select * into v_iss from public.issues where id = p_issue;
  if not found then return 'not_found'; end if;
  if length(v_t) < 9 then return 'forbidden'; end if;

  select exists (
    select 1 from public.unit_residents r join public.units u on u.id = r.unit_id
     where u.building_id = v_iss.building_id and u.board_member and coalesce(r.archived, false) = false
       and right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 9) = v_t
    union all
    select 1 from public.profiles p
     where right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_t
       and (p.role = 'admin' or (p.role = 'committee' and (p.building_id = v_iss.building_id or exists (
             select 1 from public.building_memberships m where m.user_id = p.id and m.building_id = v_iss.building_id))))
  ) into v_ok;
  if not v_ok then return 'forbidden'; end if;

  if v_iss.handler is not null or v_iss.status in ('completed', 'resolved', 'closed', 'rejected') then
    return 'already_decided';
  end if;

  if p_action = 'self' then
    update public.issues set handler = 'committee', stage = null, status = 'in_progress', handled_at = now() where id = p_issue;
    return 'ok';
  end if;

  if p_action = 'vaad1' then
    select card_exhausted_policy into v_policy from public.buildings where id = v_iss.building_id;
    if v_policy = 'block' then
      select balance into v_balance from public.punch_balance_of(v_iss.building_id);
      if coalesce(v_balance, 0) < 1 then return 'no_punches'; end if;
    end if;
    update public.issues set handler = 'management', handler_kind = 'handyman', stage = 'queued_for_visit',
           status = 'acknowledged', handled_at = now() where id = p_issue;
    return 'ok';
  end if;

  -- vendor: ועד1 asks vendors for prices; the committee gets the best one. No fee.
  select coalesce(p.includes_auto_quotes, false) into v_auto
    from public.buildings b join public.service_plans p on p.key = b.service_plan where b.id = v_iss.building_id;
  if not coalesce(v_auto, false) then return 'not_in_plan'; end if;
  update public.issues set handler = 'committee', handler_kind = 'vendor', stage = 'awaiting_quote_approval',
         status = 'acknowledged', handled_at = now() where id = p_issue;
  return 'ok';
end $$;
