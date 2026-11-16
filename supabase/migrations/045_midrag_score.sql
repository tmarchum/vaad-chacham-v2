-- Midrag's own score (0–10), shown on the vendor's source badge.
alter table public.vendors add column if not exists midrag_score numeric(4,2);
alter table public.vendors add column if not exists midrag_url text;
update public.vendors set midrag_score = 9.79, midrag_url = 'https://www.midrag.co.il/SpCard/Sp/22447' where phone = '0522415565';
update public.vendors set midrag_score = 9.93, midrag_url = 'https://www.midrag.co.il/SpCard/Sp/133602' where phone = '0509235775';
