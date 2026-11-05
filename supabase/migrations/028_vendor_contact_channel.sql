-- How this vendor wants to be reached. Until now the system guessed: try
-- WhatsApp, fall back to email, and if neither existed the fault quietly
-- reached nobody. KONE take service calls by email and nothing else; a
-- one-man locksmith answers WhatsApp and never reads mail; some only take a
-- phone call, and for those the honest behaviour is to tell the committee to
-- pick up the phone rather than to send into a void.
--
-- 'auto' keeps the old behaviour for the 109 vendors nobody has asked yet.

alter table public.vendors
  add column if not exists contact_channel text not null default 'auto'
  check (contact_channel in ('auto', 'whatsapp', 'email', 'phone'));

comment on column public.vendors.contact_channel is
  'auto = try whatsapp then email; whatsapp/email = that channel only; phone = never message, tell the committee to call.';

-- The two vendors we actually know something about.
update public.vendors set contact_channel = 'email'
where name = 'קונה בע"מ';
