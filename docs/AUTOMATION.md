# מפת האוטומציה — ועד פלוס

> **מקור אמת יחיד.** כל רכיב שרץ אוטומטית — מופיע כאן. מוסיפים אוטומציה? מעדכנים כאן באותו קומיט.
> לקח מתקרית 2.7.2026: סוכן ישן שנשכח על מחשב מקומי שלח מיילים משפטיים לדיירים בזמן שהמתג היה כבוי.

עדכון אחרון: 2026-07-05

## רכיבים פעילים (הכול בענן)

| רכיב | איפה רץ | תזמון | מה עושה | מתג כיבוי |
|---|---|---|---|---|
| `Scrape` (dynamic-scrape.mjs) | GitHub Actions — `tmarchum/moneyman` | 2×יום (13:05, 01:05 שעון ישראל) | משיכת תנועות בנק (פאג"י) → `bank_transactions` + הוצאות → דה־דופ → שיוך אוטומטי לדירות → סנכרון `payments` → ניתוח גבייה/כספים דטרמיניסטי (ללא מיילים!) → כתיבה לגיליון Google | `gh workflow disable Scrape -R tmarchum/moneyman` |
| סוכנים מנוהלים שבועיים (פיננסי + גבייה) | בתוך אותה ריצה, ימי שישי בלבד | שישי | ניתוח בלבד דרך `mcp-proxy`; כותבים `agent_alerts`. **לא** יכולים לעדכן תיקים (upsert מנוטרל בשרת) ו**לא** לשלוח מייל (מתג fail-closed) | הסרת `ANTHROPIC_API_KEY` מסודות הריפו |
| `Keep Alive` | GitHub Actions — moneyman | 1/11/21 בחודש | קומיט ריק אם הריפו רדום >20 יום — מונע השבתה אוטומטית של הקרון ע"י GitHub | — |
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

## צ'ק-ליסט הוצאה משימוש (חובה כשמחליפים רכיב)

- [ ] להשבית את המתזמן (workflow / משימת Windows / cron)
- [ ] לנטרל את הקבצים או למחוק את הריפו המקומי
- [ ] למחוק/לרוטט את הסודות שהרכיב החזיק
- [ ] לעדכן את המסמך הזה
