-- Polls over WhatsApp: residents vote with a button in the message.
-- A WhatsApp vote is the vote of the resident's apartment (one per unit,
-- changeable while open) — same rule as the app.
alter table public.poll_votes add column if not exists channel text not null default 'app';
alter table public.polls add column if not exists wa_sent_at timestamptz;
alter table public.polls add column if not exists wa_sent_count integer;

create or replace function public.cast_poll_vote_by_phone(p_poll uuid, p_phone text, p_option integer)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_poll public.polls%rowtype;
  v_unit uuid;
  v_is_owner boolean;
  v_t text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
begin
  select * into v_poll from public.polls where id = p_poll;
  if not found then return 'poll_not_found'; end if;
  if v_poll.status <> 'open' or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then return 'poll_closed'; end if;
  if p_option < 0 or p_option >= jsonb_array_length(v_poll.options) then return 'bad_option'; end if;
  if length(v_t) < 9 then return 'not_a_resident'; end if;

  select ur.unit_id, bool_or(ur.resident_type = 'owner') into v_unit, v_is_owner
    from public.unit_residents ur join public.units u on u.id = ur.unit_id
   where u.building_id = v_poll.building_id and coalesce(ur.archived, false) = false
     and (right(regexp_replace(coalesce(ur.phone,''), '\D', '', 'g'), 9) = v_t
          or right(regexp_replace(coalesce(ur.owner_phone,''), '\D', '', 'g'), 9) = v_t)
   group by ur.unit_id
   order by bool_or(ur.resident_type = 'owner') desc
   limit 1;
  if v_unit is null then return 'not_a_resident'; end if;
  if v_poll.owners_only and not coalesce(v_is_owner, false) then return 'owners_only'; end if;

  insert into public.poll_votes (poll_id, unit_id, option_index, voted_by, channel)
  values (p_poll, v_unit, p_option, null, 'whatsapp')
  on conflict (poll_id, unit_id) do update set option_index = excluded.option_index, channel = 'whatsapp', updated_at = now();
  return 'ok';
end $fn$;
revoke all on function public.cast_poll_vote_by_phone(uuid, text, integer) from public, anon, authenticated;

insert into public.message_templates (key, title, category, language, audience, body, variables, active, meta_status)
select k, t, 'UTILITY', 'he', 'resident',
  E'שלום,\nנפתחה הצבעת דיירים ב{{1}}:\n*{{2}}*\nההצבעה פתוחה עד {{3}}. קול אחד לכל דירה, ואפשר לשנות את ההצבעה עד שהיא נסגרת.',
  '["בניין","נושא ההצבעה","פתוחה עד"]'::jsonb, true, 'PENDING'
from (values ('resident_poll', 'הצבעת דיירים — כפתורי בעד/נגד/נמנע'), ('resident_poll_link', 'הצבעת דיירים — קישור להצבעה')) v(k, t)
where not exists (select 1 from public.message_templates m where m.key = v.k);
