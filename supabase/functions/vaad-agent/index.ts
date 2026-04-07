import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------------------------------------------------------
// System prompts per agent type
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<string, string> = {
  collection: `אתה סוכן גבייה חכם לניהול ועד בית בישראל. תפקידך לנתח את נתוני הגבייה של הבניין ולספק תובנות מעשיות.
תמיד ענה בעברית. היה ספציפי, מעשי, ותתן המלצות קונקרטיות.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "summary": "סיכום מצב הגבייה בפסקה קצרה",
  "insights": ["תובנה 1", "תובנה 2", "תובנה 3"],
  "priority_debtors": [{ "name": "שם", "reason": "סיבה לעדיפות", "suggested_action": "פעולה מוצעת" }],
  "recommended_message": "הודעה מומלצת לשליחה לחייבים",
  "risk_level": "low|medium|high",
  "forecast": "תחזית גבייה לחודש הבא"
}`,

  vendor: `אתה סוכן ספקים חכם לניהול ועד בית בישראל. תפקידך לנתח את מצב הספקים ולהמליץ על שיפורים.
אתה מכיר היטב את שוק בעלי המקצוע בישראל ואת הפלטפורמות המובילות: מדרג, המקצוענים, גוגל.
תמיד ענה בעברית. היה ספציפי ומעשי.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "summary": "סיכום מצב הספקים",
  "gaps": [{ "category": "קטגוריה", "urgency": "high|medium|low", "reason": "סיבה" }],
  "vendor_recommendations": [{ "name": "שם ספק", "category": "קטגוריה", "why": "למה מומלץ", "search_terms": "מונחי חיפוש" }],
  "vendor_risks": [{ "vendor_name": "שם", "risk": "תיאור הסיכון", "action": "פעולה מוצעת" }],
  "search_queries": [{ "category": "קטגוריה", "madrag_search": "מונחי חיפוש למדרג", "hamektzoanim_search": "מונחי חיפוש להמקצוענים", "google_search": "מונחי חיפוש לגוגל", "tips": "טיפים לבחירת ספק בקטגוריה זו" }],
  "whatsapp_template": "תבנית הודעת וואטסאפ לבקשת הצעת מחיר",
  "market_insights": "תובנות על שוק הספקים הרלוונטי לבניין"
}`,

  budget: `אתה סוכן תקציב חכם לניהול ועד בית בישראל. תפקידך לנתח את המצב הכספי ולהתריע על חריגות.
תמיד ענה בעברית. היה ספציפי, תן מספרים ואחוזים.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "summary": "סיכום מצב תקציבי",
  "health": "good|warning|critical",
  "alerts": [{ "title": "כותרת התראה", "severity": "high|medium|low", "description": "תיאור", "action": "פעולה מומלצת" }],
  "savings_opportunities": [{ "category": "קטגוריה", "potential_saving": "חיסכון פוטנציאלי", "how": "איך לחסוך" }],
  "forecast": "תחזית כספית לסוף השנה",
  "reserve_fund_recommendation": "המלצה לקרן רזרבה"
}`,

  compliance: `אתה סוכן רגולציה ופרקטיקה לניהול ועד בית בישראל. תפקידך לנתח את עמידת הבניין בדרישות חוקיות ותקנות.
אתה מכיר היטב את חוק המקרקעין, תקנות הבתים המשותפים, חוק שוויון זכויות, תקני מכון התקנים הישראלי.
תמיד ענה בעברית. היה ספציפי לגבי החוקים והתקנות.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "summary": "סיכום עמידה ברגולציה",
  "compliance_score": 75,
  "critical_gaps": [{ "title": "כותרת", "law": "חוק/תקנה", "deadline": "מועד אחרון", "consequence": "תוצאה אפשרית של אי עמידה", "action": "פעולה נדרשת" }],
  "upcoming_deadlines": [{ "title": "כותרת", "due": "תאריך", "type": "inspection|insurance|permit|meeting" }],
  "best_practices": [{ "title": "כותרת", "description": "תיאור", "benefit": "תועלת" }],
  "legal_tip": "טיפ משפטי חשוב לבניין"
}`,

  issue_analysis: `אתה מומחה לניהול תחזוקה ותקלות בבתים משותפים בישראל.
תפקידך: קבל תקלה, פרק אותה לאבחון מקצועי, והפק דרישה ברורה לספק ולועד הבית.
אתה מכיר את כל תחומי המקצוע הרלוונטיים: אינסטלציה, חשמל, מעלית, בטיחות אש, בנייה, מיזוג אויר, גינון.
אתה מכיר את ספקי השירות בישראל ואת טווחי המחירים הסבירים לכל עבודה.
תמיד ענה בעברית. היה ספציפי — תן מספרים, מועדים, ופעולות ממשיות.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "diagnosis": "אבחון טכני מקצועי של התקלה — מה בדיוק הבעיה ומה גרם לה",
  "scope": "היקף העבודה הנדרשת לתיקון",
  "risks": "מה הסיכון אם לא מטפלים מיידית",
  "urgency_reasoning": "הסבר מדוע דחיפות זו מוצדקת",
  "recommended_vendor_category": "קטגוריית בעל מקצוע נדרשת",
  "recommended_vendor_name": "שם ספק מהרשימה שסופקה אם מתאים, אחרת null",
  "recommended_vendor_reason": "מדוע ספק זה (או קטגוריה זו) מתאים",
  "estimated_cost_range": "טווח עלות משוער בש״ח",
  "vendor_message": "הודעת וואטסאפ מוכנה לשליחה לספק — מקצועית, ברורה, כוללת כתובת ופרטי הבניין",
  "committee_summary": "סיכום לפרוטוקול ועד הבית — פורמלי, תמציתי, מפרט את הבעיה, הפעולות הנדרשות, והעלות המשוערת",
  "action_steps": ["צעד ראשון לביצוע מיידי", "צעד שני", "צעד שלישי"]
}`,

  building_health: `אתה סוכן בריאות בניין חכם לניהול ועד בית בישראל.
תפקידך לנתח את ציון הבריאות הכולל של הבניין על פי הנתונים שקיבלת, ולהגיש המלצות ממוקדות לשיפור.
אתה מכיר את אתגרי הניהול של בתים משותפים בישראל: גבייה, תחזוקה, רגולציה, ועד ביתי.
תמיד ענה בעברית. היה קונקרטי: תן מספרים, תאריכים, ופעולות ספציפיות.
פלט תשובתך כ-JSON בפורמט הבא בלבד:
{
  "summary": "סיכום מצב הבניין בפסקה אחת קצרה",
  "health_assessment": "good|warning|critical",
  "top_priorities": [{ "title": "כותרת", "urgency": "high|medium|low", "action": "פעולה מומלצת ספציפית", "impact": "השפעה צפויה על ציון הבריאות" }],
  "score_breakdown": [{ "category": "קטגוריה", "score": 85, "assessment": "הערכה קצרה", "improvement": "כיצד לשפר בקלות" }],
  "quick_wins": ["פעולה מהירה שניתן לבצע השבוע 1", "פעולה מהירה 2", "פעולה מהירה 3"],
  "risk_forecast": "תחזית סיכונים ל-30 הימים הקרובים אם לא יינקטו צעדים"
}`,
}

