-- 014_toggle_audit.sql
-- Post-incident (2026-07-02 collection-email blast): buildings had no
-- updated_at trigger and no change log, so "was the kill switch on at the
-- time?" was unanswerable. This adds both.

-- Keep buildings.updated_at honest on every update.
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists buildings_updated_at on public.buildings;
create trigger buildings_updated_at
  before update on public.buildings
  for each row execute function public.tg_set_updated_at();

-- Audit trail for sensitive settings (currently: the collection kill switch).
create table if not exists public.settings_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid,          -- auth.uid() of the actor (null for service role)
  changed_at timestamptz default now()
);

alter table public.settings_audit enable row level security;
drop policy if exists sa_admin_sel on public.settings_audit;
create policy sa_admin_sel on public.settings_audit
  for select using (public.is_admin());
-- No insert/update/delete policies: only triggers (definer) write here.

create or replace function public.tg_audit_collection_toggle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.collection_notifications_enabled is distinct from old.collection_notifications_enabled then
    insert into public.settings_audit(table_name, row_id, field, old_value, new_value, changed_by)
    values ('buildings', new.id, 'collection_notifications_enabled',
            old.collection_notifications_enabled::text,
            new.collection_notifications_enabled::text,
            auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists buildings_audit_toggle on public.buildings;
create trigger buildings_audit_toggle
  before update on public.buildings
  for each row execute function public.tg_audit_collection_toggle();
