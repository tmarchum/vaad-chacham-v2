// analyze-issue — runs automatically when an issue is created. An agent reads
// the fault text, decides which vendor trade is relevant (from the categories
// that actually exist in the pool), and writes ai_category + ai_search_terms
// back to the issue, so by the time it reaches the committee the relevant
// vendors are already identified. Keyword matching alone over-matches
// ("מזגן" ⊃ "גן", "שמשה" ⊃ "שמש"); the agent disambiguates by context.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'no_api_key' }, 500)
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { issueId } = await req.json()
    if (!issueId) return json({ error: 'issueId_required' }, 400)

    const { data: issue } = await svc.from('issues')
      .select('id, title, description, category').eq('id', issueId).maybeSingle()
    if (!issue) return json({ error: 'issue_not_found' }, 404)

    // Categories that actually have active vendors — the agent must pick one.
    const { data: vrows } = await svc.from('vendors')
      .select('category').not('is_blacklisted', 'is', true)
    const categories = [...new Set((vrows || []).map((v) => v.category).filter(Boolean))]

    const anthropic = new Anthropic({ apiKey })
    const model = Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-4-6'
    const prompt = `אתה מנתב תקלות בניין לבעלי המקצוע הנכונים בישראל.
תקלה:
כותרת: ${issue.title || ''}
תיאור: ${issue.description || ''}

רשימת הקטגוריות הזמינות (בחר בדיוק אחת מהן, המתאימה ביותר):
${categories.map((c) => `- ${c}`).join('\n')}

הערך גם טווח עלות משוער בש"ח לתיקון תקלה כזו בישראל (הערכה ראשונית גסה לוועד; cost_min ו-cost_max כמספרים בלבד).

החזר אך ורק JSON תקין (ללא טקסט נוסף, ללא backticks):
{ "category": "<אחת מהקטגוריות בדיוק כפי שמופיעה ברשימה>", "search_terms": "2-4 מילות חיפוש לבעל המקצוע", "cost_min": <מספר>, "cost_max": <מספר>, "reason": "משפט קצר" }
דוגמאות: "מזגן מטפטף"→מיזוג אוויר; "ג'וקים"→הדברה; "מחזיר שמן בדלת"→מנעולן; "שמשה שבורה"→זגגות; "צביעת חדר מדרגות"→צבע ושיפוצים; "המעלית תקועה"→מעליות.`

    const msg = await anthropic.messages.create({
      model, max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    let parsed: Record<string, unknown> = {}
    try {
      const m = raw.replace(/```\w*/g, '').replace(/```/g, '').match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : {}
    } catch { /* leave empty */ }

    let category = typeof parsed.category === 'string' ? parsed.category.trim() : ''
    // Only accept a category that exists in the pool.
    if (category && !categories.includes(category)) {
      category = categories.find((c) => c.includes(category) || category.includes(c)) || ''
    }
    const searchTerms = typeof parsed.search_terms === 'string' ? parsed.search_terms : ''
    const min = Number(parsed.cost_min)
    const max = Number(parsed.cost_max)
    const hasCost = Number.isFinite(min) && Number.isFinite(max) && max > 0
    const costEstimate = hasCost ? `₪${Math.round(min).toLocaleString()}–₪${Math.round(max).toLocaleString()}` : null
    const costMid = hasCost ? Math.round((min + max) / 2) : null

    const update: Record<string, unknown> = { ai_search_terms: searchTerms || null }
    if (category) update.ai_category = category
    if (costEstimate) { update.ai_cost_estimate = costEstimate; update.estimated_cost = costMid }
    await svc.from('issues').update(update).eq('id', issueId)

    return json({ ok: true, category, search_terms: searchTerms, cost_estimate: costEstimate })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})
