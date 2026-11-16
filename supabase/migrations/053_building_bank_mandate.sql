-- Per building: the bank account ועד1 debits, and the state of its direct-debit
-- authorization (הרשאה לחיוב חשבון, מס"ב). A statement is "ready for debit"
-- only when the building's authorization is active — or when the building was
-- marked as one that pays another way.
-- Visible to the system admin and to that building's committee only.

create table if not exists public.building_bank_mandates (
  building_id     uuid primary key references public.buildings(id) on delete cascade,
  account_holder  text,                       -- שם בעל החשבון, as printed at the bank
  bank_code       text check (bank_code is null or bank_code ~ '^\d{1,3}$'),
  branch_code     text check (branch_code is null or branch_code ~ '^\d{1,4}$'),
  account_number  text check (account_number is null or account_number ~ '^\d{2,13}$'),
  status          text not null default 'missing'
                  check (status in ('missing', 'sent', 'signed', 'active', 'cancelled', 'not_required')),
  signer          text,                       -- who signed: surname + apartment
  signed_on       date,
  bank_approved_on date,
  debit_limit     numeric(12,2),              -- ceiling per debit, if the authorization has one
  reference       text,                       -- authorization / customer number at the bank
  document_path   text,                       -- signed form, private bucket building-documents
  notes           text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
alter table public.building_bank_mandates enable row level security;
drop policy if exists bank_mandates_read on public.building_bank_mandates;
create policy bank_mandates_read on public.building_bank_mandates for select
  using (is_admin() or (is_committee() and building_id in (select my_building_ids())));
-- Writes only through the functions below.

-- Committee or admin: account details, signer and the signed form.
-- Changing the account after approval sends the authorization back to "signed".
create or replace function public.save_building_bank(
  p_building uuid, p_holder text, p_bank text, p_branch text, p_account text,
  p_signer text, p_signed_on date, p_document text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_old public.building_bank_mandates%rowtype;
  v_bank text := nullif(regexp_replace(coalesce(p_bank, ''), '\D', '', 'g'), '');
  v_branch text := nullif(regexp_replace(coalesce(p_branch, ''), '\D', '', 'g'), '');
  v_acc text := nullif(regexp_replace(coalesce(p_account, ''), '\D', '', 'g'), '');
  v_changed boolean;
begin
  if not (coalesce(public.is_admin(), false)
          or (coalesce(public.is_committee(), false) and p_building in (select public.my_building_ids()))) then
    raise exception 'forbidden';
  end if;
  select * into v_old from public.building_bank_mandates where building_id = p_building;
  v_changed := found and v_old.account_number is not null
               and (v_old.bank_code, v_old.branch_code, v_old.account_number) is distinct from (v_bank, v_branch, v_acc);
  insert into public.building_bank_mandates as m
    (building_id, account_holder, bank_code, branch_code, account_number, signer, signed_on, document_path, updated_by)
  values (p_building, nullif(btrim(p_holder), ''), v_bank, v_branch, v_acc, nullif(btrim(p_signer), ''), p_signed_on,
          nullif(btrim(p_document), ''), auth.uid())
  on conflict (building_id) do update set
    account_holder = excluded.account_holder, bank_code = excluded.bank_code, branch_code = excluded.branch_code,
    account_number = excluded.account_number, signer = excluded.signer, signed_on = excluded.signed_on,
    document_path = coalesce(excluded.document_path, m.document_path),
    status = case when v_changed and m.status = 'active' then 'signed' else m.status end,
    bank_approved_on = case when v_changed then null else m.bank_approved_on end,
    updated_at = now(), updated_by = auth.uid();
end $fn$;
revoke all on function public.save_building_bank(uuid, text, text, text, text, text, date, text) from public, anon;
grant execute on function public.save_building_bank(uuid, text, text, text, text, text, date, text) to authenticated;

-- System admin only: where the authorization stands.
create or replace function public.set_bank_mandate_status(
  p_building uuid, p_status text, p_reference text, p_limit numeric, p_notes text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  if p_status = 'active' and not exists (select 1 from public.building_bank_mandates
       where building_id = p_building and bank_code is not null and branch_code is not null and account_number is not null) then
    raise exception 'no_account';
  end if;
  insert into public.building_bank_mandates as m (building_id, status, reference, debit_limit, notes, bank_approved_on, updated_by)
  values (p_building, p_status, nullif(btrim(p_reference), ''), p_limit, nullif(btrim(p_notes), ''),
          case when p_status = 'active' then current_date end, auth.uid())
  on conflict (building_id) do update set
    status = excluded.status, reference = excluded.reference, debit_limit = excluded.debit_limit, notes = excluded.notes,
    bank_approved_on = case when excluded.status = 'active' then coalesce(m.bank_approved_on, current_date) else m.bank_approved_on end,
    updated_at = now(), updated_by = auth.uid();
end $fn$;
revoke all on function public.set_bank_mandate_status(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.set_bank_mandate_status(uuid, text, text, numeric, text) to authenticated;

-- A statement may be marked as debited only with an active authorization
-- (or for a building that pays another way).
create or replace function public.mark_statement_debited(p_statement uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v public.billing_statements%rowtype; v_status text;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'forbidden'; end if;
  select * into v from public.billing_statements where id = p_statement;
  if not found or v.status <> 'sent' or v.debit_on is null or v.debit_on > (now() at time zone 'Asia/Jerusalem')::date then
    raise exception 'not_ready';
  end if;
  select status into v_status from public.building_bank_mandates where building_id = v.building_id;
  if coalesce(v_status, 'missing') not in ('active', 'not_required') then raise exception 'no_mandate'; end if;
  update public.billing_statements set status = 'paid', debited_at = now(), updated_at = now() where id = p_statement;
end $fn$;

-- Private bucket for the signed forms: <building_id>/<file>.
insert into storage.buckets (id, name, public) values ('building-documents', 'building-documents', false)
on conflict (id) do update set public = false;
drop policy if exists building_documents_read on storage.objects;
create policy building_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'building-documents' and (public.is_admin() or (public.is_committee()
         and (storage.foldername(name))[1] in (select b::text from public.my_building_ids() b))));
drop policy if exists building_documents_write on storage.objects;
create policy building_documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'building-documents' and (public.is_admin() or (public.is_committee()
         and (storage.foldername(name))[1] in (select b::text from public.my_building_ids() b))));
