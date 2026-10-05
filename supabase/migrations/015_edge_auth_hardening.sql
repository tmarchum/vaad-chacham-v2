-- 015 — Edge/auth hardening (applied to the live DB on 2026-10-05 via the
-- management API; this file is the reproducible record, unlike 008 which only
-- documented intent).
--
-- 1. analyze-issue trigger now authenticates with an internal secret read from
--    messaging_secrets (provider 'edge-internal'); the Edge Function fails
--    closed without it. The anon Bearer below exists only to pass the
--    platform's verify_jwt gateway — it grants nothing.
-- 2. notification_log: committee may READ the audit trail, never edit/delete
--    it (was FOR ALL). Writes come from Edge Functions via service role.
-- 3. messaging_secrets: service-role only — drop all client policies. The UI
--    reads has_token from messaging_integrations and saves tokens through the
--    green-whatsapp Edge Function.
-- 4. buildings_update: canonical form (admin, or committee of that building).
--    Already live (the migrations file 001 still showed the old resident-
--    writable version); recorded here so the repo matches production.
-- NOTE: the 'edge-internal' secret VALUE is inserted operationally (dashboard /
-- management API), never committed to the repo.

create or replace function public.trg_analyze_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_secret text;
begin
  select api_token into v_secret from public.messaging_secrets where provider = 'edge-internal';
  if v_secret is null then
    return NEW; -- no internal secret configured -> skip AI analysis
  end if;
  perform net.http_post(
    url := 'https://stncskqjrmecjckxldvi.supabase.co/functions/v1/analyze-issue',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0bmNza3Fqcm1lY2pja3hsZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDExNzcsImV4cCI6MjA5MDExNzE3N30.7HOgnQskv6RblMQvoDaQzXE3kj2KP7lpugSbjYeVG2g',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object('issueId', NEW.id)
  );
  return NEW;
end $fn$;

drop policy if exists nl_committee on public.notification_log;
drop policy if exists nl_committee_sel on public.notification_log;
create policy nl_committee_sel on public.notification_log for select to authenticated
  using (public.is_admin() or (public.is_committee() and building_id in (select public.my_building_ids())));

drop policy if exists ms_admin_sel on public.messaging_secrets;
drop policy if exists ms_admin_ins on public.messaging_secrets;
drop policy if exists ms_admin_upd on public.messaging_secrets;

drop policy if exists "buildings_update" on public.buildings;
create policy "buildings_update" on public.buildings for update
  using (public.is_admin() or (public.is_committee() and id in (select public.my_building_ids())))
  with check (public.is_admin() or (public.is_committee() and id in (select public.my_building_ids())));
