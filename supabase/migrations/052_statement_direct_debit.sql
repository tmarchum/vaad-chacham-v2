-- The treasurer does not pay the statement: ועד1 collects by direct debit (מס"ב).
-- The statement is for review. If the treasurer raises a problem before the
-- debit date, the debit is held until the admin settles it; with no objection
-- the statement becomes "ready for debit" on that date.
-- The system does not transmit the debit itself: it only says which statements
-- may be debited, and records when the admin marks them as debited.

alter table public.billing_settings add column if not exists statement_objection_days integer not null default 7
  check (statement_objection_days between 1 and 30);

-- New wording (placeholder {debit_date}); replace only texts nobody edited.
alter table public.billing_settings alter column statement_intro set
  default E'שלום,\nמצורף החשבון החודשי של ועד1 עבור {building} לחודש {month}.\nסה"כ לחיוב: {total} לפני מע"מ.';
alter table public.billing_settings alter column statement_payment set
  default E'אין צורך לשלם. הסכום ייגבה בהוראת קבע (מס"ב) ב-{debit_date}.\nיש שאלה או טעות בחשבון? לחצו על "לצפייה בחשבון" וכתבו לנו עד אותו תאריך, והחיוב יעוכב עד לבירור.';
update public.billing_settings set statement_intro = default
 where statement_intro = E'שלום,\nמצורף החשבון החודשי של ועד1 עבור {building} לחודש {month}.\nסה"כ לתשלום: {total} לפני מע"מ.';
update public.billing_settings set statement_payment = default
 where statement_payment = 'התשלום בהעברה בנקאית תוך 14 יום. פרטי החשבון יישלחו בנפרד. לשאלות על החשבון אפשר להשיב למייל הזה.';

alter table public.billing_statements add column if not exists debit_on date;                 -- set when sent
alter table public.billing_statements add column if not exists objection_at timestamptz;
alter table public.billing_statements add column if not exists objection_note text;
alter table public.billing_statements add column if not exists objection_resolved_at timestamptz;
alter table public.billing_statements add column if not exists debited_at timestamptz;
alter table public.billing_statements drop constraint if exists billing_statements_status_check;
alter table public.billing_statements add constraint billing_statements_status_check
  check (status in ('draft', 'sent', 'disputed', 'paid'));

-- Public page: the treasurer raises a problem. Holds the debit.
create or replace function public.raise_statement_objection(p_token uuid, p_note text)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare v public.billing_statements%rowtype; v_note text := left(btrim(coalesce(p_note, '')), 1000);
begin
  if length(v_note) < 3 then return json_build_object('ok', false, 'error', 'empty'); end if;
  select * into v from public.billing_statements where token = p_token for update;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if v.status = 'disputed' then return json_build_object('ok', false, 'error', 'already'); end if;
  if v.status <> 'sent' or v.debited_at is not null then return json_build_object('ok', false, 'error', 'closed'); end if;
  update public.billing_statements
     set status = 'disputed', objection_at = now(), objection_note = v_note, objection_resolved_at = null, updated_at = now()
   where id = v.id;
  return json_build_object('ok', true, 'building_id', v.building_id, 'period', v.period, 'total', v.total);
end $fn$;
revoke all on function public.raise_statement_objection(uuid, text) from public;
grant execute on function public.raise_statement_objection(uuid, text) to anon, authenticated, service_role;

-- Admin: the problem was settled, the debit may go out (never before tomorrow).
create or replace function public.resolve_statement_objection(p_statement uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  update public.billing_statements
     set status = 'sent', objection_resolved_at = now(),
         debit_on = greatest(coalesce(debit_on, current_date), current_date + 1), updated_at = now()
   where id = p_statement and status = 'disputed';
end $fn$;
revoke all on function public.resolve_statement_objection(uuid) from public, anon;
grant execute on function public.resolve_statement_objection(uuid) to authenticated;

-- Admin: the debit instruction was sent to the bank.
create or replace function public.mark_statement_debited(p_statement uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  update public.billing_statements set status = 'paid', debited_at = now(), updated_at = now()
   where id = p_statement and status = 'sent' and debit_on is not null and debit_on <= (now() at time zone 'Asia/Jerusalem')::date;
  if not found then raise exception 'not_ready'; end if;
end $fn$;
revoke all on function public.mark_statement_debited(uuid) from public, anon;
grant execute on function public.mark_statement_debited(uuid) to authenticated;

create or replace function public.get_statement(p_token uuid)
returns json language sql security definer set search_path to 'public' stable as $fn$
  select json_build_object(
    'building', b.name, 'period', s.period, 'status', s.status,
    'subscription', s.subscription, 'charges', s.charges, 'awaiting', s.awaiting, 'total', s.total,
    'lines', s.lines, 'sent_at', s.sent_at, 'debit_on', s.debit_on, 'debited_at', s.debited_at,
    'objection_at', s.objection_at, 'objection_note', s.objection_note,
    'footer', (select statement_footer from public.billing_settings where id = 'default'))
  from public.billing_statements s join public.buildings b on b.id = s.building_id
  where s.token = p_token
$fn$;
