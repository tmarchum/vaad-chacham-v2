-- A recurring task's reminder gets its own WhatsApp template. Until now a
-- reminder sent outside the 24h window borrowed committee_issue_opened, which
-- reads "נפתחה פנייה חדשה … דירה: —" and has no buttons. This one says what it
-- is and carries the three choices: the regular vendor, other vendors, or done.
-- (The buttons are registered with Meta on the template itself.)
insert into public.message_templates (key, meta_name, title, category, language, audience, body, variables, example, active, meta_status)
select 'committee_task_reminder', 'vaad1_committee_task_reminder', 'תזכורת משימה תקופתית לוועד (ספק קבוע / הצעות מחיר / בוצע)', 'UTILITY', 'he', 'resident',
  E'שלום {{1}}, כאן ועד1.\nתזכורת למשימה תקופתית ב{{2}}:\n{{3}}\nמועד הביצוע: {{4}}\nהספק הקבוע: {{5}}\nאפשר להזמין את הספק הקבוע, לבקש הצעות מחיר מספקים אחרים, או לסמן שהמשימה כבר בוצעה.',
  '["שם חבר הוועד","הבניין","המשימה","מועד","הספק הקבוע"]'::jsonb,
  '["משפחת כהן","רוטשילד 42","בדיקת מטפי כיבוי אש (חובה בחוק)","עד 15.01, בעוד 30 ימים","כיבוי אש השרון"]'::jsonb, true, 'draft'
where not exists (select 1 from public.message_templates where key = 'committee_task_reminder');

-- An insurance renewal needs quotes from agents and a committee decision:
-- three months' notice, not one.
update public.recurring_tasks set remind_days = 90 where remind_days is null and title ~ 'ביטוח';
