-- Crashes and failed loads seen in users' browsers. Until now a screen that
-- broke left no trace anywhere, so "sometimes I get an error screen" could not
-- be traced to a screen or a cause. Signed-in users write; only admin reads.
create table if not exists public.client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  kind text,
  path text,
  message text,
  stack text,
  build text,
  user_agent text,
  constraint client_errors_size check (
    length(coalesce(message, '')) <= 2000 and length(coalesce(stack, '')) <= 8000
    and length(coalesce(path, '')) <= 500 and length(coalesce(user_agent, '')) <= 500
  )
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists client_errors_admin on public.client_errors;
create policy client_errors_admin on public.client_errors
  for select to authenticated using ((select public.is_admin()));

-- Keep 90 days.
create or replace function public.prune_client_errors() returns void
language sql security definer set search_path = public as $$
  delete from public.client_errors where created_at < now() - interval '90 days';
$$;

select cron.unschedule('prune-client-errors') where exists (select 1 from cron.job where jobname = 'prune-client-errors');
select cron.schedule('prune-client-errors', '30 0 * * *', 'select public.prune_client_errors()');
