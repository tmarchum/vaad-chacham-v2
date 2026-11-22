-- ועד1 coordinates the chosen vendor ("תאמו ולוו אותנו"): when no date was set,
-- ועד1 is reminded once a day. This is when the last reminder went out.
alter table public.issues add column if not exists coordination_reminded_at timestamptz;
