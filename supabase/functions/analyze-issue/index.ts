// analyze-issue — runs automatically when an issue is created. An agent reads
// the fault text, decides which vendor trade is relevant (from the categories
// that actually exist in the pool), and writes ai_category + ai_search_terms
// back to the issue, so by the time it reaches the committee the relevant
// vendors are already identified. Keyword matching alone over-matches
// ("מזגן" ⊃ "גן", "שמשה" ⊃ "שמש"); the agent disambiguates by context.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { corsHeaders, json, serviceClient, identifyCaller, isPrivileged, timingSafeEqual } from '../_shared/mod.ts'

// Routing notification — when the building has an issue_routing_rules row for
// this category with a notify_email, alert that address about the new report.
// Assignment itself (מלווה/ספק/סטטוס) already happened in the DB BEFORE-INSERT
// trigger (apply_issue_routing); this is only the outbound "נכנסה פנייה
// בקטגוריה שלך" email. Independent of AI availability, never throws.
async function sendRoutingNotification(
  svc: ReturnType<typeof serviceClient>,
  issue: Record<string, unknown>,
): Promise<void> {
  try {
    if (!issue.building_id || !issue.category) return
    const { data: rule } = await svc.from('issue_routing_rules')
      .select('notify_email, assigned_to, vendor_name')
      .eq('building_id', issue.building_id)
      .eq('category', issue.category)
      .eq('active', true)
      .maybeSingle()
    if (!rule?.notify_email) return

    // assigned_to stores a unit_resident id — show the person's name.
    let assigneeName = ''
    if (rule.assigned_to) {
      const { data: m } = await svc.from('unit_residents')
        .select('first_name, last_name').eq('id', rule.assigned_to).maybeSingle()
      assigneeName = m ? `${m.first_name || ''} ${m.last_name || ''}`.trim() : ''
    }

    const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:18px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">פנייה חדשה — ${esc(issue.category)}</h2>
        </div>
        <div style="background:#f8fafc;padding:18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 8px;"><b>${esc(issue.title)}</b></p>
          ${issue.description ? `<p style="margin:0 0 8px;color:#475569;white-space:pre-wrap;">${esc(issue.description)}</p>` : ''}
          ${assigneeName ? `<p style="margin:0 0 6px;color:#64748b;">מלווה אחראי: ${esc(assigneeName)}</p>` : ''}
          ${rule.vendor_name ? `<p style="margin:0 0 6px;color:#64748b;">ספק מועדף: ${esc(rule.vendor_name)}</p>` : ''}
          <p style="margin-top:14px;"><a href="https://vaadly-app.vercel.app/issues" style="color:#2563eb;">לטיפול בפנייה במערכת</a></p>
        </div>
      </div>`

    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        to: rule.notify_email,
        subject: `פנייה חדשה (${issue.category}) — ${issue.title}`,
        html,
        buildingId: issue.building_id,
        unitId: issue.unit_id || null,
        channel: 'issue_routing',
      }),
    })
  } catch (e) {
    console.warn('routing notification failed:', e instanceof Error ? e.message : e)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const svc = serviceClient()

    // AUTH (fail closed): either the internal secret presented by the DB
    // trigger (trg_analyze_issue reads it from messaging_secrets and sends it
    // as x-internal-secret), or an admin/committee JWT. Anyone else — including
    // anon-key callers — is rejected; this both burns no Anthropic tokens for
    // strangers and stops tampering with ai_* fields on arbitrary issues.
    const providedSecret = (req.headers.get('x-internal-secret') || '').trim()
    let authorized = false
    if (providedSecret) {
      const { data: sec } = await svc.from('messaging_secrets')
        .select('api_token').eq('provider', 'edge-internal').maybeSingle()
      authorized = !!sec?.api_token && timingSafeEqual(providedSecret, sec.api_token)
    }
    if (!authorized) {
      const caller = await identifyCaller(req, svc)
      authorized = isPrivileged(caller)
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'invalid_json' }, 400)
    const { issueId } = body as { issueId?: string }
    if (!issueId) return json({ error: 'issueId_required' }, 400)

    const { data: issue } = await svc.from('issues')
      .select('id, building_id, unit_id, title, description, category').eq('id', issueId).maybeSingle()
    if (!issue) return json({ error: 'issue_not_found' }, 404)

    // Category routing email — runs even when AI analysis is unavailable.
    await sendRoutingNotification(svc, issue)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ ok: true, routed: true, error: 'no_api_key' })

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
    const { error: updErr } = await svc.from('issues').update(update).eq('id', issueId)
    if (updErr) return json({ error: `update_failed: ${updErr.message}` }, 500)

    return json({ ok: true, category, search_terms: searchTerms, cost_estimate: costEstimate })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})
