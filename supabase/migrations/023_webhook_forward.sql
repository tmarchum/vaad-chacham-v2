-- Meta allows exactly ONE webhook URL per app, and this app is shared.
--
-- The number (055-941-1878) belongs to "אות"; its incoming messages are
-- recorded to a Google Sheet by an Apps Script webhook today. Pointing the app
-- at Supabase would silently stop that sheet — replies to "אות" and to
-- "הקולנוע הנודד" would land only in Vaadly.
--
-- So Supabase becomes the single receiver and forwards every raw event on to
-- Apps Script, which keeps both working. This column holds that destination;
-- empty means no forwarding, which is the safe default.

alter table public.messaging_integrations
  add column if not exists forward_webhook_url text;

comment on column public.messaging_integrations.forward_webhook_url is
  'Optional: every verified Meta webhook event is forwarded verbatim to this URL (the Apps Script endpoint for אות). Empty = no forwarding.';
