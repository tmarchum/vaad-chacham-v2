// whatsapp — the official WhatsApp channel (Meta WhatsApp Cloud API).
//
// Actions (user JWT, admin/committee):
//   { action: 'config' }                          → current config (admin: incl. webhook URL + verify token)
//   { action: 'save', config, access_token?, app_secret? }   (admin)
//   { action: 'status' }                          → phone number info from Graph
//   { action: 'sync-templates' }                  → submit draft/rejected templates to Meta, then refresh (admin)
//   { action: 'refresh-templates' }               → pull template statuses from Meta (admin)
//   { action: 'check-templates' }                 → validate every template against Meta's
//                                                   rules WITHOUT the Meta keys (admin)
//   { action: 'send', audience, to, templateKey, variables[], buildingId?, unitId?, vendorId?, confirmManual? }
//   { action: 'send-text', audience, to, text, … } → free text (only inside Meta's 24h service window)
//
// Webhook (no JWT; Meta authenticates):
//   GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  → echo challenge
//   POST signed with X-Hub-Signature-256 (HMAC of the raw body with the app secret; fail closed)
//        → delivery statuses, inbound messages (vendor "מאשר"/"מסרב"), template status updates.
//
// Every outbound attempt and every inbound message is written to notification_log.
//
// GUARDRAILS
//  - Sends require a signed-in human (admin/committee JWT). No service-role / cron
//    path exists, so nothing here can auto-send to residents.
//  - The recipient must be a known vendor (audience vendor) or an active resident
//    of a building the caller manages (audience resident).
//  - resident_payment_reminder additionally needs confirmManual=true (explicit click).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, serviceClient, timingSafeEqual } from '../_shared/mod.ts'

const PROVIDER = 'whatsapp_cloud'
const MANUAL_CONFIRM_TEMPLATES = new Set(['resident_payment_reminder'])

type Integ = {
  phone_number_id: string | null
  waba_id: string | null
  graph_version: string | null
  enabled: boolean | null
  sender_label: string | null
  display_number: string | null
  verified_name: string | null
  status: string | null
  has_token: boolean | null
  forward_webhook_url: string | null
}

const last9 = (s: string) => String(s || '').replace(/\D/g, '').slice(-9)

// Israeli numbers → E.164 digits without '+' (what the Cloud API expects).
function toE164(phone: string): string | null {
  let d = String(phone || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '972' + d.slice(1)
  if (d.length < 11 || d.length > 15) return null
  return d
}

// Template parameters may not contain newlines/tabs or 4+ consecutive spaces.
const cleanParam = (v: unknown) =>
  String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1000) || '-'

const render = (body: string, vars: string[]) =>
  body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? `{{${n}}}`)

type Tpl = {
  key: string; meta_name: string; category: string; language: string | null; body: string
  variables: unknown; example: unknown
}

/**
 * Meta's template review rejects some bodies outright, before a human reads
 * them, and the Graph error says nothing useful about why. Catch those here so
 * a sync never spends a submission on a template that cannot pass.
 *
 * Reasons are Hebrew because they are shown to the admin as-is.
 */
function templateProblems(t: Tpl): string[] {
  const out: string[] = []
  const body = String(t.body || '')
  const vars = Array.isArray(t.variables) ? t.variables : []
  const ex = Array.isArray(t.example) ? t.example : []

  // meta_name is what Meta registers, not key — the WABA is shared with אות.
  if (!/^[a-z0-9_]{1,512}$/.test(t.meta_name || '')) out.push('שם התבנית חייב להיות אותיות קטנות באנגלית, ספרות וקו תחתון')
  if (!['AUTHENTICATION', 'MARKETING', 'UTILITY'].includes(t.category)) out.push(`קטגוריה לא חוקית: ${t.category}`)
  if (!body.trim()) out.push('גוף ההודעה ריק')
  if (body.length > 1024) out.push(`גוף ההודעה ${body.length} תווים, המקסימום 1024`)

  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
  const uniq = [...new Set(nums)].sort((a, b) => a - b)
  if (uniq.length && uniq.some((n, i) => n !== i + 1)) out.push(`רצף המשתנים חייב להתחיל ב-1 וללא דילוגים (כרגע: ${uniq.join(',')})`)
  if (/\}\}\s*\{\{/.test(body)) out.push('שני משתנים צמודים — חייב להיות טקסט ביניהם')
  if (/^\s*\{\{/.test(body)) out.push('ההודעה לא יכולה להתחיל במשתנה')
  if (/\}\}\s*$/.test(body)) out.push('ההודעה לא יכולה להסתיים במשתנה')

  if (vars.length !== uniq.length) out.push(`${uniq.length} משתנים בגוף ההודעה אך ${vars.length} שמות משתנים`)
  if (ex.length !== uniq.length) out.push(`${uniq.length} משתנים בגוף ההודעה אך ${ex.length} דוגמאות`)
  ex.forEach((v, i) => {
    const s = String(v ?? '')
    if (!s.trim()) out.push(`דוגמה ריקה למשתנה {{${i + 1}}}`)
    else if (/[\n\r\t]/.test(s)) out.push(`דוגמה למשתנה {{${i + 1}}} מכילה שורה חדשה או טאב`)
  })
  return out
}

async function loadConfig(svc: SupabaseClient) {
  const { data: integ } = await svc.from('messaging_integrations').select('*').eq('provider', PROVIDER).maybeSingle()
  const { data: sec } = await svc.from('messaging_secrets')
    .select('api_token, webhook_token, app_secret').eq('provider', PROVIDER).maybeSingle()
  return { integ: (integ || null) as Integ | null, sec: sec || null }
}

function graphBase(integ: Integ | null) {
  return `https://graph.facebook.com/${(integ?.graph_version || 'v21.0').trim()}`
}

