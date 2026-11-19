-- Quote round: one reminder to a vendor who said "interested" and sent no
-- amount, and inviting a vendor who asked to see the place first when no
-- quote came in.
alter table public.quotes add column if not exists interested_at timestamptz;
alter table public.quotes add column if not exists amount_reminded_at timestamptz;
alter table public.quotes add column if not exists visit_invited_at timestamptz;

-- Vendors already waiting count from their last update.
update public.quotes set interested_at = updated_at
 where stage = 'awaiting_amount' and interested_at is null;
