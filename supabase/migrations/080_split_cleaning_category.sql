-- "ניקיון ותחזוקה" was one issue category, so a building could route it to one
-- contractor only. Cleaning, gardening and general maintenance each have their
-- own regular contractor: three categories.

-- Issues filed under the old category, by what they say.
update public.issues set category = case
  when coalesce(title, '') || ' ' || coalesce(description, '') ~ 'אשפה|ניקיון|נקיון|לכלוך|מלוכלך' then 'ניקיון'
  when coalesce(title, '') || ' ' || coalesce(description, '') ~ 'גינה|גינון|גנן|השקיה|גיזום|דשא' then 'גינון'
  else 'תחזוקה כללית' end
where category = 'ניקיון ותחזוקה';

-- The two new categories start from the old rule's owner, without its vendor.
insert into public.issue_routing_rules (building_id, category, route, active, assigned_to, send_to_vendor, auto_acknowledge)
select r.building_id, c.category, 'committee', r.active, r.assigned_to, false, false
from public.issue_routing_rules r
cross join (values ('גינון'), ('תחזוקה כללית')) as c(category)
where r.category = 'ניקיון ותחזוקה'
  and not exists (select 1 from public.issue_routing_rules x where x.building_id = r.building_id and x.category = c.category);

-- The old rule (and the contractor set on it) becomes the cleaning rule.
update public.issue_routing_rules set category = 'ניקיון', updated_at = now()
where category = 'ניקיון ותחזוקה';