// Extra services a vendor mentions in a reply ("מאשר, גם מצלמות") → trades.
const TRADE_WORDS: [RegExp, string][] = [
  [/מצלמ|אזעק|מיגון|אבטח/, 'מצלמות ואזעקות'], [/אינטרקום|קודן|בקרת כניסה/, 'אינטרקום'],
  [/סנפלינג|גובה|מנוף/, 'עבודות גובה'], [/איטום|זיפות|גגות/, 'איטום וגגות'], [/צבע|סיוד|טיח|שיפוץ/, 'צבע ושיפוצים'],
  [/חשמל|תאורה|לוח/, 'חשמל'], [/אינסטל|נזיל|צנרת|ביוב|סתימ/, 'אינסטלציה'], [/מזגנ|מיזוג/, 'מיזוג אוויר'],
  [/גינ|גנן|השקיה|גיזום/, 'גינון'], [/ניקיון|נקיון|פוליש/, 'ניקיון'], [/הדבר|מזיק|ג'?וק|מכרס/, 'הדברה'],
  [/מנעול|פריצ|צילינדר/, 'מנעולן'], [/שער|מחסום|דלתות אוטומ/, 'שערים ודלתות אוטומטיות'], [/דוד|סולאר/, 'דוד שמש'],
  [/כיבוי|ספרינקל|גילוי אש|מטפ/, 'כיבוי וגילוי אש'], [/גז/, 'גז מרכזי'], [/זכוכית|זגג|ויטרינ/, 'זגגות'],
  [/משאב|הידרופור|מאגר/, 'משאבות מים'], [/גנרטור/, 'גנרטור'], [/מעלית|מעליות/, 'מעליות'],
]
// Business auto-replies ("תודה שפנית…, אחזור בהקדם") are not information about the vendor.
const AUTO_REPLY = /תודה שיצרת קשר|תודה שפנית|תודה על פנייתכם|תודה על שפנית|קיבלתי את ההודעה|קיבלנו את ההודעה|אחזור אליך|נחזור אליכם|אחזור בהקדם|הודעה אוטומטית|automatic reply|מחוץ לשעות|הגעתם ל|ברוכים הבאים/i

async function recordVendorDetails(svc: SupabaseClient, vendor: Record<string, any>, text: string) {
  // Only details that come with an answer to the invite ("מאשר, גם מצלמות"); questions and chatter are not services.
  if (!/מאשר|מאושר|מעוניין|מסכים/.test(text) || /\?/.test(text)) return
  const extra = text.replace(/^\s*(מאשר|מסרב|לא מעוניין|מעוניין|אשר)[\s.,!-]*/u, '').trim()
  if (extra.length < 4 || AUTO_REPLY.test(text)) return
  const have = String(vendor.specialties || '')
  const trades = TRADE_WORDS.filter(([re, t]) => re.test(extra) && t !== vendor.category && !have.includes(t)).map(([, t]) => t)
  const date = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
  const note = `מהספק בוואטסאפ (${date}): ${extra.slice(0, 300)}`
  await svc.from('vendors').update({
    notes: [vendor.notes, note].filter(Boolean).join('\n'),
    ...(trades.length ? { specialties: [have, ...trades].filter(Boolean).join(', ') } : {}),
  }).eq('id', vendor.id)
}

// Template button parameters: [{ type: 'quick_reply', index, payload } | { type: 'url', index, text }]
function buttonComponents(list: unknown): Record<string, unknown>[] {
  if (!Array.isArray(list)) return []
  return list.slice(0, 10).map((b: any) => b?.type === 'url'
    ? { type: 'button', sub_type: 'url', index: String(b.index ?? 0), parameters: [{ type: 'text', text: String(b.text || '') }] }
    : { type: 'button', sub_type: 'quick_reply', index: String(b.index ?? 0), parameters: [{ type: 'payload', payload: String(b.payload || '') }] })
}

async function graph(integ: Integ | null, token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${graphBase(integ)}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data: j as Record<string, unknown> }
}

/**
 * Is this token the permanent one, or the 24-hour token from the API Setup
 * page? Pasting the temporary one is the most common way this integration
 * "works" on the day it is set up and is silently dead the next morning, and
 * nothing in the token string says which it is — only Meta knows.
 *
 * debug_token needs an app access token (app_id|app_secret). We hold the
 * secret but not the id, so ask the token which app it belongs to first.
 * Best-effort: any failure returns null and the connection check is unaffected.
 */
async function inspectToken(integ: Integ | null, token: string, appSecret?: string | null) {
  if (!appSecret) return null
  try {
    const app = await graph(integ, token, 'app?fields=id,name')
    const appId = app.ok ? String(app.data.id || '') : ''
    if (!appId) return null
    const d = await graph(integ, token,
      `debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`)
    if (!d.ok) return null
    const info = (d.data.data || {}) as Record<string, unknown>
    const expiresAt = Number(info.expires_at || 0)
    return {
      appName: String(app.data.name || ''),
      type: String(info.type || ''),
      valid: info.is_valid === true,
      // Meta reports 0 for a token that never expires — that is the one we want.
      permanent: expiresAt === 0,
      expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      scopes: Array.isArray(info.scopes) ? (info.scopes as string[]) : [],
    }
  } catch {
    return null
  }
}

const graphError = (d: Record<string, unknown>) => {
  const e = (d?.error || {}) as Record<string, unknown>
  return [e.code, e.error_user_msg || e.message].filter(Boolean).join(' — ') || 'graph_error'
}

async function hmacHex(secret: string, raw: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function findVendor(svc: SupabaseClient, phone: string) {
  const t = last9(phone)
  if (t.length < 9) return null
  const { data } = await svc.from('vendors').select('id, name, phone, membership_status, category, specialties, notes')
  return (data || []).find((v) => last9(v.phone) === t) || null
}

// Active resident with this phone, with the unit's building.
async function findResident(svc: SupabaseClient, phone: string) {
  const t = last9(phone)
  if (t.length < 9) return null
  const { data } = await svc.from('unit_residents')
    .select('unit_id, first_name, last_name, phone, archived, units!inner(building_id)')
    .eq('archived', false)
    .not('phone', 'is', null)
  const hit = (data || []).find((r) => last9(r.phone) === t)
  if (!hit) return null
  const units = hit.units as unknown as { building_id: string } | { building_id: string }[]
  const building_id = Array.isArray(units) ? units[0]?.building_id : units?.building_id
  return { ...hit, building_id }
}

async function callerBuildings(svc: SupabaseClient, uid: string) {
  const ids = new Set<string>()
  const { data: m } = await svc.from('building_memberships').select('building_id').eq('user_id', uid)
  ;(m || []).forEach((r) => r.building_id && ids.add(r.building_id))
  const { data: p } = await svc.from('profiles').select('building_id').eq('id', uid).maybeSingle()
  if (p?.building_id) ids.add(p.building_id)
  return ids
}

/**
 * Meta allows one webhook URL per app, and this app is shared with "אות",
 * whose incoming messages an Apps Script endpoint records to a sheet. Supabase
 * is the single receiver, so it has to pass every event on verbatim or that
 * sheet goes quiet.
 *
 * Verbatim means the raw bytes and the original signature header, so the
 * receiver can verify it against the same app secret. Never throws and never
 * delays the 200 past its own timeout: Meta retries anything slow, and a retry
 * would be delivered to Apps Script twice.
 */
async function forwardWebhook(svc: SupabaseClient, url: string | null | undefined, raw: string, signature: string) {
  if (!url) return
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature, 'X-Forwarded-By': 'vaadly' },
      body: raw,
      // An Apps Script /exec endpoint runs the script and THEN answers 302 to
      // script.googleusercontent.com. Following that redirect turns the POST
      // into a GET with no body, costs a second round trip inside our 4s
      // budget, and can fail long after the script already did its work —
      // which would fill the log with failures that never happened. The 3xx
      // is the success signal, so stop there.
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
    })
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    // A forward that quietly stops is the whole failure mode here, so make it
    // visible in the same log the admin already reads.
    await log(svc, {
      channel: 'whatsapp_in', recipient: '-', status: 'failed',
      subject: 'העברת אירוע webhook ל-Apps Script נכשלה',
      body: String(url).slice(0, 200),
      error_message: e instanceof Error ? e.message : 'forward_failed',
    })
  }
}

