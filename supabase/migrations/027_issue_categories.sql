-- Fifteen categories on the form, seventeen distinct values in the data, and
-- a third of every fault filed under "כללי" — a value that was not even on
-- the list and that nothing could route. Alongside it: English leftovers
-- (elevator, electrical, plumbing, security), "מעליות" against the form's
-- "מעלית", and "נקיון" against "ניקיון" — the exact spelling split the
-- constants file warns about, still sitting in the rows.
--
-- Collapsed to seven. Only מעלית routes on its own; everything else goes to
-- the committee, so the vocabulary only needs to be good enough to tell a
-- lift fault from the rest and to read sensibly in a notification.

update public.issues set category = case
  when btrim(coalesce(category, '')) in ('מעלית', 'מעליות', 'elevator')                      then 'מעלית'
  when btrim(coalesce(category, '')) in ('חשמל', 'electrical', 'תאורה')                      then 'חשמל ותאורה'
  when btrim(coalesce(category, '')) in ('אינסטלציה', 'plumbing', 'מים', 'ביוב')             then 'אינסטלציה ומים'
  when btrim(coalesce(category, '')) in ('חניה', 'דלתות וחלונות', 'מסגרות',
                                         'שער חשמלי עליון', 'שערים')                          then 'שערים, דלתות וחניה'
  when btrim(coalesce(category, '')) in ('ניקיון', 'נקיון', 'גינון', 'מבנה', 'איטום',
                                         'מיזוג אוויר', 'שיפור בניין', 'תחזוקה')              then 'ניקיון ותחזוקה'
  when btrim(coalesce(category, '')) in ('בטיחות', 'security', 'ביטחון')                     then 'בטיחות וביטחון'
  else 'אחר'   -- כללי, אחר, רעש, empty, and anything that shows up later
end
where coalesce(category, '') is not null;

-- The lift contractor the building actually uses. It was not in the vendor
-- pool at all: ten payments to "קונה" / "קונה בע\"מ" totalling ~87,000 ₪ this
-- year say who maintains these three lifts, and the pool had four other lift
-- companies instead. No phone — that is not something to invent, and the
-- routing rule names a committee member too, so a fault still reaches a human.
insert into public.vendors (name, category, membership_status, notes)
select 'קונה בע"מ', 'מעליות', 'agreed',
       'ספק המעליות בפועל של משורר ישעיהו 18 — זוהה לפי 10 תשלומים ב-2026. יש להשלים טלפון ואיש קשר.'
where not exists (select 1 from public.vendors where name ilike '%קונה%');
