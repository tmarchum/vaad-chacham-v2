-- Vendor messages (e.g. the pool invite) have no building. building_id NOT NULL
-- made the WhatsApp function's log insert fail silently, so vendor sends were
-- delivered but never recorded (and delivery webhooks had no row to update).
alter table public.notification_log alter column building_id drop not null;