async function log(svc: SupabaseClient, row: Record<string, unknown>) {
  try { await svc.from('notification_log').insert({ channel: 'whatsapp', provider: PROVIDER, ...row }) } catch { /* */ }
}

// ── Webhook: inbound message from a vendor → membership reply handling ──────
async function handleInbound(svc: SupabaseClient, integ: Integ | null, token: string | null, msg: Record<string, unknown>) {
  const from = String(msg.from || '')
  const id = String(msg.id || '')
  if (id) {
    const { error: dup } = await svc.from('processed_webhooks').insert({ provider: PROVIDER, external_id: id })
    if (dup) return
  }
  const text = String((msg.text as Record<string, unknown>)?.body ||
    (msg.button as Record<string, unknown>)?.text ||
    ((msg.interactive as Record<string, unknown>)?.button_reply as Record<string, unknown>)?.title || '').trim()
  const vendor = await findVendor(svc, from)
  const resident = vendor ? null : await findResident(svc, from)

  await svc.from('notification_log').insert({
    channel: 'whatsapp_in', provider: PROVIDER,
    recipient: from, status: 'received', external_id: id || null,
    audience: vendor ? 'vendor' : resident ? 'resident' : 'other',
    vendor_id: vendor?.id || null,
    building_id: resident?.building_id || null, unit_id: resident?.unit_id || null,
    subject: vendor ? `הודעה נכנסת מספק: ${vendor.name}` : resident ? `הודעה נכנסת מדייר: ${resident.first_name || ''} ${resident.last_name || ''}`.trim() : 'הודעה נכנסת',
    body: text || `[${String(msg.type || 'message')}]`,
  }).then(() => {}, () => {})

  // Poll vote from a template quick-reply button: payload "poll:<pollId>:<optionIndex>".
  const payload = String((msg.button as Record<string, unknown>)?.payload ||
    ((msg.interactive as Record<string, unknown>)?.button_reply as Record<string, unknown>)?.id || '')

  // Committee decision on an open issue: "issue:<issueId>:<vaad1|vendor|self>".
  if (payload.startsWith('issue:')) {
    const [, issueId, action] = payload.split(':')
    const { data: res } = await svc.rpc('decide_issue_by_phone', { p_issue: issueId, p_phone: from, p_action: action })
    const { data: iss } = await svc.from('issues')
      .select('id, title, description, building_id, ticket_no, brief_token').eq('id', issueId).maybeSingle()
    const title = String(iss?.title || 'התקלה')
    const OK: Record<string, string> = {
      vaad1: `✅ נרשם: ועד1 תטפל ב"${title}" בביקור האחזקה הבא. השעות יירדו מהכרטיסייה או ייכנסו לחשבון החודשי.`,
      vendor: `✅ נרשם: ועד1 תתאם ספק ל"${title}". דמי הטיפול הקבועים נכנסו לחשבון החודשי, והצעת המחיר של הספק תגיע אליכם לאישור.`,
      self: `✅ נרשם: הוועד מטפל ב"${title}".`,
    }
    const reply = res === 'ok' ? OK[action]
      : res === 'already_decided' ? `כבר התקבלה החלטה על "${title}". אפשר לראות ולשנות באפליקציה.`
      : res === 'no_punches' ? 'הכרטיסייה של הבניין נגמרה, ולכן ההעברה לא בוצעה. אפשר לקנות כרטיסייה במסך "חשבון ועד1" או לבחור אפשרות אחרת.'
      : res === 'forbidden' ? 'ההחלטה שמורה לחברי ועד הבניין, והמספר הזה לא רשום כחבר ועד.'
      : 'ההחלטה לא נקלטה. אפשר להחליט באפליקציה.'
    if (integ?.enabled && integ.phone_number_id && token) {
      const r = await graph(integ, token, `${integ.phone_number_id}/messages`, {
        method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: reply } }),
      })
      await log(svc, {
        recipient: from, audience: 'resident', building_id: iss?.building_id || null,
        subject: `החלטת ועד בוואטסאפ: ${title.slice(0, 120)}`, body: reply,
        status: r.ok ? 'sent' : 'failed', error_message: r.ok ? null : graphError(r.data),
      })
      // ועד1's handyman hears about the job at once.
      if (res === 'ok' && action === 'vaad1' && iss) {
        const { data: hm } = await svc.from('vendors').select('id, name, phone').eq('is_internal', true).limit(1).maybeSingle()
        const { data: t } = await svc.from('message_templates').select('*').eq('key', 'vendor_issue_dispatch').maybeSingle()
        const { data: b } = await svc.from('buildings').select('name, street, house_number, city').eq('id', iss.building_id).maybeSingle()
        const to = toE164(String(hm?.phone || ''))
        if (hm && to && t?.meta_status === 'APPROVED') {
          const vars = [hm.name, [b?.street, b?.house_number, b?.city].filter(Boolean).join(' ') || String(b?.name || ''),
            `${iss.description || iss.title}${iss.brief_token ? ` | פרטים ותמונות: https://app.vaad1.co.il/brief/${iss.brief_token}` : ''}`,
            'ועד הבית'].map(cleanParam)
          const g = await graph(integ, token, `${integ.phone_number_id}/messages`, {
            method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template',
              template: { name: t.meta_name, language: { code: t.language || 'he' }, components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } }),
          })
          await log(svc, {
            recipient: to, audience: 'vendor', vendor_id: hm.id, template_key: 'vendor_issue_dispatch', building_id: iss.building_id,
            subject: t.title, body: render(t.body, vars), status: g.ok ? 'sent' : 'failed', delivery_status: g.ok ? 'sent' : null,
            external_id: ((g.data?.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || null,
            error_message: g.ok ? null : graphError(g.data),
          })
        }
      }
    }
    return
  }

  if (payload.startsWith('poll:')) {
    const [, pollId, idx] = payload.split(':')
    const { data: res } = await svc.rpc('cast_poll_vote_by_phone', { p_poll: pollId, p_phone: from, p_option: Number(idx) })
    const { data: poll } = await svc.from('polls').select('title, options').eq('id', pollId).maybeSingle()
    const choice = Array.isArray(poll?.options) ? String(poll.options[Number(idx)] ?? '') : ''
    const reply = res === 'ok'
      ? `✅ הקול של הדירה שלך נקלט: *${choice}*\nאפשר לשנות בלחיצה על כפתור אחר עד שההצבעה נסגרת.`
      : res === 'poll_closed' ? 'ההצבעה כבר נסגרה, והקול לא נקלט.'
      : res === 'owners_only' ? 'ההצבעה מיועדת לבעלי דירות בלבד. אם את/ה בעל/ת הדירה, יש לעדכן את פרטי הבעלות מול הוועד.'
      : 'לא מצאנו דירה בבניין שרשומה עם המספר הזה, ולכן הקול לא נקלט. אפשר להצביע דרך הקישור בהודעה.'
    if (integ?.enabled && integ.phone_number_id && token) {
      const r = await graph(integ, token, `${integ.phone_number_id}/messages`, {
        method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: reply } }),
      })
      await log(svc, {
        recipient: from, audience: 'resident', building_id: resident?.building_id || null, unit_id: resident?.unit_id || null,
        subject: `אישור הצבעה בוואטסאפ: ${String(poll?.title || '').slice(0, 120)}`, body: reply,
        status: r.ok ? 'sent' : 'failed', error_message: r.ok ? null : graphError(r.data),
      })
    }
    return
  }

  if (!vendor || !text) return
  await recordVendorDetails(svc, vendor, text).catch(() => {})
  const declineRe = /מסרב|סירוב|לא מעוניין|לא מתאים|הסר אותי|תסיר/
  // Whole words only: "כאשר אין מענה" and "לפני שאאשר" are not approvals.
  const approveRe = /(^|[^א-ת])(מאשר|מאשרת|מאושר|מסכים|מסכימה|מעוניין|מעוניינת)(?![א-ת])/
  const newStatus = declineRe.test(text) ? 'declined' : approveRe.test(text) ? 'agreed' : null
  const current = vendor.membership_status || 'pending'
  // Opting out is always honoured, also after an earlier "מאשר".
  const allowedFrom = newStatus === 'agreed' ? ['pending', 'invited', 'declined'] : ['pending', 'invited', 'agreed']
  if (!newStatus || !allowedFrom.includes(current)) return
  await svc.from('vendors').update({ membership_status: newStatus }).eq('id', vendor.id)

  // The vendor just wrote to us, so the 24h service window is open — free text is allowed.
  if (integ?.enabled && integ.phone_number_id && token) {
    const ack = newStatus === 'agreed'
      ? 'תודה! נרשמת כספק מאושר במאגר ועד1 — נפנה אליך כשתהיה קריאה מתאימה.\nמכירים ועד בית שמחפש סדר? ספק שמביא בניין מקבל קדימות בפניות. אפשר פשוט להשיב כאן.'
      : 'תודה על המענה, הוסרת מרשימת הפניות. אם תתחרט — כתוב "מאשר".'
    const r = await graph(integ, token, `${integ.phone_number_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: ack } }),
    })
    await log(svc, {
      recipient: from, audience: 'vendor', vendor_id: vendor.id,
      subject: `אישור אוטומטי לתשובת ספק (${newStatus === 'agreed' ? 'אישר' : 'סירב'})`,
      body: ack, status: r.ok ? 'sent' : 'failed',
      external_id: ((r.data?.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || null,
      error_message: r.ok ? null : graphError(r.data),
    })
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const svc = serviceClient()

  try {
    // ── Meta webhook verification handshake ───────────────────────────────
    if (req.method === 'GET') {
      const u = new URL(req.url)
      const { sec } = await loadConfig(svc)
      const ok = u.searchParams.get('hub.mode') === 'subscribe' && !!sec?.webhook_token &&
        timingSafeEqual(u.searchParams.get('hub.verify_token') || '', sec.webhook_token)
      return ok
        ? new Response(u.searchParams.get('hub.challenge') || '', { status: 200 })
        : new Response('forbidden', { status: 403 })
    }

    const raw = await req.text()
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(raw || '{}') } catch { /* */ }

    // ── Meta webhook event ────────────────────────────────────────────────
    if (body.object === 'whatsapp_business_account') {
      const { integ, sec } = await loadConfig(svc)
      const sig = (req.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '')
      // Fail closed: without an app secret we cannot authenticate Meta.
      if (!sec?.app_secret || !sig || !timingSafeEqual(sig, await hmacHex(sec.app_secret, raw))) {
        return json({ error: 'bad_signature' }, 401)
      }
      // Pass it on while we process our own copy — "אות" must not lose events
      // because something in our handling was slow or threw.
      const forwarded = forwardWebhook(svc, integ?.forward_webhook_url, raw,
        req.headers.get('X-Hub-Signature-256') || '')
      for (const entry of (body.entry as Array<Record<string, unknown>>) || []) {
        for (const ch of (entry.changes as Array<Record<string, unknown>>) || []) {
          const v = (ch.value || {}) as Record<string, unknown>
          if (ch.field === 'message_template_status_update') {
            const name = String(v.message_template_name || '')
            // A re-worded version in review (vaad1_<key>) replaces the live
            // one when Meta approves it; until then the live row is untouched.
            const { data: wasUpgrade } = name ? await svc.rpc('apply_template_upgrade', {
              p_name: name, p_status: String(v.event || ''), p_meta_id: v.message_template_id ? String(v.message_template_id) : '',
              p_reason: v.reason ? String(v.reason) : '',
            }) : { data: false }
            if (name && !wasUpgrade) {
              await svc.from('message_templates').update({
                meta_status: String(v.event || '').toUpperCase() || 'PENDING',
                meta_id: v.message_template_id ? String(v.message_template_id) : undefined,
                rejection_reason: v.reason && v.reason !== 'NONE' ? String(v.reason) : null,
                updated_at: new Date().toISOString(),
                // Matched on meta_name: the WABA carries אות's templates too,
                // and one of theirs may share our bare key.
              }).eq('meta_name', name)
            }
            continue
          }
          for (const st of (v.statuses as Array<Record<string, unknown>>) || []) {
            const err = (st.errors as Array<Record<string, unknown>>)?.[0]
            let upd = svc.from('notification_log').update({
              delivery_status: String(st.status || ''),
              ...(st.status === 'failed' ? { status: 'failed', error_message: String(err?.title || err?.message || 'failed') } : {}),
              updated_at: new Date().toISOString(),
            }).eq('external_id', String(st.id || ''))
            if (st.status === 'sent') upd = upd.not('delivery_status', 'in', '("delivered","read")')
            if (st.status === 'delivered') upd = upd.neq('delivery_status', 'read')
            const { data: rows } = await upd.select('vendor_id, template_key')
            if (st.status === 'failed') {
              for (const row of rows || []) {
                if (row.vendor_id && String(row.template_key || '').startsWith('vendor_invite')) {
                  await svc.from('vendors').update({ membership_status: 'pending', invited_at: null })
                    .eq('id', row.vendor_id).eq('membership_status', 'invited')
                }
              }
            }
          }
          for (const m of (v.messages as Array<Record<string, unknown>>) || []) {
            await handleInbound(svc, integ, sec?.api_token || null, m)
          }
        }
      }
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime
      if (rt?.waitUntil) rt.waitUntil(forwarded); else await forwarded
      return json({ ok: true })
    }

    // ── Enrollment: the credential holder posts the token itself ──────────
    // No JWT, by design. The token for this number already exists on the
    // machine that runs אות's automation; this lets that machine hand it over
    // directly instead of routing a secret through a chat log, a clipboard or
    // an assistant. The code is single-use, short-lived, and only ever stored
    // hashed — and it can only write a credential, never read one back.
    if (body.action === 'enroll') {
      const code = String(body.code || '')
      if (code.length < 20) return json({ error: 'bad_code' }, 400)
      const hash = Array.from(new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
      )).map((b) => b.toString(16).padStart(2, '0')).join('')

      const { data: row } = await svc.from('messaging_enrollment')
        .select('id, provider, expires_at, used_at')
        .eq('code_hash', hash).is('used_at', null).maybeSingle()
      if (!row || new Date(row.expires_at) < new Date()) return json({ error: 'code_invalid_or_expired' }, 403)

      const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : ''
      const appSecret = typeof body.app_secret === 'string' ? body.app_secret.trim() : ''
      if (!accessToken && !appSecret) return json({ error: 'nothing_to_store' }, 400)

      // Burn the code first: a retry must not get a second write.
      await svc.from('messaging_enrollment').update({ used_at: new Date().toISOString() }).eq('id', row.id)

      const { sec: cur } = await loadConfig(svc)
      await svc.from('messaging_secrets').upsert({
        provider: row.provider,
        webhook_token: cur?.webhook_token || crypto.randomUUID().replace(/-/g, ''),
        ...(accessToken ? { api_token: accessToken } : {}),
        ...(appSecret ? { app_secret: appSecret } : {}),
        updated_at: new Date().toISOString(),
      })
      if (accessToken) {
        await svc.from('messaging_integrations')
          .update({ has_token: true, updated_at: new Date().toISOString() })
          .eq('provider', row.provider)
      }

      // Say whether it actually works, so the sender learns the answer now
      // rather than from a silent failure later. Never echo the value.
      const { integ: i2 } = await loadConfig(svc)
      let works: boolean | null = null
      if (accessToken && i2?.phone_number_id) {
        const r = await graph(i2, accessToken, `${i2.phone_number_id}?fields=display_phone_number,verified_name`)
        works = r.ok
      }
      return json({ ok: true, stored: { access_token: !!accessToken, app_secret: !!appSecret }, token_works: works })
    }

    // ── App actions: signed-in admin / committee only ─────────────────────
    // The daily scheduler may do exactly one thing: pull template statuses from Meta.
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const isCron = !!cronSecret && timingSafeEqual(req.headers.get('x-cron-secret') || '', cronSecret)
      && String(body.action || '') === 'refresh-templates'
    let isAdmin = isCron
    let uid = ''
    if (!isCron) {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: userData } = await svc.auth.getUser(jwt)
      uid = userData?.user?.id || ''
      if (!uid) return json({ error: 'unauthorized' }, 401)
      const { data: prof } = await svc.from('profiles').select('role').eq('id', uid).maybeSingle()
      const role = prof?.role || ''
      if (!['admin', 'committee'].includes(role)) return json({ error: 'forbidden' }, 403)
      isAdmin = role === 'admin'
    }

    const action = String(body.action || '')
    let { integ, sec } = await loadConfig(svc)
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp`

    if (action === 'config') {
      return json({
        ok: true,
        config: integ ? {
          phone_number_id: integ.phone_number_id, waba_id: integ.waba_id, graph_version: integ.graph_version,
          enabled: !!integ.enabled, sender_label: integ.sender_label, display_number: integ.display_number,
          verified_name: integ.verified_name, status: integ.status,
          forward_webhook_url: integ.forward_webhook_url,
        } : null,
        has_token: !!sec?.api_token, has_app_secret: !!sec?.app_secret,
        ...(isAdmin ? { webhook_url: webhookUrl, verify_token: sec?.webhook_token || null } : {}),
      })
    }

    if (action === 'save') {
      if (!isAdmin) return json({ error: 'forbidden' }, 403)
      const cfg = (body.config || {}) as Record<string, unknown>
      const s = (k: string) => (typeof cfg[k] === 'string' && (cfg[k] as string).trim()) ? (cfg[k] as string).trim() : null
      const token = typeof body.access_token === 'string' ? body.access_token.trim() : ''
      const appSecret = typeof body.app_secret === 'string' ? body.app_secret.trim() : ''
      await svc.from('messaging_integrations').upsert({
        provider: PROVIDER,
        phone_number_id: s('phone_number_id'), waba_id: s('waba_id'),
        graph_version: s('graph_version') || 'v21.0', sender_label: s('sender_label'),
        forward_webhook_url: s('forward_webhook_url'),
        enabled: cfg.enabled === true,
        ...(token ? { has_token: true } : {}),
        updated_at: new Date().toISOString(),
      })
      const verify = sec?.webhook_token || crypto.randomUUID().replace(/-/g, '')
      await svc.from('messaging_secrets').upsert({
        provider: PROVIDER,
        webhook_token: verify,
        ...(token ? { api_token: token } : {}),
        ...(appSecret ? { app_secret: appSecret } : {}),
        updated_at: new Date().toISOString(),
      })
      ;({ integ, sec } = await loadConfig(svc))
      return json({ ok: true, has_token: !!sec?.api_token, has_app_secret: !!sec?.app_secret, webhook_url: webhookUrl, verify_token: verify })
    }

    // Readiness check. Deliberately above the not_configured guard: the whole
    // point is to find rejectable templates BEFORE the Meta keys are in place,
    // so the first sync is not a wall of rejections.
    if (action === 'check-templates') {
      const { data: tpls } = await svc.from('message_templates').select('key, meta_name, title, category, language, body, variables, example, active')
      const checked = (tpls || []).filter((t) => t.active).map((t) => ({
        key: t.key, title: t.title, problems: templateProblems(t as Tpl),
      }))
      return json({
        ok: true,
        total: checked.length,
        ready: checked.filter((c) => !c.problems.length).length,
        blocked: checked.filter((c) => c.problems.length),
      })
    }

    const token = sec?.api_token
    if (!integ?.phone_number_id || !token) return json({ ok: false, error: 'not_configured' })

    if (action === 'status') {
      const r = await graph(integ, token, `${integ.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status`)
      await svc.from('messaging_integrations').update({
        status: r.ok ? String(r.data.quality_rating || 'CONNECTED') : `error_${r.status}`,
        display_number: r.ok ? String(r.data.display_phone_number || '') : integ.display_number,
        verified_name: r.ok ? String(r.data.verified_name || '') : integ.verified_name,
        last_checked_at: new Date().toISOString(),
      }).eq('provider', PROVIDER)
      return json({
        ok: r.ok, info: r.data, token: await inspectToken(integ, token, sec?.app_secret),
        error: r.ok ? undefined : graphError(r.data),
      })
    }

    if (action === 'refresh-templates' || action === 'sync-templates') {
      if (!isAdmin) return json({ error: 'forbidden' }, 403)
      if (!integ.waba_id) return json({ ok: false, error: 'waba_id_missing' })
      const submitted: Array<{ key: string; ok: boolean; error?: string }> = []
      if (action === 'sync-templates') {
        const { data: tpls } = await svc.from('message_templates').select('*').eq('active', true)
        for (const t of tpls || []) {
          if (!['draft', 'REJECTED'].includes(t.meta_status)) continue
          // Never spend a submission on a body Meta will reject on sight.
          const bad = templateProblems(t as Tpl)
          if (bad.length) {
            submitted.push({ key: t.key, ok: false, error: bad.join(' • ') })
            await svc.from('message_templates').update({
              rejection_reason: bad.join(' • '), updated_at: new Date().toISOString(),
            }).eq('key', t.key)
            continue
          }
          const ex = (t.example || []) as string[]
          const component: Record<string, unknown> = { type: 'BODY', text: t.body }
          if (ex.length) component.example = { body_text: [ex.map(cleanParam)] }

          // A template name exists only once per WABA, so one Meta already
          // knows has to be EDITED, not created again. Creating it a second
          // time comes back "template name already exists", which is how a
          // REJECTED template used to become unrecoverable from the app: the
          // only route left was WhatsApp Manager by hand.
          const r = t.meta_id
            ? await graph(integ, token, String(t.meta_id), {
              method: 'POST',
              body: JSON.stringify({ category: t.category, components: [component] }),
            })
            : await graph(integ, token, `${integ.waba_id}/message_templates`, {
              method: 'POST',
              body: JSON.stringify({ name: t.meta_name, language: t.language || 'he', category: t.category, components: [component] }),
            })
          submitted.push({ key: t.key, ok: r.ok, error: r.ok ? undefined : graphError(r.data) })
          if (r.ok) {
            await svc.from('message_templates').update({
              // An edit answers {success:true} with no status and re-enters
              // review, so PENDING is the right reading of both shapes. Never
              // blank an existing meta_id with the edit response's absent id.
              meta_status: String(r.data.status || 'PENDING'),
              ...(r.data.id ? { meta_id: String(r.data.id) } : {}),
              rejection_reason: null, updated_at: new Date().toISOString(),
            }).eq('key', t.key)
          }
        }
      }
      // Pull current statuses for everything Meta knows about.
      const r = await graph(integ, token, `${integ.waba_id}/message_templates?fields=name,status,id,rejected_reason,language,category&limit=200`)
      if (r.ok) {
        for (const t of (r.data.data as Array<Record<string, unknown>>) || []) {
          const { data: wasUpgrade } = await svc.rpc('apply_template_upgrade', {
            p_name: String(t.name || ''), p_status: String(t.status || ''), p_meta_id: String(t.id || ''),
            p_reason: t.rejected_reason ? String(t.rejected_reason) : '',
            p_category: t.category ? String(t.category) : null,
          })
          if (wasUpgrade) continue
          await svc.from('message_templates').update({
            meta_status: String(t.status || ''), meta_id: String(t.id || ''),
            // Meta re-categorises during review (several of ours went
            // UTILITY → MARKETING, which costs more and is subject to
            // marketing opt-outs). We already asked for the field; store it,
            // so the app shows what Meta decided rather than what we asked for.
            ...(t.category ? { category: String(t.category) } : {}),
            rejection_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason) : null,
            updated_at: new Date().toISOString(),
            // Only ours: the listing includes every template on the shared WABA.
          }).eq('meta_name', String(t.name || ''))
        }
      }
      return json({ ok: r.ok, submitted, error: r.ok ? undefined : graphError(r.data) })
    }

    // ── Send issues that wait for a decision to the building's committee, with
    // decision buttons. In-session (the member wrote to us in the last 24h) it
    // is an interactive message; otherwise the approved template. ──
    if (action === 'issue-decision') {
      if (!integ?.enabled || !integ.phone_number_id || !token) return json({ ok: false, error: 'integration_disabled' })
      let q = svc.from('issues').select('id, title, description, building_id, created_at, ticket_no, handler, status, assigned_to')
        .is('handler', null).not('status', 'in', '("completed","resolved","closed","rejected")').order('created_at')
      if (body.issueId) q = q.eq('id', body.issueId)
      else if (body.buildingId) q = q.eq('building_id', body.buildingId)
      else return json({ ok: false, error: 'issue_or_building_required' }, 400)
      const { data: issues } = await q.limit(30)
      if (!issues?.length) return json({ ok: true, sent: 0, issues: 0 })
      const mine = isAdmin ? null : await callerBuildings(svc, uid)
      if (mine && issues.some((i) => !mine.has(i.building_id))) return json({ error: 'forbidden' }, 403)

      const { data: tpl } = await svc.from('message_templates').select('*').eq('key', 'committee_issue_decision').maybeSingle()
      const since = new Date(Date.now() - 23.5 * 3600 * 1000).toISOString()
      let sent = 0, skipped = 0, failed = 0
      const phonesByBuilding = new Map<string, string[]>()
      for (const iss of issues) {
        let phones = phonesByBuilding.get(iss.building_id)
        if (!phones) {
          const { data: rows } = await svc.from('unit_residents')
            .select('phone, units!inner(building_id, board_member)')
            .eq('units.building_id', iss.building_id).eq('units.board_member', true).eq('archived', false)
          phones = [...new Set((rows || []).map((r) => toE164(String(r.phone || ''))).filter((x): x is string => !!x && /^9725\d{8}$/.test(x)))]
          // Admin can try it on one number first.
          if (isAdmin && body.onlyPhone) { const one = toE164(String(body.onlyPhone)); phones = one ? [one] : [] }
          phonesByBuilding.set(iss.building_id, phones)
        }
        // Routed issue → its assigned committee member; unassigned → the whole committee.
        if (iss.assigned_to && !(isAdmin && body.onlyPhone)) {
          const { data: owner } = await svc.from('unit_residents').select('phone').eq('id', iss.assigned_to).maybeSingle()
          const one = toE164(String(owner?.phone || ''))
          if (one && /^9725\d{8}$/.test(one)) phones = [one]
        }
        const { data: b } = await svc.from('buildings').select('name').eq('id', iss.building_id).maybeSingle()
        const days = String(Math.max(0, Math.floor((Date.now() - new Date(iss.created_at).getTime()) / 86400000)))
        const what = `${iss.ticket_no ? `#${iss.ticket_no} ` : ''}${iss.title}`
        const ids = ['vaad1', 'vendor', 'self'].map((a) => `issue:${iss.id}:${a}`)
        for (const to of phones) {
          const { data: recent } = await svc.from('notification_log').select('id')
            .eq('channel', 'whatsapp_in').eq('recipient', to).gte('created_at', since).limit(1)
          let payload: Record<string, unknown> | null = null
          const text = `תקלה ב${b?.name || 'בניין'} ממתינה להחלטת הוועד:\n*${what}*\nפתוחה ${days} ימים.${iss.description ? `\n${String(iss.description).slice(0, 300)}` : ''}\n\nועד1 תטפל: איש האחזקה שלנו בביקור הבא, לפי שעות.\nספק דרך ועד1: אנחנו מתאמים ספק, בדמי טיפול קבועים.\nהוועד יטפל: נשאר אצלכם.`
          if (recent?.length) {
            payload = { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text },
              action: { buttons: [['ועד1 תטפל', ids[0]], ['ספק דרך ועד1', ids[1]], ['הוועד יטפל', ids[2]]].map(([title, id]) => ({ type: 'reply', reply: { id, title } })) } } }
          } else if (tpl?.meta_status === 'APPROVED') {
            const vars = [cleanParam(b?.name || 'הבניין'), cleanParam(what), days]
            payload = { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl.meta_name, language: { code: tpl.language || 'he' },
              components: [{ type: 'body', parameters: vars.map((t) => ({ type: 'text', text: t })) },
                ...buttonComponents(ids.map((id, index) => ({ type: 'quick_reply', index, payload: id })))] } }
          }
          if (!payload) { skipped++; continue }
          const g = await graph(integ, token, `${integ.phone_number_id}/messages`, { method: 'POST', body: JSON.stringify(payload) })
          if (g.ok) sent++; else failed++
          await log(svc, {
            recipient: to, audience: 'resident', template_key: 'committee_issue_decision', building_id: iss.building_id,
            subject: `להחלטת הוועד: ${String(what).slice(0, 150)}`, body: text,
            status: g.ok ? 'sent' : 'failed', delivery_status: g.ok ? 'sent' : null,
            external_id: ((g.data?.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || null,
            error_message: g.ok ? null : graphError(g.data), sent_by: uid,
          })
          await new Promise((res) => setTimeout(res, 400))
        }
      }
      return json({ ok: true, issues: issues.length, sent, skipped, failed, template: tpl?.meta_status || null })
    }

    // ── Committee: send an open poll to the building's residents on WhatsApp,
    // with vote buttons (default options) or a link (custom options). ──
    if (action === 'poll-whatsapp') {
      if (!integ?.enabled || !integ.phone_number_id || !token) return json({ ok: false, error: 'integration_disabled' })
      const { data: poll } = await svc.from('polls').select('*').eq('id', body.pollId).maybeSingle()
      if (!poll) return json({ ok: false, error: 'poll_not_found' }, 404)
      if (!isAdmin && !(await callerBuildings(svc, uid)).has(poll.building_id)) return json({ error: 'forbidden' }, 403)
      if (poll.status !== 'open' || (poll.closes_at && new Date(poll.closes_at) <= new Date())) return json({ ok: false, error: 'poll_closed' })
      const opts = (poll.options || []) as string[]
      const withButtons = opts.length === 3 && opts[0] === 'בעד' && opts[1] === 'נגד' && opts[2] === 'נמנע'
      const key = withButtons ? 'resident_poll' : 'resident_poll_link'
      const { data: t } = await svc.from('message_templates').select('*').eq('key', key).maybeSingle()
      if (!t || t.meta_status !== 'APPROVED') return json({ ok: false, error: 'template_not_approved', template: key, status: t?.meta_status || null })
      const { data: b } = await svc.from('buildings').select('name').eq('id', poll.building_id).maybeSingle()
      const { data: rows } = await svc.from('unit_residents')
        .select('phone, resident_type, unit_id, units!inner(building_id)')
        .eq('units.building_id', poll.building_id).eq('archived', false)
      const seen = new Set<string>(), recipients: { to: string; unit_id: string }[] = []
      for (const r of rows || []) {
        if (poll.owners_only && r.resident_type !== 'owner') continue
        const to = toE164(String(r.phone || ''))
        if (!to || !/^9725\d{8}$/.test(to) || seen.has(to)) continue
        seen.add(to); recipients.push({ to, unit_id: r.unit_id })
      }
      if (body.dryRun) return json({ ok: true, recipients: recipients.length, buttons: withButtons })
      const until = poll.closes_at
        ? new Date(poll.closes_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
        : 'סגירה על ידי הוועד'
      const vars = [cleanParam(b?.name || 'הבניין'), cleanParam(poll.title), cleanParam(until)]
      const buttons = [
        ...(withButtons ? [0, 1, 2].map((i) => ({ type: 'quick_reply', index: i, payload: `poll:${poll.id}:${i}` })) : []),
        { type: 'url', index: withButtons ? 3 : 0, text: String(poll.id) },
      ]
      let sent = 0, failed = 0
      for (const r of recipients) {
        const payload = {
          messaging_product: 'whatsapp', to: r.to, type: 'template',
          template: { name: t.meta_name, language: { code: t.language || 'he' }, components: [
            { type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }, ...buttonComponents(buttons)] },
        }
        const g = await graph(integ, token, `${integ.phone_number_id}/messages`, { method: 'POST', body: JSON.stringify(payload) })
        if (g.ok) sent++; else failed++
        await log(svc, {
          recipient: r.to, audience: 'resident', template_key: key, building_id: poll.building_id, unit_id: r.unit_id,
          subject: `הצבעה: ${String(poll.title).slice(0, 150)}`, body: render(t.body, vars),
          status: g.ok ? 'sent' : 'failed', delivery_status: g.ok ? 'sent' : null,
          external_id: ((g.data?.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || null,
          error_message: g.ok ? null : graphError(g.data), sent_by: uid,
        })
        await new Promise((res) => setTimeout(res, 150))
      }
      await svc.from('polls').update({ wa_sent_at: new Date().toISOString(), wa_sent_count: sent }).eq('id', poll.id)
      return json({ ok: true, sent, failed, recipients: recipients.length, buttons: withButtons })
    }

    if (action === 'send' || action === 'send-text') {
      if (!integ.enabled) return json({ ok: false, error: 'integration_disabled' })
      const audience = String(body.audience || '')
      const to = toE164(String(body.to || ''))
      if (!to) return json({ ok: false, error: 'bad_number' })

      // Recipient guard.
      let vendorId: string | null = null, buildingId: string | null = (body.buildingId as string) || null
      let unitId: string | null = (body.unitId as string) || null
      if (audience === 'vendor') {
        const v = await findVendor(svc, to)
        if (!v) {
          await log(svc, { recipient: to, audience, status: 'blocked', subject: 'נחסם: המספר אינו ספק במאגר', body: '', sent_by: uid, error_message: 'not_a_vendor' })
          return json({ ok: false, error: 'not_a_vendor' }, 403)
        }
        vendorId = v.id
      } else if (audience === 'resident') {
        const r = await findResident(svc, to)
        const allowed = r && (isAdmin || (await callerBuildings(svc, uid)).has(r.building_id))
        if (!r || !allowed) {
          await log(svc, { recipient: to, audience, status: 'blocked', subject: 'נחסם: המספר אינו דייר פעיל בבניין שלך', body: '', sent_by: uid, error_message: 'not_your_resident' })
          return json({ ok: false, error: 'not_your_resident' }, 403)
        }
        buildingId = r.building_id; unitId = r.unit_id
      } else {
        return json({ ok: false, error: 'audience_required' }, 400)
      }

      let payload: Record<string, unknown>, subject: string, rendered: string, templateKey: string | null = null
      if (action === 'send') {
        templateKey = String(body.templateKey || '')
        let { data: t } = await svc.from('message_templates').select('*').eq('key', templateKey).maybeSingle()
        // Pool invite: prefer the version with "מאשר" / "לא מעוניין" buttons once Meta approves it.
        if (templateKey === 'vendor_invite') {
          const { data: btn } = await svc.from('message_templates').select('*').eq('key', 'vendor_invite_btn2').maybeSingle()
          if (btn?.active && btn.meta_status === 'APPROVED') t = btn
        }
        if (!t || !t.active) return json({ ok: false, error: 'template_not_found' }, 404)
        if (t.audience !== audience) return json({ ok: false, error: 'template_audience_mismatch' }, 400)
        if (MANUAL_CONFIRM_TEMPLATES.has(t.key) && body.confirmManual !== true) {
          return json({ ok: false, error: 'manual_confirmation_required' }, 400)
        }
        if (t.meta_status !== 'APPROVED') return json({ ok: false, error: 'template_not_approved', status: t.meta_status })
        const vars = ((body.variables || []) as unknown[]).map(cleanParam)
        const needed = ((t.variables || []) as unknown[]).length
        if (vars.length < needed) return json({ ok: false, error: 'missing_variables' }, 400)
        payload = {
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: t.meta_name, language: { code: t.language || 'he' },
            components: [
              ...(needed ? [{ type: 'body', parameters: vars.slice(0, needed).map((text) => ({ type: 'text', text })) }] : []),
              ...buttonComponents(body.buttons),
            ],
          },
        }
        subject = t.title
        rendered = render(t.body, vars)
      } else {
        const text = String(body.text || '').trim()
        if (!text) return json({ ok: false, error: 'text_required' }, 400)
        payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4096) } }
        subject = 'הודעה חופשית'
        rendered = text
      }

      const r = await graph(integ, token, `${integ.phone_number_id}/messages`, { method: 'POST', body: JSON.stringify(payload) })
      const wamid = ((r.data?.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || null
      await log(svc, {
        recipient: to, audience, template_key: templateKey, subject, body: rendered,
        status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null,
        external_id: wamid, error_message: r.ok ? null : graphError(r.data),
        building_id: buildingId, unit_id: unitId, vendor_id: vendorId, sent_by: uid,
      })
      // A delivered pool invite moves the vendor from "pending" to "invited".
      if (r.ok && templateKey === 'vendor_invite' && vendorId) {
        await svc.from('vendors').update({ membership_status: 'invited', invited_at: new Date().toISOString() })
          .eq('id', vendorId).eq('membership_status', 'pending')
      }
      return json({ ok: r.ok, id: wamid, error: r.ok ? undefined : graphError(r.data) })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})