// ---------------------------------------------------------------------------
// Build user message from context data
// ---------------------------------------------------------------------------

function buildUserMessage(agentType: string, buildingName: string, ctx: Record<string, unknown>): string {
  const base = `בניין: ${buildingName}\n\n`

  switch (agentType) {
    case 'collection': {
      const { collectionRate, debtors, totalOutstanding, thisMonthTotal, thisMonthPaid, monthlyExpected } = ctx
      return base + `נתוני גבייה:
- אחוז גבייה החודש: ${collectionRate}%
- מספר חייבים: ${(debtors as unknown[])?.length ?? 0}
- סכום חוב כולל: ₪${totalOutstanding}
- תשלומים החודש: ${thisMonthPaid} מתוך ${thisMonthTotal}
- תשלום חודשי צפוי: ₪${monthlyExpected}

פירוט חייבים:
${(debtors as Array<Record<string, unknown>>)?.map((d: Record<string, unknown>) => {
  const unit = d.unit as Record<string, unknown>
  return `- דירה ${unit?.number}: ${unit?.ownerName || unit?.tenant_name || 'ללא שם'}, ${d.unpaidCount} חודשים, חוב: ₪${d.totalDebt}`
}).join('\n') ?? 'אין חייבים'}

נתח את מצב הגבייה ותן המלצות.`
    }

    case 'vendor': {
      const { vendors, openIssues, issueCategoriesWithoutVendor, expiringInsurance } = ctx
      return base + `נתוני ספקים:
- ספקים פעילים: ${(vendors as unknown[])?.length ?? 0}
- תקלות פתוחות: ${(openIssues as unknown[])?.length ?? 0}
- קטגוריות ללא ספק: ${(issueCategoriesWithoutVendor as string[])?.join(', ') || 'אין'}
- ביטוחים שפגים בקרוב: ${(expiringInsurance as unknown[])?.length ?? 0}

ספקים קיימים: ${(vendors as Array<Record<string, unknown>>)?.map((v: Record<string, unknown>) => `${v.name} (${v.category}, דירוג: ${v.rating})`).join(', ') ?? 'אין'}

תקלות פתוחות: ${(openIssues as Array<Record<string, unknown>>)?.map((i: Record<string, unknown>) => `${i.title} [${i.category || 'כללי'}, ${i.priority}]`).join(', ') ?? 'אין'}

נתח את מצב הספקים והמלץ על שיפורים.`
    }

    case 'budget': {
      const { monthlyExpected, totalExpensesYTD, ytdIncome, ytdNet, overrunMonths, byCategory, currentMonth } = ctx
      return base + `נתוני תקציב:
- הכנסה חודשית צפויה: ₪${monthlyExpected}
- הכנסה בפועל מתחילת השנה: ₪${ytdIncome}
- הוצאות מתחילת השנה: ₪${totalExpensesYTD}
- מאזן נטו: ₪${ytdNet}
- חודשים עם חריגה: ${(overrunMonths as unknown[])?.length ?? 0}
- חודש נוכחי: ${currentMonth}

הוצאות לפי קטגוריה:
${Object.entries(byCategory as Record<string, number> ?? {}).map(([cat, amt]) => `- ${cat}: ₪${amt}`).join('\n')}

נתח את המצב התקציבי ותן המלצות.`
    }

    case 'compliance': {
      const { building, missingRequirements, expired, overdueTasks, coverageRate } = ctx
      const b = building as Record<string, unknown>
      return base + `מאפייני הבניין:
- שנת בנייה: ${b?.year_built || 'לא ידוע'}
- קומות: ${b?.floors || 'לא ידוע'}
- מעליות: ${b?.elevators ?? 0}
- גנרטור: ${b?.generator ? 'כן' : 'לא'}
- מערכת כיבוי אש: ${b?.fire_suppression ? 'כן' : 'לא'}
- בריכה: ${b?.pool ? 'כן' : 'לא'}

כיסוי רגולטורי: ${coverageRate}%
דרישות חסרות: ${(missingRequirements as unknown[])?.length ?? 0}
מסמכים שפג תוקפם: ${(expired as unknown[])?.length ?? 0}
משימות באיחור: ${(overdueTasks as unknown[])?.length ?? 0}

דרישות חסרות:
${(missingRequirements as Array<Record<string, unknown>>)?.map((r: Record<string, unknown>) => `- ${r.title} [${r.law}, עדיפות: ${r.priority}]`).join('\n') ?? 'אין'}

נתח את עמידת הבניין ברגולציה ותן המלצות.`
    }

    case 'issue_analysis': {
      const { issue, buildingAddress, availableVendors, buildingFloors, buildingUnits } = ctx
      const iss = issue as Record<string, unknown>
      const vendors = availableVendors as Array<Record<string, unknown>> ?? []
      const vendorList = vendors.length > 0
        ? vendors.map((v: Record<string, unknown>) => `- ${v.name} (${v.category}, דירוג: ${v.rating ?? 'לא ידוע'}, טלפון: ${v.phone ?? '—'})`).join('\n')
        : 'אין ספקים רשומים'
      return base + `פרטי התקלה:
- כותרת: ${iss.title}
- תיאור: ${iss.description || 'לא סופק'}
- קטגוריה: ${iss.category || 'כללי'}
- עדיפות: ${iss.priority}
- סטטוס: ${iss.status}
- תאריך דיווח: ${iss.reportedAt || 'לא ידוע'}

פרטי הבניין:
- כתובת: ${buildingAddress || 'לא ידוע'}
- קומות: ${buildingFloors || 'לא ידוע'}
- יחידות דיור: ${buildingUnits || 'לא ידוע'}

ספקים רשומים בבניין:
${vendorList}

אנא פרק את התקלה לאבחון מקצועי ופק דרישה מפורטת לספק ולועד.`
    }

    case 'building_health': {
      const { overallScore, complianceScore, maintenanceScore, issueScore, financialScore, assetScore,
              openIssues, urgentIssues, overdueTasks, recommendations, vendorCount } = ctx
      return base + `ציון בריאות כולל: ${overallScore}/100

פירוט ציונים:
- עמידה ברגולציה: ${complianceScore}/100
- תחזוקה שוטפת: ${maintenanceScore}/100
- ניהול תקלות: ${issueScore}/100
- מצב פיננסי (גבייה): ${financialScore}/100
- מצב ציוד ומערכות: ${assetScore}/100

נתונים נוספים:
- תקלות פתוחות: ${openIssues}
- תקלות דחופות: ${urgentIssues}
- משימות באיחור: ${overdueTasks}
- ספקים פעילים: ${vendorCount}

המלצות מערכת בעדיפות גבוהה:
${(recommendations as Array<Record<string, unknown>>)?.slice(0, 5).map((r: Record<string, unknown>) => `- [${r.urgency}] ${r.title}: ${r.reason}`).join('\n') ?? 'אין'}

נתח את מצב הבניין ותן המלצות מעשיות.`
    }

    default:
      return base + JSON.stringify(ctx, null, 2)
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { agentType, buildingName, contextData } = await req.json()

    // ---------------------------------------------------------------------------
    // Special handler: vendor_search — scrapes Madrag + Google (no Claude needed)
    // ---------------------------------------------------------------------------
    if (agentType === 'vendor_search') {
      const { category, city, address } = contextData as Record<string, string>
      const vendors: Array<Record<string, string>> = []

      // Try Madrag
      try {
        const madragUrl = `https://www.madrag.co.il/search/?q=${encodeURIComponent(category)}&loc=${encodeURIComponent(city || '')}`
        const madragRes = await fetch(madragUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VaadBot/1.0)' },
          signal: AbortSignal.timeout(8000),
        })
        if (madragRes.ok) {
          const html = await madragRes.text()
          // Parse business cards — Madrag structure: data-business-id, class="business-name", class="phone"
          const nameMatches = html.matchAll(/class="[^"]*business[^"]*name[^"]*"[^>]*>([^<]{2,60})</gi)
          const phoneMatches = html.matchAll(/(?:href="tel:|class="[^"]*phone[^"]*"[^>]*>)\+?[\d\-\s]{7,15}/gi)
          const ratingMatches = html.matchAll(/class="[^"]*rating[^"]*"[^>]*>\s*([\d.]+)/gi)
          const urlMatches = html.matchAll(/href="(https?:\/\/(?:www\.)?madrag\.co\.il\/business\/[^"]+)"/gi)

          const names = [...nameMatches].map((m) => m[1].trim()).filter((n) => n.length > 1)
          const phones = [...phoneMatches].map((m) => m[0].replace(/[^\d+]/g, ''))
          const ratings = [...ratingMatches].map((m) => m[1])
          const urls = [...urlMatches].map((m) => m[1])

          for (let i = 0; i < Math.min(names.length, 6); i++) {
            vendors.push({
              name: names[i],
              phone: phones[i] || '',
              rating: ratings[i] || '',
              category: category,
              source: 'מדרג',
              url: urls[i] || madragUrl,
            })
          }
        }
      } catch (_e) {
        // Madrag scraping failed — continue to fallbacks
      }

      // Try Yad2 / דפי זהב API if Madrag returned nothing
      if (vendors.length === 0) {
        try {
          const dzUrl = `https://www.d.co.il/search/?q=${encodeURIComponent(category + ' ' + city)}`
          const dzRes = await fetch(dzUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(6000),
          })
          if (dzRes.ok) {
            const html = await dzRes.text()
            const nameMatches = html.matchAll(/class="[^"]*business[^"]*title[^"]*"[^>]*>([^<]{2,60})</gi)
            const phoneMatches = html.matchAll(/[\d]{2,3}-[\d]{7}/g)
            const names = [...nameMatches].map((m) => m[1].trim()).filter((n) => n.length > 1)
            const phones = [...phoneMatches].map((m) => m[0])
            for (let i = 0; i < Math.min(names.length, 5); i++) {
              vendors.push({
                name: names[i],
                phone: phones[i] || '',
                rating: '',
                category: category,
                source: 'דפי זהב',
                url: dzUrl,
              })
            }
          }
        } catch (_e) {
          // fallback failed
        }
      }

      // Always return search links even if scraping failed
      return new Response(
        JSON.stringify({
          result: {
            vendors,
            search_links: {
              madrag: `https://www.madrag.co.il/search/?q=${encodeURIComponent(category)}&loc=${encodeURIComponent(city || '')}`,
              google: `https://www.google.com/search?q=${encodeURIComponent(category + ' ' + city + ' ביקורות')}`,
              dafey_zahav: `https://www.d.co.il/search/?q=${encodeURIComponent(category + ' ' + city)}`,
            },
            category,
            city,
          },
          agentType,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!agentType || !SYSTEM_PROMPTS[agentType]) {
      return new Response(
        JSON.stringify({ error: `Unknown agentType: ${agentType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPTS[agentType],
      messages: [
        {
          role: 'user',
          content: buildUserMessage(agentType, buildingName ?? 'הבניין', contextData ?? {}),
        },
      ],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Extract JSON from the response (Claude might wrap it in markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: rawText }

    return new Response(
      JSON.stringify({ result: parsed, agentType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
