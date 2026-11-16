-- Committee decides on an open issue from WhatsApp, in one tap:
--   vaad1  → ועד1's handyman at the next visit (hours off the punch card / bill)
--   vendor → ועד1 coordinates a vendor (fixed handling fee, disclosed)
--   self   → the committee handles it itself
-- The decision is still the committee's: the function only accepts a phone that
-- belongs to a committee member of that building (or to the system admin).

create or replace function public.decide_issue_by_phone(p_issue uuid, p_phone text, p_action text)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_iss public.issues%rowtype;
  v_t text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_ok boolean;
  v_policy text;
  v_balance integer;
  v_fee numeric;
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

  -- vendor: ועד1 coordinates; the fee is committee-initiated, so it is approved by this tap.
  update public.issues set handler = 'management', handler_kind = 'vendor', stage = 'awaiting_assignment',
         status = 'acknowledged', handled_at = now() where id = p_issue;
  select coalesce(p.handle_fee, 0) into v_fee
    from public.buildings b join public.service_plans p on p.key = b.service_plan where b.id = v_iss.building_id;
  if coalesce(v_fee, 0) > 0 then
    perform public._insert_charge(v_iss.building_id, 'handle_fee', v_fee, 'handle_fee', 1, v_fee,
      p_issue, null, format('ועד1 מטפלת בספק · %s (אושר בוואטסאפ)', coalesce(v_iss.title, '')), null, true);
  end if;
  return 'ok';
end $fn$;
revoke all on function public.decide_issue_by_phone(uuid, text, text) from public, anon, authenticated;

insert into public.message_templates (key, title, category, language, audience, body, variables, active, meta_status)
select 'committee_issue_decision', 'תקלה ממתינה להחלטת הוועד (כפתורים)', 'UTILITY', 'he', 'resident',
  E'שלום,\nתקלה ב{{1}} ממתינה להחלטת הוועד:\n*{{2}}*\nפתוחה {{3}} ימים.\nועד1 תטפל: איש האחזקה שלנו בביקור הבא, לפי שעות. ספק דרך ועד1: אנחנו מתאמים ספק, בדמי טיפול קבועים. הוועד יטפל: נשאר אצלכם.',
  '["בניין","התקלה","ימים פתוחה"]'::jsonb, true, 'PENDING'
where not exists (select 1 from public.message_templates where key = 'committee_issue_decision');

-- Setup fee for the ליווי plan: ₪990, or free with a one-year commitment.
update public.service_price_items
   set price_assisted = 990,
       notes = 'בליווי — ₪990 חד-פעמי, או ללא תשלום בהתחייבות לשנה. בכניסה — הקמה עצמית ללא תשלום'
 where key = 'onboarding';
