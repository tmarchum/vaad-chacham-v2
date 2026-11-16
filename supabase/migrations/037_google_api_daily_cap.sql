-- Hard daily cap on paid Google Places calls (billing protection, independent of
-- Google Cloud quotas). vendor-sourcing calls bump_google_api_usage() before each
-- request and stops when it returns false.
create table if not exists public.google_api_usage (
  day   date primary key default (now() at time zone 'Asia/Jerusalem')::date,
  calls integer not null default 0
);
alter table public.google_api_usage enable row level security;

create or replace function public.bump_google_api_usage(p_cap integer default 100)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; n integer;
begin
  insert into google_api_usage(day, calls) values (d, 1)
  on conflict (day) do update set calls = google_api_usage.calls + 1
  where google_api_usage.calls < p_cap
  returning calls into n;
  return n is not null;
end $$;
revoke all on function public.bump_google_api_usage(integer) from public, anon, authenticated;
