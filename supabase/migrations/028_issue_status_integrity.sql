-- Issue status: normalise the drift, then stop it recurring.
--
-- `issues.status` had no constraint while `priority` next to it had one, and
-- the gap showed up in the data: of 54 issues, one sat at 'open' and one at
-- 'resolved'. Neither is a status this code writes any more, and 'open' is not
-- in the bucket map either, so it rendered as "חדשה" purely by the fallback —
-- no error, no warning, just a row the app did not actually understand.
--
-- Normalisation preserves what each row already displayed:
--   open     -> reported   (fell through to the 'new' bucket)
--   resolved -> closed     (the bucket map already sent it to 'closed')
--
-- The CHECK then holds the vocabulary to the eleven statuses the app writes.
-- Verified against every writer first: Issues.jsx (the workflow transitions
-- and BUCKET_TO_STATUS), ResidentPortal.jsx (inserts 'reported'), and
-- analyze-issue, which does not touch status. The 'status: open' matches
-- elsewhere in the codebase belong to other tables (collection cases,
-- recurring tasks, the building agent), not to issues.

update public.issues set status = 'reported' where status = 'open';
update public.issues set status = 'closed'   where status = 'resolved';

-- Anything else unexpected becomes 'reported' rather than blocking the
-- constraint — it would otherwise fail the migration on a row nobody has seen.
update public.issues set status = 'reported'
where status is null or status not in (
  'reported', 'pending_committee', 'acknowledged', 'approved_for_quotes',
  'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'closed', 'rejected'
);

alter table public.issues drop constraint if exists issues_status_check;
alter table public.issues add constraint issues_status_check check (status in (
  'reported', 'pending_committee', 'acknowledged', 'approved_for_quotes',
  'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'closed', 'rejected'
));
