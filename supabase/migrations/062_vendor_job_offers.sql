-- Job offers to vendors and to ועד1's handyman over WhatsApp.
--
-- Vendor (quote): "יש עבודה חדשה" with buttons → interested → the price
-- (before VAT, final for the job as described) → when they can do it →
-- the committee picks one → the winner gets the contact, the others a thank-you.
-- Handyman: "עבודה חדשה" with "אגיע / לא יכול" → when he will come.
--
-- quotes.stage follows the conversation; quotes.status stays what the screens
-- already read (pending / accepted / rejected), plus declined and expired.

alter table public.quotes
  add column if not exists vendor_name     text,
  add column if not exists stage           text,
  add column if not exists available_when  text,
  add column if not exists deadline        timestamptz,
  add column if not exists offer_wamid     text,
  add column if not exists visit_requested boolean not null default false;

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('pending', 'received', 'accepted', 'rejected', 'declined', 'expired'));
alter table public.quotes drop constraint if exists quotes_stage_check;
alter table public.quotes add constraint quotes_stage_check
  check (stage is null or stage in ('offered', 'awaiting_amount', 'visit_requested', 'awaiting_date',
                                    'submitted', 'won', 'lost', 'declined', 'expired'));
create index if not exists quotes_issue_idx on public.quotes (issue_id);
create index if not exists quotes_vendor_stage_idx on public.quotes (vendor_id, stage);

-- A quote always belongs to its issue's building, and carries the vendor's
-- name for display. (Rows written from the screens used to arrive without
-- either, which left them invisible under the issue.)
create or replace function public.quotes_fill()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.building_id is null and new.issue_id is not null then
    select building_id into new.building_id from public.issues where id = new.issue_id;
  end if;
  if new.vendor_id is null and coalesce(new.vendor_name, '') <> '' then
    select id into new.vendor_id from public.vendors where name = new.vendor_name limit 1;
  end if;
  if coalesce(new.vendor_name, '') = '' and new.vendor_id is not null then
    select name into new.vendor_name from public.vendors where id = new.vendor_id;
  end if;
  new.updated_at := now();
  return new;
end $fn$;
drop trigger if exists trg_quotes_fill on public.quotes;
create trigger trg_quotes_fill before insert or update on public.quotes
  for each row execute function public.quotes_fill();

-- The handyman's answer, on the issue itself (one handyman per issue).
alter table public.issues
  add column if not exists handyman_reply      text check (handyman_reply is null or handyman_reply in ('offered', 'coming', 'declined')),
  add column if not exists handyman_eta        text,
  add column if not exists handyman_replied_at timestamptz;

-- Two new templates. Utility: each one is a reply-driven work request, not marketing.
insert into public.message_templates (key, title, category, language, audience, body, variables, example, active, meta_status)
select 'vendor_job_offer', 'עבודה חדשה לספק (מעוניין / לא מעוניין)', 'UTILITY', 'he', 'vendor',
  E'שלום {{1}}, כאן ועד1.\nיש עבודה חדשה בתחום {{2}}:\n{{3}}\nכתובת: {{4}}\nמעוניין לתת הצעת מחיר?',
  '["שם הספק","תחום","תיאור העבודה","כתובת"]'::jsonb,
  '["אבי","אינסטלציה","נזילה בצנרת בחדר המדרגות, קומה 3","רוטשילד 42, פתח תקווה"]'::jsonb, true, 'draft'
where not exists (select 1 from public.message_templates where key = 'vendor_job_offer');

insert into public.message_templates (key, title, category, language, audience, body, variables, example, active, meta_status)
select 'handyman_job_offer', 'עבודה חדשה לאיש האחזקה (אגיע / לא יכול)', 'UTILITY', 'he', 'vendor',
  E'שלום {{1}}, כאן ועד1.\nעבודה חדשה לאיש האחזקה:\n{{2}}\nכתובת: {{3}}\nתוכל לקחת את העבודה?',
  '["שם","תיאור העבודה","כתובת"]'::jsonb,
  '["משה","החלפת ידית בדלת הלובי","רוטשילד 42, פתח תקווה"]'::jsonb, true, 'draft'
where not exists (select 1 from public.message_templates where key = 'handyman_job_offer');
