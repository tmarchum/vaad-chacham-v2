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
