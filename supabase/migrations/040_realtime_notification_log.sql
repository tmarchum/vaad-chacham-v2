-- Live vendor conversations: stream notification_log changes (RLS still applies
-- to what each subscriber receives).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notification_log') then
    alter publication supabase_realtime add table public.notification_log;
  end if;
end $$;
create index if not exists notification_log_vendor_idx on public.notification_log (vendor_id, created_at) where vendor_id is not null;
