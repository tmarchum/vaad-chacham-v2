-- 019_whatsapp_cloud_templates.sql
-- Official WhatsApp (Meta WhatsApp Cloud API) as a second messaging provider,
-- a template library for residents + vendors, and a richer message log.
--
-- Provider rows live in messaging_integrations / messaging_secrets keyed by
-- provider ('greenapi' | 'whatsapp_cloud'). The Cloud API access token and the
-- Meta app secret are service-role-read only (same pattern as 011).

alter table public.messaging_integrations
  add column if not exists phone_number_id text,
  add column if not exists waba_id text,
  add column if not exists graph_version text default 'v21.0',
  add column if not exists display_number text,
  add column if not exists verified_name text;

alter table public.messaging_secrets
  add column if not exists webhook_token text,
  add column if not exists app_secret text;

-- ── Message log: one row per message the system sends or receives ─────────
alter table public.notification_log
  add column if not exists provider text,          -- gmail | fcm | greenapi | whatsapp_cloud | manual
  add column if not exists audience text,          -- resident | vendor | committee | other
  add column if not exists template_key text,
  add column if not exists external_id text,       -- provider message id (wamid…)
  add column if not exists delivery_status text,   -- sent | delivered | read | failed (from webhooks)
  add column if not exists sent_by uuid,
  add column if not exists vendor_id uuid,
  add column if not exists updated_at timestamptz;

create index if not exists notification_log_created_idx on public.notification_log (created_at desc);
create index if not exists notification_log_external_idx on public.notification_log (external_id) where external_id is not null;

-- ── Templates ──────────────────────────────────────────────────────────────
create table if not exists public.message_templates (
  key text primary key,                 -- also the Meta template name (lowercase/underscores)
  audience text not null check (audience in ('resident', 'vendor')),
  category text not null default 'UTILITY' check (category in ('UTILITY', 'MARKETING')),
  language text not null default 'he',
  title text not null,                  -- Hebrew label shown in the app
  body text not null,                   -- with positional {{1}}..{{n}}
  variables jsonb not null default '[]',-- Hebrew labels per placeholder, in order
  example jsonb not null default '[]',  -- sample values (Meta requires examples)
  manual_only boolean not null default true,
  meta_status text not null default 'draft', -- draft | PENDING | APPROVED | REJECTED | PAUSED | DISABLED
  meta_id text,
  rejection_reason text,
  active boolean not null default true,
  updated_at timestamptz default now()
);

alter table public.message_templates enable row level security;
drop policy if exists mt_admin_all on public.message_templates;
create policy mt_admin_all on public.message_templates
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists mt_committee_sel on public.message_templates;
create policy mt_committee_sel on public.message_templates
  for select using (public.is_committee());

