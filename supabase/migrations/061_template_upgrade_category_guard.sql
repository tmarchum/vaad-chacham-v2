-- Meta sometimes re-classifies a re-worded template from UTILITY to MARKETING
-- (three of ours on 2026-11-18). A marketing template costs more and is subject
-- to marketing limits and opt-outs, so a service message must not silently
-- become one: such a version stays in review ("APPROVED_MARKETING") and the
-- live utility template keeps being used.
-- A version is promoted only when the category Meta gave it is known.
drop function if exists public.apply_template_upgrade(text, text, text, text);
create or replace function public.apply_template_upgrade(
  p_name text, p_status text, p_meta_id text, p_reason text, p_category text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $fn$
declare u public.message_template_upgrades%rowtype; v_live_cat text;
begin
  select * into u from public.message_template_upgrades where meta_name = p_name;
  if not found then return false; end if;
  select category into v_live_cat from public.message_templates where key = u.key;
  if upper(coalesce(p_status, '')) = 'APPROVED' and p_category is not null
     and not (upper(p_category) = 'MARKETING' and upper(coalesce(v_live_cat, '')) = 'UTILITY') then
    update public.message_templates
       set meta_name = u.meta_name, body = u.body, meta_id = coalesce(nullif(p_meta_id, ''), u.meta_id),
           meta_status = 'APPROVED', category = upper(p_category), rejection_reason = null, updated_at = now()
     where key = u.key;
    delete from public.message_template_upgrades where key = u.key;
  else
    update public.message_template_upgrades
       set meta_status = case when upper(coalesce(p_status, '')) = 'APPROVED' and upper(coalesce(p_category, '')) = 'MARKETING'
                              then 'APPROVED_MARKETING' else upper(coalesce(nullif(p_status, ''), 'PENDING')) end,
           meta_id = coalesce(nullif(p_meta_id, ''), meta_id),
           rejection_reason = nullif(nullif(p_reason, ''), 'NONE'), updated_at = now()
     where key = u.key;
  end if;
  return true;
end $fn$;
revoke all on function public.apply_template_upgrade(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_template_upgrade(text, text, text, text, text) to service_role;
