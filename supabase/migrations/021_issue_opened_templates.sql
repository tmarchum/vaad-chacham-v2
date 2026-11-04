-- Templates for the moment a fault is opened.
--
-- Three people need to know, and the existing set only covered the vendor:
--   resident_issue_opened  — the reporter, so they know it was received
--   committee_issue_opened — the board member responsible for that category
--                            (issue_routing_rules.assigned_to)
--   vendor_issue_dispatch  — the vendor the category routes to. NOT
--                            vendor_job_assignment: that one says the work was
--                            approved, and at this point nobody has approved
--                            anything.
--
-- committee_issue_opened is audience 'resident' on purpose: a board member is a
-- resident of the building, and the whatsapp function only lets a message reach
-- a known vendor or an active resident of a building the sender manages. A new
-- audience would mean a new hole in that guard.

insert into public.message_templates (key, audience, category, title, body, variables, example) values
  ('resident_issue_opened', 'resident', 'UTILITY', 'אישור קבלת פנייה',
   E'שלום {{1}},\nהפנייה שלך בנושא "{{2}}" התקבלה ונפתחה לטיפול.\nמספר פנייה: {{3}}\nנעדכן אותך בהתקדמות.\n\nועד הבית {{4}}',
   '["שם הדייר","נושא הפנייה","מספר פנייה","כתובת הבניין"]',
   '["דנה","נזילה בחדר מדרגות","1024","רוטשילד 42"]'),
  ('committee_issue_opened', 'resident', 'UTILITY', 'פנייה חדשה לטיפול הוועד',
   E'שלום {{1}},\nנפתחה פנייה חדשה ב{{2}} בקטגוריית {{3}}:\n{{4}}\nדירה: {{5}}\nהפנייה ממתינה לטיפולך באפליקציית ועדלי.',
   '["שם חבר הוועד","כתובת הבניין","קטגוריה","תיאור הפנייה","דירה"]',
   '["יוסי","רוטשילד 42","אינסטלציה","נזילה בחדר מדרגות קומה 3","דירה 7"]'),
  ('vendor_issue_dispatch', 'vendor', 'UTILITY', 'קריאת שירות חדשה',
   E'שלום {{1}},\nנפתחה קריאת שירות בכתובת {{2}}:\n{{3}}\nאיש קשר בבניין: {{4}}\nנא לאשר אם אתם יכולים לטפל.',
   '["שם הספק","כתובת","תיאור הקריאה","איש קשר"]',
   '["אבי","רוטשילד 42","נזילה בחדר מדרגות קומה 3","יוסי 050-0000000"]')
on conflict (key) do nothing;
