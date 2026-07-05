# מפת האוטומציה — ועד פלוס

> **מקור אמת יחיד.** כל רכיב שרץ אוטומטית — מופיע כאן. מוסיפים אוטומציה? מעדכנים כאן באותו קומיט.
> לקח מתקרית 2.7.2026: סוכן ישן שנשכח על מחשב מקומי שלח מיילים משפטיים לדיירים בזמן שהמתג היה כבוי.

עדכון אחרון: 2026-07-05

## רכיבים פעילים (הכול בענן)

**צינור הבנק המאוחד (מ‑5.7.2026): ריפו אחד — `tmarchum/moneyman-ui` (פרטי).** קרון שעתי בוחר אילו חשבונות אמורים לרוץ (כרגע: 13:00 ו‑01:00 שעון ישראל לכל חשבון), כל חשבון נסרק **פעם אחת** לכל חלון:

| רכיב | איפה רץ | תזמון | מה עושה | מתג כיבוי |
|---|---|---|---|---|
| ג'וב `vaad` — כל חשבונות הוועד | GitHub Actions — `tmarchum/moneyman-ui` (`scrape-vaad.mjs`) | 2×יום (13:00, 01:00) | **החשבונות מגיעים מהאפליקציה** (מסך הגדרות בנק → `bank_accounts` + `bank_account_secrets`; הוספת חשבון במסך = נסרק אוטומטית). לכל בניין: סקרייפ → גיליון Google → `bank_transactions` + הוצאות → דה־דופ → שיוך אוטומטי → סנכרון `payments` → ניתוח גבייה/כספים דטרמיניסטי (ללא מיילים!) → [שישי: סקירת סוכנים] → דוח מייל לבעלים | `gh workflow disable Scrape -R tmarchum/moneyman-ui` |
| ג'וב `scrape` — פאג"י 184993 (אישי) | אותו workflow | 2×יום | סקרייפ → webhook → דוח מייל. לא נוגע ב‑DB של הוועד | עריכת `accounts.json` (`enabled:false`) |
| סוכנים מנוהלים שבועיים (פיננסי + גבייה) | בתוך `process-vaad.mjs`, ימי שישי בלבד | שישי | ניתוח בלבד דרך `mcp-proxy`; כותבים `agent_alerts`. **לא** יכולים לעדכן תיקים (upsert מנוטרל בשרת) ו**לא** לשלוח מייל (מתג fail-closed) | הסרת `ANTHROPIC_API_KEY` מסודות moneyman-ui |
| `Keep Alive` | GitHub Actions — moneyman-ui | 1/11/21 בחודש | קומיט ריק אם הריפו רדום >20 יום — מונע השבתה אוטומטית של הקרון ע"י GitHub (זה מה שהשבית את מיילי התנועות ב‑26.6) | — |
| `monthly-summary` | GitHub Actions — vaad-chacham-v2 → Edge Function | 1 בחודש 08:00 UTC | סיכום כספי חודשי במייל **למנהלים בלבד** | השבתת ה-workflow |
| `analyze-issue` | Supabase (טריגר pg_net על INSERT ל-issues) | בכל תקלה חדשה | סיווג AI לקטגוריית ספק + הערכת עלות | הסרת הטריגר `issues_ai_analyze` |
| green-whatsapp / send-notification / mcp-proxy / vaad-agent | Supabase Edge Functions | לפי קריאה | שליחות וניתוחים לפי בקשת המשתמש | — |

## שערי בטיחות (אל תיגע בלי להבין)

1. **מיילי גבייה** — יוצאים אך ורק כש-`buildings.collection_notifications_enabled = true`, דרך `send-notification` / `mcp-proxy` (שניהם fail-closed). כל שינוי של המתג נרשם ב-`settings_audit` (מי, מתי, מה) — migration 014.
2. **הכלל המבני:** לאף רכיב מחוץ למסלול הזה אסור להחזיק פרטי SMTP. סיסמת ה-Gmail קיימת אך ורק בסודות של Supabase Edge Functions.
3. `mcp-proxy` דורש `MCP_SECRET`; `upsert_collection_case` מנוטרל בו לצמיתות — ניהול תיקים הוא דטרמיניסטי בקוד בלבד.
4. WhatsApp — לספקים בלבד (guardrail ב-green-whatsapp).

## רכיבים שהוצאו משימוש (2026-07-05) — לא להחיות

| רכיב | סטטוס | למה |
|---|---|---|
| משימת Windows‏ `VaadBankScraper` (nightly.bat → scraper.js + agents.js) | Disabled; קבצים שונו ל-`*.DISABLED` ב-`Documents\bank-scraper` | **מקור התקרית** — סוכן עם SMTP משלו, בלי בדיקת מתג, רץ בכל הדלקת מחשב |
| GitHub `tmarchum/bank-scraper` → workflow "Bank Scraper" | disabled_manually | סקרייפר Playwright ביתי שנשבר כשהבנק שינה את דף הכניסה (7/2026); הוחלף ב-moneyman |
| משימת Claude מקומית `moneyman-daily-scrape` | Disabled | הגיליון מוזן עכשיו מהענן |
| GitHub `tmarchum/moneyman` → `Scrape` + `Keep Alive` | disabled_manually (5.7.2026) | אוחד לתוך moneyman-ui — סקרייפ כפול של אותו חשבון (4 כניסות בנק ביום) גרם לחסימות מצד הבנק |

## צ'ק-ליסט הוצאה משימוש (חובה כשמחליפים רכיב)

- [ ] להשבית את המתזמן (workflow / משימת Windows / cron)
- [ ] לנטרל את הקבצים או למחוק את הריפו המקומי
- [ ] למחוק/לרוטט את הסודות שהרכיב החזיק
- [ ] לעדכן את המסמך הזה
