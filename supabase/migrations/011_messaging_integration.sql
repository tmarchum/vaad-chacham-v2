-- 011_messaging_integration.sql
-- WhatsApp (GreenAPI) integration config + secret. Mirrors the bank pattern:
-- the API token is write-only from the client (service-role-only read), so it
-- never reaches the browser. The green-whatsapp Edge Function reads it.

create table if not exists public.messaging_integrations (
  provider text primary key default 'greenapi',
  id_instance text,
  api_url text,
  sender_number text,
  sender_label text,
  enabled boolean default false,
  status text,
  last_checked_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.messaging_secrets (
  provider text primary key,
  api_token text,
  updated_at timestamptz default now()
);

alter table public.messaging_integrations enable row level security;
alter table public.messaging_secrets enable row level security;

-- Config: admin full access.
drop policy if exists mi_admin_all on public.messaging_integrations;
create policy mi_admin_all on public.messaging_integrations
  for all using (public.is_admin()) with check (public.is_admin());

-- Secret: admin can write, NOBODY can SELECT (service role bypasses RLS).
drop policy if exists ms_admin_ins on public.messaging_secrets;
create policy ms_admin_ins on public.messaging_secrets
  for insert with check (public.is_admin());
drop policy if exists ms_admin_upd on public.messaging_secrets;
create policy ms_admin_upd on public.messaging_secrets
  for update using (public.is_admin()) with check (public.is_admin());
