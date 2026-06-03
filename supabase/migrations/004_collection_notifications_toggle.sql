-- Collection-notifications kill switch.
--
-- The CollectionCases UI toggle and the send-notification Edge Function both
-- reference buildings.collection_notifications_enabled, but the column was
-- never created. Result: the UI toggle could not persist, and the Edge
-- Function gate (`collection_notifications_enabled === false`) never matched
-- (the value read back as undefined), so reminder emails were always sent.
--
-- Default false => nothing is sent until a building explicitly opts in.

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS collection_notifications_enabled boolean NOT NULL DEFAULT false;
