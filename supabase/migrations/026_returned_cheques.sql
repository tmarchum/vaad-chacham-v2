-- A bounced cheque appears in the feed as TWO rows: the original debit, and a
-- credit a day or two later labelled "החזרת שיק מסיבות טכניות". The pair nets
-- to zero — no money moved and no resident paid anything — but the credit was
-- sitting in "unmatched income", which is why 35,280 ₪ of the 58,725 ₪
-- "unattributed" pile was never resident money at all.
--
-- Cheque 1937417 was worse than noise. It was drawn 31/03, returned 01/04, and
-- re-presented successfully 07/04 — and it is the 07/04 row, the one that
-- actually paid, that someone had marked "לא רלוונטי". So the books showed a
-- phantom 16,460 ₪ of income and were missing a real 16,460 ₪ of expense, in
-- the same cheque.
--
-- 'excluded' is the right status: Balance and BankIncome already drop it from
-- both the income and the expense side, which is exactly what a cancelled pair
-- deserves.

-- ── 1. The real payment. Re-presented and cleared; it belongs in the books. ──
update public.bank_transactions set match_status = 'unmatched', updated_at = now()
where id = '46e55ae4-4f6a-416d-af10-9e80c1deadc1';

-- ── 2. The three cancelled pairs: original debit + its reversal credit. ──────
update public.bank_transactions set match_status = 'excluded', unit_id = null, updated_at = now()
where id in (
  '70c1c88a-1684-430e-bcca-2ec464bd3bb4', 'fbbd9144-eb75-4293-b619-12af944826b3', -- 1937413, 16,460
  '0447fb56-5a2a-441d-959c-a8cd8e8978f0', '93440b7e-1bc7-4b3b-95ae-bd257dfe674f', -- 1937415,  2,360
  '610c92c5-1efe-410a-8830-c5e8b2b6656e', 'f10b3aa0-eac1-4ccc-944e-a1d47e742f34'  -- 1937417, 16,460
);

-- ── 3. Keep it from coming back on the next monthly import. ─────────────────
-- Runs for every insert path (Drive import, manual entry, anything later), not
-- just the importer we happen to know about today.
create or replace function public.tg_exclude_returned_cheque()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref text;
begin
  if coalesce(new.credit, 0) <= 0 or new.description !~ 'החזרת שיק' then
    return new;
  end if;

  -- The cheque number is the leading digits of the description, and it is what
  -- ties the reversal back to the debit it cancels.
  ref := substring(new.description from '^[0-9]+');
  if ref is null then
    return new;
  end if;

  -- The reversal itself is not income.
  new.match_status := 'excluded';
  new.unit_id := null;

  -- And neutralise the debit it reverses: same cheque, same amount, shortly
  -- before, not already excluded. LIMIT 1 so a cheque that was re-presented
  -- keeps the later, successful debit on the books.
  update public.bank_transactions t set match_status = 'excluded', updated_at = now()
  where t.id = (
    select d.id from public.bank_transactions d
    where d.building_id = new.building_id
      and d.debit = new.credit
      and d.description like ref || '%'
      and d.match_status <> 'excluded'
      and d.transaction_date <= new.transaction_date
      and d.transaction_date >= new.transaction_date - interval '21 days'
    order by d.transaction_date desc
    limit 1
  );

  return new;
end $$;

drop trigger if exists trg_exclude_returned_cheque on public.bank_transactions;
create trigger trg_exclude_returned_cheque
  before insert on public.bank_transactions
  for each row execute function public.tg_exclude_returned_cheque();