insert into public.message_templates (key, audience, category, title, body, variables, example) values
  ('resident_announcement', 'resident', 'UTILITY', 'הודעה מהוועד',
   E'שלום {{1}},\nהודעה חדשה מוועד הבית ב{{2}}:\n{{3}}\n\nלפרטים נוספים היכנסו לאפליקציית ועדלי.',
   '["שם הדייר","כתובת הבניין","תוכן ההודעה"]', '["משפחת כהן","רוטשילד 42","החלפת תאורת חירום בלובי ביום רביעי בין 10:00 ל-12:00"]'),
  ('resident_issue_update', 'resident', 'UTILITY', 'עדכון על פנייה',
   E'שלום {{1}},\nעדכון לגבי הפנייה שלך מספר {{2}} ({{3}}):\n{{4}}\n\nצוות ועד הבית',
   '["שם הדייר","מספר פנייה","נושא הפנייה","העדכון"]', '["דנה","1024","נזילה בחדר מדרגות","הטכנאי יגיע מחר בשעה 09:00"]'),
  ('resident_maintenance_notice', 'resident', 'UTILITY', 'הודעת תחזוקה',
   E'שלום {{1}},\nהודעת תחזוקה ב{{2}}: {{3}}\nמועד: {{4}}\nעמכם הסליחה על אי הנוחות.',
   '["שם הדייר","כתובת הבניין","העבודה","מועד"]', '["משפחת לוי","רוטשילד 42","טיפול תקופתי במעלית","יום שלישי 18/11 בין 08:00 ל-11:00"]'),
  ('resident_meeting_invite', 'resident', 'UTILITY', 'זימון לאסיפת דיירים',
   E'שלום {{1}},\nהנכם מוזמנים לאסיפת דיירים ב{{2}} בתאריך {{3}} בשעה {{4}}.\nעל סדר היום: {{5}}\nנשמח לראותכם.',
   '["שם הדייר","מקום","תאריך","שעה","נושאים"]', '["משפחת כהן","לובי הבניין","25/11","20:00","תקציב 2027 ושיפוץ חדר המדרגות"]'),
  ('resident_booking_status', 'resident', 'UTILITY', 'סטטוס שריון חדר',
   E'שלום {{1}},\nבקשת השריון של {{2}} לתאריך {{3}} {{4}}.\nפרטים נוספים באפליקציית ועדלי.',
   '["שם הדייר","החדר","תאריך ומשבצת","סטטוס (אושרה / נדחתה)"]', '["יוסי","חדר הדיירים","20/11 ערב","אושרה"]'),
  ('resident_payment_reminder', 'resident', 'UTILITY', 'תזכורת תשלום דמי ועד',
   E'שלום {{1}},\nתזכורת ידידותית: דמי ועד הבית לחודש {{2}} בסך {{3}} ש"ח טרם התקבלו במערכת.\nאם כבר שילמת — תודה, ואפשר להתעלם מהודעה זו.',
   '["שם הדייר","חודש","סכום"]', '["משפחת כהן","נובמבר","250"]'),
  ('vendor_quote_request', 'vendor', 'UTILITY', 'בקשת הצעת מחיר',
   E'שלום {{1}},\nועד הבית ב{{2}} מבקש הצעת מחיר עבור: {{3}}\nנשמח לתשובה עם מחיר ומועד אפשרי.\nתודה, {{4}}',
   '["שם הספק","כתובת הבניין","תיאור העבודה","שם איש הקשר"]', '["אבי","רוטשילד 42, תל אביב","תיקון נזילה בצנרת בחדר המדרגות","תומר — ועד הבית"]'),
  ('vendor_job_assignment', 'vendor', 'UTILITY', 'אישור ביצוע עבודה',
   E'שלום {{1}},\nאושרה עבודה בכתובת {{2}}: {{3}}\nמועד מתוכנן: {{4}}\nאיש קשר בבניין: {{5}}',
   '["שם הספק","כתובת","העבודה","מועד","איש קשר"]', '["אבי","רוטשילד 42","תיקון נזילה","יום ראשון 09:00","תומר 050-0000000"]'),
  ('vendor_job_reminder', 'vendor', 'UTILITY', 'תזכורת לעבודה מתוכננת',
   E'שלום {{1}},\nתזכורת לעבודה מתוכננת ב{{2}} בתאריך {{3}}: {{4}}\nתודה!',
   '["שם הספק","כתובת","תאריך","העבודה"]', '["אבי","רוטשילד 42","18/11","טיפול במשאבת מים"]'),
  ('vendor_payment_sent', 'vendor', 'UTILITY', 'הודעה על תשלום',
   E'שלום {{1}},\nהועבר אליך תשלום בסך {{2}} ש"ח עבור {{3}} ({{4}}).\nתודה על השירות!',
   '["שם הספק","סכום","העבודה","כתובת"]', '["אבי","1,200","תיקון נזילה","רוטשילד 42"]'),
  ('vendor_invite', 'vendor', 'MARKETING', 'הזמנה למאגר הספקים',
   E'שלום {{1}},\nאנחנו ועדלי — מערכת לניהול ועדי בתים. נשמח לצרף אותך למאגר הספקים שלנו בתחום {{2}}.\nלהצטרפות השב "מאשר", להסרה השב "מסרב".',
   '["שם הספק","תחום"]', '["אבי","אינסטלציה"]')
on conflict (key) do nothing;

-- Staff may record their own manual sends (wa.me opened by hand) so the log is
-- complete; they can only write rows attributed to themselves.
drop policy if exists nl_staff_ins on public.notification_log;
create policy nl_staff_ins on public.notification_log
  for insert with check ((public.is_admin() or public.is_committee()) and sent_by = auth.uid());
