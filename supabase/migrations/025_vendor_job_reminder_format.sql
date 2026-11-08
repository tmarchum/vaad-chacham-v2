-- The one template Meta rejected out of the fourteen submitted 2026-11-05.
--
-- Meta's verdict on vaadly_vendor_job_reminder was the bare enum
-- `INVALID_FORMAT`; the Graph API carries no prose beyond that, and the
-- human-readable sentence lives only in WhatsApp Manager and in the
-- `message_template_status_update` webhook, which this WABA does not yet send
-- us. So the cause is not knowable from here.
--
-- What IS knowable: our own pre-flight check (templateProblems) finds nothing
-- wrong with it, and the structure it was blamed for is not the cause either —
-- resident_maintenance_notice carries the identical `ב{{2}}: {{3}}`
-- parameter-colon-parameter shape and was APPROVED in the same batch. The
-- difference is confinement to one line: this body packed three of its four
-- parameters into a single sentence.
--
-- So rather than guess at a rule, give it the shape of a template that passed:
-- one parameter per line behind a static label, and a closing line with
-- substance rather than a bare "תודה!". Meaning, variable order and variable
-- count are unchanged, so no calling code moves.
--
-- meta_status back to 'draft' so sync-templates picks it up. That resubmission
-- now EDITS the existing template (POST /{meta_id}) instead of trying to
-- create the name a second time — see the whatsapp function; creating was
-- rejected as a duplicate name, which is why a rejection could not be fixed
-- from the app at all.

update public.message_templates set
  body = E'שלום {{1}},\nתזכורת לעבודה מתוכננת בכתובת {{2}}.\nמועד: {{3}}\nתיאור העבודה: {{4}}\nתודה, ועד הבית.',
  meta_status = 'draft',
  rejection_reason = null,
  updated_at = now()
where key = 'vendor_job_reminder';
