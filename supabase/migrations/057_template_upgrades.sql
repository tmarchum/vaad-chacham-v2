-- Every WhatsApp template opens with "כאן ועד1": the sender name on the number
-- is shared with another business, so the message itself carries the identity.
--
-- Meta reviews a changed template from scratch, and a name exists only once.
-- So the new wording is submitted under a new name (vaad1_<key>) while the
-- approved one keeps working. message_template_upgrades holds the version in
-- review; when Meta approves it, it replaces the live one (same key, same
-- variables — nothing that sends has to change).

-- meta_name was generated from the key; it now has to be able to change.
alter table public.message_templates alter column meta_name drop expression;
create or replace function public.message_templates_default_name()
returns trigger language plpgsql as $fn$
begin
  if new.meta_name is null or new.meta_name = '' then new.meta_name := 'vaadly_' || new.key; end if;
  return new;
end $fn$;
drop trigger if exists trg_message_templates_default_name on public.message_templates;
create trigger trg_message_templates_default_name before insert on public.message_templates
  for each row execute function public.message_templates_default_name();

create table if not exists public.message_template_upgrades (
  key              text primary key references public.message_templates(key) on delete cascade,
  meta_name        text not null unique,
  body             text not null,
  meta_id          text,
  meta_status      text not null default 'PENDING',
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.message_template_upgrades enable row level security;
drop policy if exists mtu_admin on public.message_template_upgrades;
create policy mtu_admin on public.message_template_upgrades for all
  using (public.is_admin()) with check (public.is_admin());

-- Called with what Meta reports about a template name. Returns true when the
-- name belonged to a version in review.
create or replace function public.apply_template_upgrade(p_name text, p_status text, p_meta_id text, p_reason text)
returns boolean language plpgsql security definer set search_path to 'public' as $fn$
declare u public.message_template_upgrades%rowtype;
begin
  select * into u from public.message_template_upgrades where meta_name = p_name;
  if not found then return false; end if;
  if upper(coalesce(p_status, '')) = 'APPROVED' then
    update public.message_templates
       set meta_name = u.meta_name, body = u.body, meta_id = coalesce(nullif(p_meta_id, ''), u.meta_id),
           meta_status = 'APPROVED', rejection_reason = null, updated_at = now()
     where key = u.key;
    delete from public.message_template_upgrades where key = u.key;
  else
    update public.message_template_upgrades
       set meta_status = upper(coalesce(nullif(p_status, ''), 'PENDING')),
           meta_id = coalesce(nullif(p_meta_id, ''), meta_id),
           rejection_reason = nullif(nullif(p_reason, ''), 'NONE'), updated_at = now()
     where key = u.key;
  end if;
  return true;
end $fn$;
revoke all on function public.apply_template_upgrade(text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_template_upgrade(text, text, text, text) to service_role;
