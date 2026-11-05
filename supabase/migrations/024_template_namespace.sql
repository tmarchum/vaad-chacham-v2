-- Vaadly shares אות's WhatsApp Business Account by design — it is a venture of
-- אות, not a separate business, and it will not get a number of its own.
--
-- But template names live in ONE namespace per WABA, shared with every
-- template אות already has. Two consequences, both silent:
--   1. Submitting `resident_announcement` fails, or worse succeeds against a
--      name אות is already using.
--   2. refresh-templates pulls every template in the WABA and matches ours by
--      name, so an unrelated template of אות's called the same thing would
--      mark ours APPROVED while the approved body is somebody else's.
--
-- So the name Meta sees is not the key the app uses. meta_name is generated,
-- not stored by hand, so the two can never drift apart. It also means אות can
-- see at a glance, in WhatsApp Manager, which templates belong to Vaadly.
--
-- Free to do right now and only right now: nothing has been submitted yet
-- (every row is still meta_status='draft' with no meta_id).

alter table public.message_templates
  add column if not exists meta_name text
  generated always as ('vaadly_' || key) stored;

comment on column public.message_templates.meta_name is
  'The template name registered with Meta. Namespaced because the WABA is shared with אות — never submit or look up by key.';
