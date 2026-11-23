// Job offers over WhatsApp — to vendors (for a quote) and to ועד1's handyman.
//
// Vendor:
//   1. "יש עבודה חדשה" + [מעוניין לתת הצעה] [לא מעוניין] — task and address only,
//      no contacts. A deadline: 24h, or 2h for an urgent issue.
//   2. Interested → link to details and photos, ask for the price BEFORE VAT,
//      final for the job as described; "ביקור" asks to see the place first.
//   3. A number → the quote, which holds the availability the offer asked for:
//      today for an urgent issue, within 7 days otherwise. No date haggling.
//   4. When every vendor answered (or the deadline passed) the CHEAPEST quote
//      is marked recommended and only that one goes to the committee, with
//      [סוגרים איתו] [תאמו ולוו אותנו] [לא מתאים]. ועד1 sees all of them.
//   5. "סוגרים איתו": the committee gets the vendor's phone and coordinates
//      directly; the vendor gets the committee member. "תאמו ולוו אותנו":
//      ועד1 coordinates and the handyman accompanies (a handyman hour).
//      "לא מתאים": the next cheapest goes to the committee.
//      Everyone not chosen hears the job was taken.
// Handyman:
//   "עבודה חדשה" + [אגיע] [לא יכול] → when he will come.
//
// All prices are before VAT. Every message opens with "כאן ועד1" (the sender
// name on this number belongs to another business).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rankVendorsForIssue, QUOTE_FANOUT, vendorGreeting } from '../_shared/vendorMatch.js'
import { decideHandling, isDiagnosis, isUrgent, routeFor } from '../_shared/handling.js'
import { taskIssueCategory, taskLeadDays } from '../_shared/tradeGroups.js'

const APP = 'https://app.vaad1.co.il'
const OPEN_STAGES = ['offered', 'awaiting_amount', 'visit_requested', 'awaiting_date']
const BEFORE_AMOUNT = ['offered', 'awaiting_amount', 'visit_requested']
const DECLINE = /לא מעוניין|לא מעונין|לא רלוונטי|לא מתאים|לא יכול|לא אוכל|מסרב|לא תודה/
const AUTO_REPLY = /תודה שיצרת קשר|תודה שפנית|תודה על פנייתכם|תודה על שפנ|נחזור אליך|נחזור אליכם|שעות הפעילות|שעות פתיחה|כאשר אין מענה/

export type JobCtx = {
  svc: SupabaseClient
  ready: boolean
  send: (payload: Record<string, unknown>) => Promise<{ ok: boolean; wamid: string | null; error: string | null }>
  log: (row: Record<string, unknown>) => Promise<void>
  toE164: (phone: string) => string | null
  cleanParam: (v: unknown) => string
  render: (body: string, vars: string[]) => string
}

const nis = (n: unknown) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const ilWhen = (d: Date) => d.toLocaleString('he-IL', {
  timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const ilDay = (d: Date) => d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' })
const briefLink = (token: string | null) => (token ? `${APP}/brief/${token}` : '')
const addressOf = (b: Record<string, any> | null) =>
  (b ? `${[b.street, b.house_number].filter(Boolean).join(' ')}${b.city ? `, ${b.city}` : ''}`.replace(/^, /, '') || String(b.name || '') : '')

// "1,200", "₪850", "850 ש"ח" → 1200 / 850. Null when no plausible amount.
export function parseAmount(text: string): number | null {
  const m = String(text || '').replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return n >= 20 && n <= 2_000_000 ? Math.round(n * 100) / 100 : null
}

async function windowOpen(svc: SupabaseClient, to: string) {
  const since = new Date(Date.now() - 23.5 * 3600 * 1000).toISOString()
  const { data } = await svc.from('notification_log').select('id')
    .eq('channel', 'whatsapp_in').eq('recipient', to).gte('created_at', since).limit(1)
  return !!data?.length
}

async function reply(ctx: JobCtx, to: string, body: string, meta: Record<string, unknown>) {
  if (!ctx.ready) return { ok: false, wamid: null, error: 'integration_disabled' }
  const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096) } })
  await ctx.log({
    recipient: to, audience: 'vendor', body, status: r.ok ? 'sent' : 'failed',
    delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, ...meta,
  })
  return r
}

async function emailAdmins(svc: SupabaseClient, subject: string, lines: string[], buildingId: string | null) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join('')}</div>`
  const { data: admins } = await svc.from('profiles').select('email').eq('role', 'admin')
  for (const a of admins || []) {
    if (!a.email) continue
    await fetch(`${url}/functions/v1/send-notification`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: a.email, subject, html, buildingId, channel: 'email' }),
    }).catch(() => null)
  }
}

async function loadIssue(svc: SupabaseClient, id: string) {
  const { data: iss } = await svc.from('issues')
    .select('id, title, description, category, priority, status, building_id, unit_id, assigned_to, brief_token, ticket_no')
    .eq('id', id).maybeSingle()
  if (!iss) return null
  const { data: b } = await svc.from('buildings').select('id, name, street, house_number, city').eq('id', iss.building_id).maybeSingle()
  return { iss, b }
}

const PRE_QUOTE = ['reported', 'pending_committee', 'acknowledged', 'approved_for_quotes']
const DONE = ['completed', 'resolved', 'closed', 'rejected']

// By when the work must be possible: today (Israel time) when urgent, else 7 days.
function availabilityFor(priority: string | null) {
  if (isUrgent(priority)) {
    const ymd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    // 23:59 Israel time is 20:59 or 21:59 UTC; take the earlier, safe either way.
    return { by: new Date(`${ymd}T20:59:00Z`), text: 'היום' }
  }
  const by = new Date(Date.now() + 7 * 86400 * 1000)
  return { by, text: `עד ${ilDay(by)}` }
}
const availText = (q: Record<string, any>) =>
  q.available_by ? (q.available_when || `עד ${ilDay(new Date(q.available_by))}`) : (q.available_when || '')

/** Is this phone a committee member of the building (or ועד1 admin)? */
async function isCommitteePhone(svc: SupabaseClient, buildingId: string, phone: string) {
  const t = String(phone || '').replace(/\D/g, '').slice(-9)
  if (t.length < 9) return null
  const { data: rows } = await svc.from('unit_residents')
    .select('id, last_name, phone, units!inner(number, building_id, board_member)')
    .eq('units.building_id', buildingId).eq('units.board_member', true).eq('archived', false)
  const r = (rows || []).find((x) => String(x.phone || '').replace(/\D/g, '').slice(-9) === t)
  if (r) return { id: r.id, last_name: r.last_name, phone: r.phone, number: (r.units as unknown as { number?: string })?.number || '' }
  const { data: admins } = await svc.from('profiles').select('id, phone').eq('role', 'admin')
  if ((admins || []).some((a) => String(a.phone || '').replace(/\D/g, '').slice(-9) === t)) return { id: null, last_name: 'ועד1', phone, number: '' }
  return null
}

/** Phones of the committee for an issue: the member it is assigned to, else the whole committee. */
async function committeePhones(ctx: JobCtx, iss: Record<string, any>) {
  if (iss.assigned_to) {
    const { data: r } = await ctx.svc.from('unit_residents').select('phone').eq('id', iss.assigned_to).maybeSingle()
    const one = ctx.toE164(String(r?.phone || ''))
    if (one && /^9725\d{8}$/.test(one)) return [one]
  }
  const { data: rows } = await ctx.svc.from('unit_residents')
    .select('phone, units!inner(building_id, board_member)')
    .eq('units.building_id', iss.building_id).eq('units.board_member', true).eq('archived', false)
  return [...new Set((rows || []).map((r) => ctx.toE164(String(r.phone || ''))).filter((x): x is string => !!x && /^9725\d{8}$/.test(x)))]
}

/** Other open issues in the building — for "while he is here". */
async function otherOpen(ctx: JobCtx, iss: Record<string, any>, sameCategory: boolean) {
  let q = ctx.svc.from('issues').select('id, title, category, ticket_no, handler_kind, stage')
    .eq('building_id', iss.building_id).neq('id', iss.id).not('status', 'in', `(${DONE.join(',')})`)
  if (sameCategory && iss.category) q = q.eq('category', iss.category)
  const { data } = await q.order('created_at').limit(5)
  return data || []
}

async function hourPrice(ctx: JobCtx, buildingId: string) {
  const { data: b } = await ctx.svc.from('buildings').select('service_plan').eq('id', buildingId).maybeSingle()
  const { data: p } = await ctx.svc.from('service_plans').select('hour_price').eq('key', b?.service_plan || 'basic').maybeSingle()
  return Number(p?.hour_price) || 0
}

// ── Send ────────────────────────────────────────────────────────────────────
export async function sendJobOffers(ctx: JobCtx, opts: { issueId: string; vendorIds?: string[]; kind: 'quote' | 'handyman'; sentBy: string | null }) {
  const loaded = await loadIssue(ctx.svc, opts.issueId)
  if (!loaded) return { ok: false, error: 'issue_not_found' }
  const { iss, b } = loaded
  const address = addressOf(b)
  const desc = ctx.cleanParam([iss.title, iss.description].filter(Boolean).join(' — ')).slice(0, 600)
  const link = briefLink(iss.brief_token)
  // Time to answer: set in "מסלולים ותמחור" (urgent 3h, otherwise 24h by default).
  const { data: ss } = await ctx.svc.from('service_settings').select('quote_hours_urgent, quote_hours_normal').maybeSingle()
  const hours = isUrgent(iss.priority) ? Number(ss?.quote_hours_urgent) || 3 : Number(ss?.quote_hours_normal) || 24
  const deadline = new Date(Date.now() + hours * 3600 * 1000)
  const { data: tpls } = await ctx.svc.from('message_templates').select('*')
    .in('key', ['vendor_job_offer', 'handyman_job_offer', 'vendor_quote_request', 'vendor_issue_dispatch'])
  const tpl = (k: string) => (tpls || []).find((t) => t.key === k && t.active && t.meta_status === 'APPROVED') || null

  // Build the message: the button template when Meta approved it; inside the
  // 24h window the same buttons as a free interactive message; otherwise the
  // older approved template without buttons (a typed reply still works).
  const build = async (to: string, main: string, vars: string[], ids: string[], titles: string[], fallback: string, fbVars: string[]) => {
    const t = tpl(main)
    if (t) {
      return { key: main, body: ctx.render(t.body, vars), payload: { messaging_product: 'whatsapp', to, type: 'template', template: {
        name: t.meta_name, language: { code: t.language || 'he' },
        components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) },
          ...ids.map((id, index) => ({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload: id }] }))],
      } } }
    }
    const body = ctx.render(String((tpls || []).find((x) => x.key === main)?.body || ''), vars)
    if (body && await windowOpen(ctx.svc, to)) {
      return { key: main, body, payload: { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: body.slice(0, 1024) },
        action: { buttons: ids.map((id, i) => ({ type: 'reply', reply: { id, title: titles[i] } })) } } } }
    }
    const f = tpl(fallback)
    if (!f) return null
    return { key: fallback, body: ctx.render(f.body, fbVars), payload: { messaging_product: 'whatsapp', to, type: 'template', template: {
      name: f.meta_name, language: { code: f.language || 'he' },
      components: [{ type: 'body', parameters: fbVars.map((text) => ({ type: 'text', text })) }],
    } } }
  }

  if (opts.kind === 'handyman') {
    const { data: hm } = await ctx.svc.from('vendors').select('id, name, contact_name, phone').eq('is_internal', true).limit(1).maybeSingle()
    const to = ctx.toE164(String(hm?.phone || ''))
    if (!hm || !to) return { ok: false, error: 'no_handyman' }
    const msg = await build(to, 'handyman_job_offer', [hm.name, desc, address].map(ctx.cleanParam),
      [`hm:${iss.id}:yes`, `hm:${iss.id}:no`], ['אגיע', 'לא יכול'],
      'vendor_issue_dispatch', [hm.name, address, `${desc}${link ? ` | פרטים ותמונות: ${link}` : ''}`, 'ועד1'].map(ctx.cleanParam))
    if (!msg) return { ok: false, error: 'no_template' }
    const r = await ctx.send(msg.payload)
    await ctx.log({
      recipient: to, audience: 'vendor', vendor_id: hm.id, building_id: iss.building_id, template_key: msg.key,
      subject: `עבודה חדשה לאיש האחזקה: ${String(iss.title).slice(0, 120)}`, body: msg.body,
      status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, sent_by: opts.sentBy,
    })
    if (r.ok) await ctx.svc.from('issues').update({ handyman_reply: 'offered', handyman_eta: null, handyman_replied_at: null }).eq('id', iss.id)
    return { ok: r.ok, sent: r.ok ? 1 : 0, error: r.error }
  }

  // The price must hold this availability; it is part of the job, not a later question.
  const avail = availabilityFor(iss.priority)
  const jobDesc = ctx.cleanParam(`${desc} | נדרש ביצוע ${avail.text}`).slice(0, 700)
  const { data: vendors } = await ctx.svc.from('vendors')
    .select('id, name, contact_name, phone, is_blacklisted, is_internal').in('id', (opts.vendorIds || []).slice(0, 10))
  let sent = 0, failed = 0
  const skipped: { name: string; reason: string }[] = []
  for (const v of vendors || []) {
    if (v.is_blacklisted || v.is_internal) { skipped.push({ name: v.name, reason: 'blocked' }); continue }
    const to = ctx.toE164(String(v.phone || ''))
    if (!to || !/^9725\d{8}$/.test(to)) { skipped.push({ name: v.name, reason: 'no_mobile' }); continue }
    const { data: prev } = await ctx.svc.from('quotes').select('id, stage, status')
      .eq('issue_id', iss.id).eq('vendor_id', v.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (prev && ['awaiting_amount', 'visit_requested', 'awaiting_date', 'submitted', 'won'].includes(prev.stage)) {
      skipped.push({ name: v.name, reason: 'in_progress' }); continue
    }
    const fields = { stage: 'offered', status: 'pending', amount: null, available_when: avail.text, available_by: avail.by.toISOString(),
      visit_requested: false, recommended: false, committee_choice: null, committee_choice_at: null,
      deadline: deadline.toISOString(), sent_at: new Date().toISOString(), responded_at: null }
    const { data: q } = prev
      ? await ctx.svc.from('quotes').update(fields).eq('id', prev.id).select('id').single()
      : await ctx.svc.from('quotes').insert({ ...fields, issue_id: iss.id, vendor_id: v.id, building_id: iss.building_id,
          vendor_name: v.name, description: iss.title }).select('id').single()
    if (!q) { failed++; continue }
    const msg = await build(to, 'vendor_job_offer', [vendorGreeting(v), iss.category || 'כללי', jobDesc, address].map(ctx.cleanParam),
      [`offer:${q.id}:yes`, `offer:${q.id}:no`], ['מעוניין לתת הצעה', 'לא מעוניין'],
      'vendor_quote_request', [vendorGreeting(v), address, `${jobDesc}${link ? ` | פרטים ותמונות: ${link}` : ''}`, 'ועד1'].map(ctx.cleanParam))
    if (!msg) { failed++; continue }
    const r = await ctx.send(msg.payload)
    if (r.ok) sent++; else failed++
    await ctx.svc.from('quotes').update({ offer_wamid: r.wamid }).eq('id', q.id)
    await ctx.log({
      recipient: to, audience: 'vendor', vendor_id: v.id, building_id: iss.building_id, template_key: msg.key,
      subject: `עבודה חדשה (הצעת מחיר): ${String(iss.title).slice(0, 120)}`, body: msg.body,
      status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, sent_by: opts.sentBy,
    })
    await new Promise((res) => setTimeout(res, 500))
  }
  if (sent && PRE_QUOTE.includes(iss.status)) await ctx.svc.from('issues').update({ status: 'quoted' }).eq('id', iss.id)
  return { ok: true, sent, failed, skipped, deadline: deadline.toISOString() }
}

// ── Vendor messages ─────────────────────────────────────────────────────────
const askAmountText = (link: string, deadline: Date | null, avail = '') =>
  `תודה!${link ? ` הפרטים והתמונות כאן: ${link}` : ''}\n\n`
  + 'כדי להגיש הצעה, כתוב כאן את הסכום הכולל בשקלים, *לפני מע"מ*: עבודה וחלקים.\n'
  + (avail ? `הגשת הצעה היא התחייבות לבצע את העבודה ${avail}.\n\n` : '\n')
  + 'חשוב: הסכום שתיתן הוא סופי לעבודה כפי שתוארה, ואי אפשר להוסיף עליו מול הבניין אחרי שהעבודה מתחילה. '
  + 'אם בשטח יתגלה משהו שלא היה בתיאור, עוצרים ומדווחים לנו כאן, ותוספת אפשרית רק באישור הוועד.\n\n'
  + 'צריך לראות את המקום לפני שמתחייבים למחיר? כתוב "ביקור" ונתאם.'
  + (deadline ? `\nאפשר להגיש עד ${ilWhen(deadline)}.` : '')

const CLOSED: Record<string, string> = {
  won: 'ההצעה שלך כבר נבחרה לעבודה הזאת. הפרטים נשלחו אליך.',
  lost: 'העבודה הזאת כבר נסגרה. נפנה אליך שוב בעבודה הבאה.',
  declined: 'רשמנו שלא תיתן הצעה לעבודה הזאת. נפנה אליך שוב בעבודה הבאה.',
  expired: 'מועד הגשת ההצעות לעבודה הזאת הסתיים. נפנה אליך שוב בעבודה הבאה.',
  submitted: 'ההצעה שלך כבר אצל ועד הבית. נעדכן אותך בכל מקרה.',
}

async function quoteContext(ctx: JobCtx, quoteId: string) {
  const { data: q } = await ctx.svc.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!q) return null
  const loaded = q.issue_id ? await loadIssue(ctx.svc, q.issue_id) : null
  return { q, iss: loaded?.iss || null, b: loaded?.b || null }
}

async function expireIfLate(ctx: JobCtx, q: Record<string, any>, to: string) {
  if (!BEFORE_AMOUNT.includes(q.stage) || !q.deadline || new Date(q.deadline) > new Date()) return false
  await ctx.svc.from('quotes').update({ stage: 'expired', status: 'expired' }).eq('id', q.id)
  await reply(ctx, to, CLOSED.expired, { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: מועד ההגשה עבר' })
  return true
}

async function recordAmount(ctx: JobCtx, q: Record<string, any>, iss: Record<string, any> | null, to: string, text: string, amount: number) {
  if (/כולל/.test(text) && /מע/.test(text)) {
    await reply(ctx, to, 'ביקשנו את הסכום *לפני מע"מ*. כתוב שוב את הסכום לפני מע"מ, במספרים בלבד.', { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: בקשה לסכום לפני מע"מ' })
    return
  }
  // A vendor who answered the old button-less request with a price straight
  // away never saw the terms: say them now, with the amount.
  const terms = q.stage === 'offered'
    ? '\nחשוב: המחיר הוא לפני מע"מ וסופי לעבודה כפי שתוארה. אם בשטח יתגלה משהו שלא היה בתיאור, עוצרים ומדווחים לנו כאן, ותוספת אפשרית רק באישור הוועד. אם הסכום ששלחת כולל מע"מ, כתוב את הסכום לפני מע"מ.'
    : ''
  // A quote from the old flow (no availability window) still asks for a date.
  if (!q.available_by) {
    await ctx.svc.from('quotes').update({ amount, stage: 'awaiting_date', status: 'pending', responded_at: new Date().toISOString() }).eq('id', q.id)
    await reply(ctx, to, `קיבלנו: ${nis(amount)} לפני מע"מ, סופי לעבודה כפי שתוארה.${terms}\nמתי תוכל לבצע? כתוב יום ושעה משוערים.`,
      { vendor_id: q.vendor_id, building_id: q.building_id, subject: `הצעת מחיר התקבלה: ${String(iss?.title || '').slice(0, 100)}` })
    return
  }
  const fix = q.stage === 'submitted'
  await ctx.svc.from('quotes').update({ amount, stage: 'submitted', status: 'received', responded_at: new Date().toISOString() }).eq('id', q.id)
  const by = new Date(Math.max(Date.now(), q.deadline ? new Date(q.deadline).getTime() : 0) + 86400 * 1000)
  await reply(ctx, to, `${fix ? 'עדכנו' : 'קיבלנו'}: ${nis(amount)} לפני מע"מ, סופי לעבודה כפי שתוארה, עם ביצוע ${availText(q)}.${terms}\n`
    + `ההצעה הוגשה. נעדכן אותך בכל מקרה עד ${ilDay(by)}.\nטעית בסכום? כתוב את הסכום הנכון במספרים.`,
    { vendor_id: q.vendor_id, building_id: q.building_id, subject: `הצעת מחיר ${fix ? 'עודכנה' : 'התקבלה'}: ${String(iss?.title || '').slice(0, 100)}` })
  if (!fix) {
    const { data: v } = await ctx.svc.from('vendors').select('name, contact_name, phone').eq('id', q.vendor_id).maybeSingle()
    await emailAdmins(ctx.svc, `הצעת מחיר חדשה: ${v?.name || ''} · ${nis(amount)} · ${iss?.title || ''}`,
      [`ספק: ${v?.name || ''} (${v?.phone || ''})`, `עבודה: ${iss?.title || ''}`, `סכום: ${nis(amount)} לפני מע"מ`, `ביצוע: ${availText(q)}`,
        'כשכל הספקים יענו, או כשמועד ההגשה יעבור, הזולה תישלח לוועד.'], q.building_id)
  }
  if (q.issue_id) await pickBest(ctx, q.issue_id, false)
}

/** A tap on a job-offer button. Payload "offer:<quoteId>:yes|no" or "hm:<issueId>:yes|no". */
export async function handleOfferButton(ctx: JobCtx, from: string, payload: string, vendor: Record<string, any> | null) {
  const [kind, id, answer] = payload.split(':')
  const yes = answer === 'yes'

  if (kind === 'hm') {
    if (!vendor?.is_internal) return
    const loaded = await loadIssue(ctx.svc, id)
    if (!loaded) return
    const { iss } = loaded
    if (yes) {
      await ctx.svc.from('issues').update({ handyman_reply: 'coming', handyman_eta: null, handyman_replied_at: new Date().toISOString() }).eq('id', iss.id)
      const link = briefLink(iss.brief_token)
      await reply(ctx, from, `מעולה. מתי תגיע? כתוב יום ושעה משוערים.${link ? `\nהפרטים והתמונות: ${link}` : ''}`,
        { vendor_id: vendor.id, building_id: iss.building_id, subject: `איש האחזקה: אגיע · ${String(iss.title).slice(0, 100)}` })
    } else {
      await ctx.svc.from('issues').update({ handyman_reply: 'declined', handyman_replied_at: new Date().toISOString() }).eq('id', iss.id)
      await reply(ctx, from, 'תודה, רשמנו שלא תוכל. נטפל בזה אחרת.', { vendor_id: vendor.id, building_id: iss.building_id, subject: `איש האחזקה: לא יכול · ${String(iss.title).slice(0, 100)}` })
      await emailAdmins(ctx.svc, `איש האחזקה לא יכול: ${iss.title}`, [`איש האחזקה השיב "לא יכול" לעבודה "${iss.title}".`, 'צריך לתאם טיפול אחר.'], iss.building_id)
    }
    return
  }

  const c = await quoteContext(ctx, id)
  if (!c || !vendor || c.q.vendor_id !== vendor.id) return
  const { q, iss } = c
  if (await expireIfLate(ctx, q, from)) return
  if (!OPEN_STAGES.includes(q.stage)) {
    if (CLOSED[q.stage]) await reply(ctx, from, CLOSED[q.stage], { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: הפנייה כבר נסגרה' })
    return
  }
  if (!yes) {
    await ctx.svc.from('quotes').update({ stage: 'declined', status: 'declined', responded_at: new Date().toISOString() }).eq('id', q.id)
    await reply(ctx, from, 'תודה על התשובה. לא נפנה אליך שוב בעבודה הזאת.', { vendor_id: q.vendor_id, building_id: q.building_id, subject: `לא מעוניין: ${String(iss?.title || '').slice(0, 100)}` })
    if (q.issue_id) await pickBest(ctx, q.issue_id, false)
    return
  }
  if (q.stage === 'awaiting_date') {
    await reply(ctx, from, 'כבר קיבלנו את הסכום שלך. מתי תוכל לבצע? כתוב יום ושעה משוערים.', { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: ממתין למועד' })
    return
  }
  await ctx.svc.from('quotes').update({ stage: 'awaiting_amount', interested_at: q.interested_at || new Date().toISOString() }).eq('id', q.id)
  await reply(ctx, from, askAmountText(briefLink(iss?.brief_token || null), q.deadline ? new Date(q.deadline) : null, availText(q)),
    { vendor_id: q.vendor_id, building_id: q.building_id, subject: `מעוניין לתת הצעה: ${String(iss?.title || '').slice(0, 100)}` })
}

/** A typed message from a vendor or the handyman with an open job. True when it was handled here. */
export async function handleOfferText(ctx: JobCtx, from: string, text: string, vendor: Record<string, any>) {
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString()

  if (vendor.is_internal) {
    const { data: iss } = await ctx.svc.from('issues').select('id, title, building_id, brief_token, handyman_reply, handyman_eta')
      .in('handyman_reply', ['offered', 'coming']).is('handyman_eta', null).gte('updated_at', since)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (!iss) return false
    const meta = { vendor_id: vendor.id, building_id: iss.building_id }
    if (iss.handyman_reply === 'offered' && /^(לא יכול|לא אוכל|לא פנוי|לא מגיע)/.test(text)) {
      await handleOfferButton(ctx, from, `hm:${iss.id}:no`, vendor)
      return true
    }
    if (iss.handyman_reply === 'offered' && /^\s*(אגיע|מגיע|כן|אוקיי|בסדר)\s*[.!]?\s*$/.test(text)) {
      await handleOfferButton(ctx, from, `hm:${iss.id}:yes`, vendor)
      return true
    }
    await ctx.svc.from('issues').update({ handyman_reply: 'coming', handyman_eta: text.slice(0, 200), handyman_replied_at: new Date().toISOString() }).eq('id', iss.id)
    await reply(ctx, from, `רשמנו: ${text.slice(0, 200)}. תודה!`, { ...meta, subject: `איש האחזקה: מועד הגעה · ${String(iss.title).slice(0, 100)}` })
    return true
  }

  const { data: q } = await ctx.svc.from('quotes').select('*')
    .eq('vendor_id', vendor.id).in('stage', OPEN_STAGES.concat('submitted')).gte('sent_at', since)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!q) return false
  // A submitted quote: only a bare number (a corrected price) is ours, and
  // only until it went to the committee.
  if (q.stage === 'submitted') {
    const bare = /^\s*₪?\s*[\d,.]+\s*(₪|ש"ח|שח|שקל|שקלים)?\s*$/.test(text)
    const n = parseAmount(text)
    if (!bare || n == null || !q.available_by) return false
    if (q.recommended || q.committee_choice) {
      await reply(ctx, from, 'ההצעה כבר הועברה לוועד הבית, ואי אפשר לשנות אותה עכשיו.', { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: ניסיון עדכון אחרי העברה לוועד' })
      return true
    }
    const loadedS = q.issue_id ? await loadIssue(ctx.svc, q.issue_id) : null
    await recordAmount(ctx, q, loadedS?.iss || null, from, text, n)
    return true
  }
  if (AUTO_REPLY.test(text)) return true
  if (await expireIfLate(ctx, q, from)) return true
  const loaded = q.issue_id ? await loadIssue(ctx.svc, q.issue_id) : null
  const iss = loaded?.iss || null
  const meta = { vendor_id: q.vendor_id, building_id: q.building_id }
  const amount = parseAmount(text)

  if (BEFORE_AMOUNT.includes(q.stage)) {
    if (DECLINE.test(text)) { await handleOfferButton(ctx, from, `offer:${q.id}:no`, vendor); return true }
    if (/ביקור|לראות את המקום|להגיע לראות|לבדוק במקום/.test(text)) {
      await ctx.svc.from('quotes').update({ stage: 'visit_requested', visit_requested: true }).eq('id', q.id)
      await reply(ctx, from, 'רשמנו שאתה רוצה לראות את המקום לפני שתיתן מחיר. ניצור איתך קשר לתיאום ביקור.', { ...meta, subject: `ביקש ביקור לפני מחיר: ${String(iss?.title || '').slice(0, 100)}` })
      await emailAdmins(ctx.svc, `ספק ביקש ביקור לפני מחיר: ${iss?.title || ''}`,
        [`${vendor.name} (${vendor.phone}) רוצה לראות את המקום לפני שייתן מחיר.`, `עבודה: ${iss?.title || ''}`, `כתובת: ${addressOf(loaded?.b || null)}`], q.building_id)
      return true
    }
    // A question before pricing goes to the committee (checked before the
    // amount: "חניות 174–175?" is not a price).
    if (isQuestion(text) && !isBareAmount(text)) {
      if (q.stage === 'offered') await ctx.svc.from('quotes').update({ stage: 'awaiting_amount', interested_at: new Date().toISOString() }).eq('id', q.id)
      await askCommittee(ctx, q, iss, loaded?.b || null, vendor, from, text)
      return true
    }
    if (amount != null) { await recordAmount(ctx, q, iss, from, text, amount); return true }
    if (q.stage === 'offered') {
      // A typed "yes" to the first message.
      if (/(^|[^א-ת])(מעוניין|מעוניינת|כן|מאשר|אשמח)(?![א-ת])/.test(text)) { await handleOfferButton(ctx, from, `offer:${q.id}:yes`, vendor); return true }
      return false
    }
    // Anything else ("אבדוק ואחזור", "אני בדרך לשם"): answer like a person.
    const short = text.length <= 12
    await reply(ctx, from, short
      ? 'לא הבנו. כדי להגיש הצעה, כתוב את הסכום במספרים, לפני מע"מ (למשל 850).\nיש לך שאלה על העבודה? כתוב אותה כאן ונעביר לוועד הבית.\nצריך לראות את המקום קודם? כתוב "ביקור".'
      : `רשמנו, תודה. כשיש לך מחיר, כתוב כאן את הסכום לפני מע"מ.${q.deadline ? ` אפשר להגיש עד ${ilWhen(new Date(q.deadline))}.` : ''}\nיש לך שאלה על העבודה? כתוב אותה עם סימן שאלה ונעביר לוועד הבית.`,
      { ...meta, subject: 'הצעת מחיר: הודעה מהספק' })
    return true
  }

  // awaiting_date: a bare number corrects the price; anything else is the date.
  if (amount != null && /^\s*₪?\s*[\d,.]+\s*(₪|ש"ח|שח|שקל|שקלים)?\s*$/.test(text)) {
    await recordAmount(ctx, { ...q, stage: 'awaiting_amount' }, iss, from, text, amount)
    return true
  }
  const when = text.slice(0, 200)
  await ctx.svc.from('quotes').update({ available_when: when, stage: 'submitted' }).eq('id', q.id)
  const by = new Date(Math.max(Date.now(), q.deadline ? new Date(q.deadline).getTime() : 0) + 2 * 86400 * 1000)
  await reply(ctx, from, `ההצעה הועברה לוועד הבית. נעדכן אותך בכל מקרה עד ${ilDay(by)}.`, { ...meta, subject: `הצעה הוגשה: ${String(iss?.title || '').slice(0, 100)}` })
  await emailAdmins(ctx.svc, `הצעת מחיר חדשה: ${vendor.name} · ${nis(q.amount)} · ${iss?.title || ''}`,
    [`ספק: ${vendor.name} (${vendor.phone})`, `עבודה: ${iss?.title || ''}`, `סכום: ${nis(q.amount)} לפני מע"מ`, `מועד אפשרי: ${when}`,
      'אפשר לבחור את ההצעה במסך התקלות.'], q.building_id)
  return true
}

// "העבודה נתפסה, תודה" — to a vendor we approached and did not pick. Free text
// inside the 24h window; otherwise the vendor_job_closed template once Meta
// approved it; otherwise nothing (counted, so the screen can say so).
/**
 * How a losing price compares with the winner, in words the vendor can use
 * next time — rounded to 10% so the exact winning amount stays private.
 */
function lossLine(mine: number, winner: number | null) {
  if (!(winner && winner > 0) || !(mine > 0)) return 'הפעם העבודה נתפסה.'
  if (mine <= winner) return 'הפעם הוועד בחר הצעה אחרת.'
  const pct = ((mine - winner) / mine) * 100
  if (pct < 5) return 'ההצעה שלך הייתה קרובה מאוד לזוכה.'
  return `הפעם נבחרה הצעה נמוכה בכ-${Math.max(10, Math.round(pct / 10) * 10)}% משלך.`
}

/**
 * A vendor who answered (interested, or asked to see the place) and whose
 * deadline passed before he priced it. He was told we would get back to him,
 * so he hears when the job closes like everyone still in the request.
 */
const engagedExpired = (q: Record<string, any>) => q.stage === 'expired' && (!!q.interested_at || !!q.visit_requested)

async function sendJobTaken(ctx: JobCtx, q: Record<string, any>, title: string, offered: boolean, sentBy: string | null,
  opts: { ticketNo?: unknown; winnerAmount?: number | null; awarded?: boolean } = {}) {
  const { data: v } = await ctx.svc.from('vendors').select('name, contact_name, phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  if (!to || !ctx.ready) return false
  const meta = { vendor_id: q.vendor_id, building_id: q.building_id, subject: `העבודה נתפסה: ${title.slice(0, 100)}`, sent_by: sentBy }
  if (await windowOpen(ctx.svc, to)) {
    const tno = opts.ticketNo ? ` (#${opts.ticketNo})` : ''
    // Always ends looking forward: he is someone we want to answer next time too.
    const text = 'שלום, כאן ועד1.\n' + (offered
      ? `תודה על ההצעה ל"${title}"${tno}. ${lossLine(Number(q.amount), opts.winnerAmount ?? null)} מקווים לעבוד יחד בעבודה הבאה.`
      : opts.awarded
        ? `העבודה "${title}"${tno} נסגרה הפעם עם ספק אחר, שהגיש הצעה שהתאימה יותר לוועד הבית. תודה על הזמינות, מקווים לעבוד יחד בעבודה הבאה.`
        : `העבודה "${title}"${tno} כבר נתפסה. תודה על הזמינות, מקווים לעבוד יחד בעבודה הבאה.`)
    return (await reply(ctx, to, text, meta)).ok
  }
  // Another vendor was chosen: the warmer wording, once Meta approved it.
  let t: Record<string, any> | null = null
  for (const key of opts.awarded ? ['vendor_job_other_chosen', 'vendor_job_closed'] : ['vendor_job_closed']) {
    const { data } = await ctx.svc.from('message_templates').select('*').eq('key', key).maybeSingle()
    if (data?.active && data.meta_status === 'APPROVED') { t = data; break }
  }
  if (!t) return false
  const vars = [vendorGreeting(v), title].map(ctx.cleanParam)
  const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
    components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } })
  await ctx.log({ recipient: to, audience: 'vendor', template_key: t.key, body: ctx.render(t.body, vars),
    status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, ...meta })
  return r.ok
}

/** Close the request without picking anyone: every vendor still in it hears the job was taken. */
export async function closeQuotes(ctx: JobCtx, issueId: string, sentBy: string | null) {
  const loaded = await loadIssue(ctx.svc, issueId)
  if (!loaded) return { ok: false, error: 'not_found' }
  await ctx.svc.from('quote_questions').update({ status: 'closed' }).eq('issue_id', issueId).eq('status', 'pending')
  const { data: all } = await ctx.svc.from('quotes').select('*').eq('issue_id', issueId)
    .in('stage', OPEN_STAGES.concat('submitted', 'expired'))
  const open = (all || []).filter((q) => q.stage !== 'expired' || engagedExpired(q))
  let told = 0, notTold = 0
  for (const q of open) {
    await ctx.svc.from('quotes').update({ stage: 'lost', status: 'rejected' }).eq('id', q.id)
    if (await sendJobTaken(ctx, q, String(loaded.iss.title), q.amount != null && Number(q.amount) > 0, sentBy, { ticketNo: loaded.iss.ticket_no })) told++; else notTold++
  }
  return { ok: true, closed: open.length, told, notTold }
}

// ── The committee picks a quote ─────────────────────────────────────────────
export async function awardQuote(ctx: JobCtx, quoteId: string, sentBy: string | null, opts: { contact?: string; coordinate?: boolean } = {}) {
  const c = await quoteContext(ctx, quoteId)
  if (!c || !c.iss) return { ok: false, error: 'not_found' }
  const { q, iss, b } = c
  if (q.amount == null) return { ok: false, error: 'no_amount' }

  const { data: others } = await ctx.svc.from('quotes').select('id, vendor_id, stage, status, interested_at, visit_requested').eq('issue_id', iss.id).neq('id', q.id)
  // Told below: still in the request, or answered and ran out of time.
  const toTell = new Set((others || []).filter((o) => (o.stage && OPEN_STAGES.concat('submitted').includes(o.stage)) || engagedExpired(o)).map((o) => o.id))
  await ctx.svc.from('quotes').update({ status: 'accepted', stage: q.stage ? 'won' : null }).eq('id', q.id)
  for (const o of others || []) {
    const patch: Record<string, unknown> = {}
    if (['pending', 'received'].includes(o.status)) patch.status = 'rejected'
    if (toTell.has(o.id)) patch.stage = 'lost'
    if (Object.keys(patch).length) await ctx.svc.from('quotes').update(patch).eq('id', o.id)
  }
  await ctx.svc.from('issues').update({ vendor_id: q.vendor_id, vendor_name: q.vendor_name, estimated_cost: q.amount, status: 'approved' }).eq('id', iss.id)
  await ctx.svc.from('quote_questions').update({ status: 'closed' }).eq('issue_id', iss.id).eq('status', 'pending')

  // Who the vendor calls: the member who chose, else the one who owns the
  // issue. When ועד1 coordinates, nobody: we write to him here.
  let contact = opts.coordinate ? 'ועד1 — ניצור איתך קשר כאן בוואטסאפ לתיאום מועד' : (opts.contact || '')
  if (!contact && iss.assigned_to) {
    const { data: r } = await ctx.svc.from('unit_residents').select('last_name, phone, units(number)').eq('id', iss.assigned_to).maybeSingle()
    const u = (r?.units as unknown as { number?: string } | null)
    if (r) contact = [r.last_name, u?.number ? `דירה ${u.number}` : '', r.phone].filter(Boolean).join(' · ')
  }
  if (!contact) contact = 'ועד הבית — ניצור איתך קשר כאן בוואטסאפ'
  // No apartment number: issue.unit_id is who REPORTED it, and most jobs are in
  // common areas (the parking, a stairwell). Where exactly is in the description.
  const apt = ''
  const address = addressOf(b)
  const link = briefLink(iss.brief_token)
  const out = { ok: true, winner: false, thanked: 0, notThanked: 0 }

  const { data: v } = await ctx.svc.from('vendors').select('id, name, contact_name, phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  if (to && ctx.ready) {
    const text = `ההצעה שלך נבחרה ✅\nעבודה: ${iss.title}\nכתובת: ${address}${apt}\nאיש קשר בבניין: ${contact}\n`
      + `${availText(q) ? `ביצוע: ${availText(q)}, כפי שהתחייבת\n` : ''}`
      + `מחיר סגור: ${nis(q.amount)} לפני מע"מ, לעבודה כפי שתוארה.\n\n`
      + 'אם בשטח מתגלה משהו שלא היה בתיאור, עצור ודווח לנו כאן לפני כל עבודה נוספת. תוספת אפשרית רק באישור הוועד דרך ועד1, ולא מול הדיירים או חברי הוועד.\n'
      + 'בסיום העבודה שלח כאן תמונה של העבודה וצילום של החשבונית.\n'
      + `התשלום ישירות מהבניין, לפי חשבונית.${link ? `\nפרטים ותמונות: ${link}` : ''}`
    if (await windowOpen(ctx.svc, to)) {
      const r = await reply(ctx, to, text, { vendor_id: q.vendor_id, building_id: iss.building_id, subject: `הצעתך נבחרה: ${String(iss.title).slice(0, 100)}`, sent_by: sentBy })
      out.winner = r.ok
    } else {
      const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'vendor_job_assignment').maybeSingle()
      if (t?.active && t.meta_status === 'APPROVED') {
        const vars = [vendorGreeting(v), `${address}${apt}`, `${iss.title} · מחיר סגור ${nis(q.amount)} לפני מע"מ, לעבודה כפי שתוארה`,
          availText(q) || 'יתואם איתך', contact].map(ctx.cleanParam)
        const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
          components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } })
        await ctx.log({ recipient: to, audience: 'vendor', vendor_id: q.vendor_id, building_id: iss.building_id, template_key: 'vendor_job_assignment',
          subject: `הצעתך נבחרה: ${String(iss.title).slice(0, 100)}`, body: ctx.render(t.body, vars),
          status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, sent_by: sentBy })
        out.winner = r.ok
      }
    }
  }

  // Everyone else still in the request hears the job was taken.
  for (const o of others || []) {
    if (!toTell.has(o.id)) continue
    const { data: full } = await ctx.svc.from('quotes').select('*').eq('id', o.id).maybeSingle()
    if (full && await sendJobTaken(ctx, full, String(iss.title), full.amount != null && Number(full.amount) > 0, sentBy,
      { ticketNo: iss.ticket_no, winnerAmount: Number(q.amount), awarded: true })) out.thanked++
    else out.notThanked++
  }
  return out
}

// ── The committee gets ONE quote: the cheapest that holds the availability ──
/**
 * Once every vendor answered (or, with force, once the deadline passed), mark
 * the cheapest submitted quote as recommended and send it to the committee.
 * Idempotent: nothing happens while a quote is recommended or chosen.
 */
export async function pickBest(ctx: JobCtx, issueId: string, force: boolean): Promise<Record<string, unknown>> {
  const { data: all } = await ctx.svc.from('quotes').select('*').eq('issue_id', issueId).not('stage', 'is', null)
  const rows = all || []
  if (!rows.length) return { ok: true, state: 'none' }
  if (rows.some((q) => (q.recommended && !q.committee_choice) || q.stage === 'won')) return { ok: true, state: 'already' }
  const now = Date.now()
  const waiting = rows.filter((q) => BEFORE_AMOUNT.includes(q.stage) && q.deadline && new Date(q.deadline).getTime() > now)
  if (waiting.length && !force) return { ok: true, state: 'waiting' }
  for (const q of rows.filter((q) => BEFORE_AMOUNT.includes(q.stage) && (!q.deadline || new Date(q.deadline).getTime() <= now))) {
    await ctx.svc.from('quotes').update({ stage: 'expired', status: 'expired' }).eq('id', q.id)
  }
  if (waiting.length) return { ok: true, state: 'waiting' }

  const loaded = await loadIssue(ctx.svc, issueId)
  if (!loaded) return { ok: false, error: 'not_found' }
  const { iss, b } = loaded
  const candidates = rows.filter((q) => q.stage === 'submitted' && Number(q.amount) > 0 && q.committee_choice !== 'reject')
    .sort((a, z) => Number(a.amount) - Number(z.amount))
  if (!candidates.length) {
    // Nobody priced it, but someone asked to see the place first: offer ועד1
    // to invite him (once per request).
    const visit = rows.find((q) => q.visit_requested && !q.visit_invited_at && ['visit_requested', 'expired'].includes(q.stage))
    if (visit && !rows.some((q) => q.visit_invited_at)) {
      await offerVisit(ctx, visit, iss, b, rows.length)
      return { ok: true, state: 'visit_offered', quoteId: visit.id }
    }
    // Tell ועד1 once: after this every quote is closed, so nothing calls again.
    if (!rows.some((q) => q.committee_choice === 'reject')) {
      await emailAdmins(ctx.svc, `לא התקבלה הצעה בזמן: ${iss.title}`,
        [`אף ספק לא הגיש הצעה לעבודה "${iss.title}" (${addressOf(b)}) בזמן.`,
          `נשלח ל-${rows.length} ספקים. אפשר לשלוח לספקים נוספים ממסך התקלות.`], iss.building_id)
    }
    return { ok: true, state: 'no_quotes' }
  }
  const best = candidates[0]
  await ctx.svc.from('quotes').update({ recommended: true }).eq('id', best.id)
  await ctx.svc.from('issues').update({ stage: 'awaiting_quote_approval' }).eq('id', iss.id)

  // "ועד1 מטפל" and within the committee's cap: approve it ourselves, coordinate, and tell them.
  const { data: mode } = await ctx.svc.from('buildings').select('handling_mode, vendor_auto_limit').eq('id', iss.building_id).maybeSingle()
  const cap = Number(mode?.vendor_auto_limit) || 0
  if (mode?.handling_mode === 'vaad1' && cap > 0 && Number(best.amount) <= cap) {
    const r = await committeeChoice(ctx, best.id, 'coordinate', { uid: null })
    const what = `${iss.ticket_no ? `#${iss.ticket_no} ` : ''}${iss.title}`
    await notifyCommittee(ctx, iss, `שלום, כאן ועד1.\nההצעה לתקלה *${what}*: ${best.vendor_name} · ${nis(best.amount)} לפני מע"מ, `
      + `בתוך התקרה שהגדרתם (${nis(cap)}), אז אישרנו אותה.\n${r.text}`, `אושר אוטומטית: ${what}`)
    await emailAdmins(ctx.svc, `אושר אוטומטית (עד ${nis(cap)}): ${best.vendor_name} · ${nis(best.amount)} · ${iss.title}`,
      [`בניין במצב "ועד1 מטפל". ההצעה בתוך התקרה ואושרה בלי הוועד.`, `לתאם את ${best.vendor_name} ואת הליווי.`], iss.building_id)
    return { ok: true, state: 'auto_approved', quoteId: best.id }
  }
  const sent = await sendBestToCommittee(ctx, { ...best, recommended: true }, iss, b, candidates.length)
  await emailAdmins(ctx.svc, `הצעה נשלחה לוועד: ${best.vendor_name} · ${nis(best.amount)} · ${iss.title}`,
    [`עבודה: ${iss.title} (${addressOf(b)})`, `ההצעה הזולה: ${best.vendor_name} · ${nis(best.amount)} לפני מע"מ · ביצוע ${availText(best)}`,
      ...candidates.slice(1).map((c) => `הצעה נוספת: ${c.vendor_name} · ${nis(c.amount)}`),
      sent ? 'הוועד קיבל אותה בוואטסאפ עם כפתורים.' : 'לא הצלחנו לשלוח לוועד בוואטסאפ (אין חלון שיחה פתוח ואין תבנית מאושרת). הוועד רואה אותה באפליקציה, כדאי לעדכן אותו.'],
    iss.building_id)
  return { ok: true, state: 'sent_to_committee', quoteId: best.id, whatsapp: sent }
}

async function sendBestToCommittee(ctx: JobCtx, q: Record<string, any>, iss: Record<string, any>, b: Record<string, any> | null, count: number) {
  const phones = await committeePhones(ctx, iss)
  if (!phones.length || !ctx.ready) return 0
  const hour = await hourPrice(ctx, iss.building_id)
  const more = await otherOpen(ctx, iss, true)
  const what = `${iss.ticket_no ? `#${iss.ticket_no} ` : ''}${iss.title}`
  const text = `שלום, כאן ועד1.\nהתקבלה הצעה לתקלה *${what}* ב${b?.name || 'בניין'}:\n`
    + `${q.vendor_name} · ${nis(q.amount)} לפני מע"מ, סופי לעבודה כפי שתוארה.\nביצוע: ${availText(q)}.\n`
    + `${count > 1 ? `זו ההצעה הזולה מבין ${count} ספקים שזמינים בזמן.\n` : ''}`
    + (more.length ? `\nבזמן שהוא בבניין, אפשר לבקש ממנו לטפל גם ב: ${more.map((m) => m.title).join(' · ')}\n` : '')
    + '\nסוגרים איתו? תקבלו את הטלפון שלו ותתאמו ישירות.'
    + `\nלא תוכלו להיות בבניין? ועד1 תתאם, ואיש האחזקה ילווה את הספק${hour ? ` (שעת אחזקה ₪${hour} לפני מע"מ, או שעה מהכרטיסייה)` : ''}.`
  const ids = ['take', 'coord', 'no'].map((a) => `bq:${q.id}:${a}`)
  const titles = ['סוגרים איתו', 'תאמו ולוו אותנו', 'לא מתאים']
  const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'committee_best_quote').maybeSingle()
  let sent = 0
  for (const to of phones) {
    let payload: Record<string, unknown> | null = null
    let body = text
    if (await windowOpen(ctx.svc, to)) {
      payload = { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: text.slice(0, 1024) },
        action: { buttons: ids.map((id, i) => ({ type: 'reply', reply: { id, title: titles[i] } })) } } }
    } else if (t?.active && t.meta_status === 'APPROVED') {
      const vars = [what, `${q.vendor_name} · ${nis(q.amount)} לפני מע"מ`, availText(q),
        hour ? `₪${hour} לפני מע"מ, או שעה מהכרטיסייה` : 'לפי המחירון'].map(ctx.cleanParam)
      body = ctx.render(t.body, vars)
      payload = { messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
        components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) },
          ...ids.map((id, index) => ({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload: id }] }))] } }
    }
    if (!payload) continue
    const r = await ctx.send(payload)
    if (r.ok) sent++
    await ctx.log({ recipient: to, audience: 'resident', building_id: iss.building_id, template_key: 'committee_best_quote',
      subject: `הצעה לוועד: ${String(what).slice(0, 120)}`, body,
      status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error })
  }
  return sent
}

/**
 * The committee's answer to the recommended quote, from a WhatsApp button or
 * the app. take: they close with the vendor themselves; coordinate: ועד1
 * coordinates and the handyman accompanies; reject: the next cheapest.
 */
export async function committeeChoice(ctx: JobCtx, quoteId: string, choice: 'take' | 'coordinate' | 'reject',
  actor: { phone?: string; uid?: string | null }): Promise<Record<string, any>> {
  const c = await quoteContext(ctx, quoteId)
  if (!c || !c.iss) return { ok: false, error: 'not_found', text: 'ההצעה לא נמצאה.' }
  const { q, iss, b } = c
  let member: Awaited<ReturnType<typeof isCommitteePhone>> = null
  if (actor.phone) {
    member = await isCommitteePhone(ctx.svc, iss.building_id, actor.phone)
    if (!member) return { ok: false, error: 'forbidden', text: 'ההחלטה שמורה לחברי ועד הבניין, והמספר הזה לא רשום כחבר ועד.' }
  }
  if (q.committee_choice || q.stage === 'won') return { ok: false, error: 'already', text: `כבר התקבלה החלטה על ההצעה של ${q.vendor_name}. אפשר לראות באפליקציה.` }
  if (!q.recommended) return { ok: false, error: 'not_recommended', text: 'ההצעה הזאת כבר לא פתוחה להחלטה.' }
  await ctx.svc.from('quotes').update({ committee_choice: choice, committee_choice_at: new Date().toISOString() }).eq('id', q.id)

  if (choice === 'reject') {
    await ctx.svc.from('quotes').update({ recommended: false, stage: 'lost', status: 'rejected' }).eq('id', q.id)
    await sendJobTaken(ctx, q, String(iss.title), true, actor.uid || null)
    const next = await pickBest(ctx, iss.id, true)
    if (next.state === 'sent_to_committee') return { ok: true, next: true, text: 'רשמנו. שלחנו לכם את ההצעה הבאה בתור.' }
    await emailAdmins(ctx.svc, `הוועד דחה את ההצעה ואין הצעה נוספת: ${iss.title}`,
      [`הוועד דחה את ההצעה של ${q.vendor_name} (${nis(q.amount)}) ל"${iss.title}".`, 'אין הצעה נוספת. צריך לשלוח לספקים נוספים.'], iss.building_id)
    return { ok: true, next: false, text: 'רשמנו. אין כרגע הצעה נוספת, ונבקש הצעות מספקים נוספים.' }
  }

  // Whoever tapped is the vendor's contact (apartment number + surname only).
  const contact = choice === 'take' && member?.id
    ? [member.last_name, member.number ? `דירה ${member.number}` : '', member.phone].filter(Boolean).join(' · ') : ''
  const res = await awardQuote(ctx, q.id, actor.uid || null, { contact, coordinate: choice === 'coordinate' })
  const { data: v } = await ctx.svc.from('vendors').select('name, contact_name, phone').eq('id', q.vendor_id).maybeSingle()
  const e164 = ctx.toE164(String(v?.phone || '')) || ''

  if (choice === 'take') {
    await ctx.svc.from('issues').update({ handler: 'committee', handler_kind: 'vendor', stage: 'scheduled', status: 'in_progress' }).eq('id', iss.id)
    const hello = encodeURIComponent(`שלום, כאן ועד הבית ב${addressOf(b)}. קיבלנו את ההצעה שלך דרך ועד1 ל"${iss.title}". מתי נוח לך להגיע?`)
    return { ...res, ok: true, vendor: v, wa: e164 ? `https://wa.me/${e164}?text=${hello}` : null,
      text: `✅ סגרנו עם ${q.vendor_name}.\nטלפון: ${v?.phone || ''}${e164 ? `\nלתיאום בוואטסאפ: https://wa.me/${e164}?text=${hello}` : ''}\n`
        + `מחיר סגור: ${nis(q.amount)} לפני מע"מ, ביצוע ${availText(q)}.\n\n`
        + 'הספק קיבל את פרטי הקשר שלך. אם הוא יבקש תוספת, הוא מדווח לנו ואנחנו שולחים לכם לאישור. לא משלמים תוספת שלא אושרה כך.\n'
        + 'בסיום נבקש מכם לאשר שהעבודה בוצעה.' }
  }

  // coordinate
  await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'vendor', stage: 'awaiting_assignment', status: 'in_progress' }).eq('id', iss.id)
  const hour = await hourPrice(ctx, iss.building_id)
  const queued = (await otherOpen(ctx, iss, false)).filter((m) => m.handler_kind === 'handyman')
  await emailAdmins(ctx.svc, `לתאם ספק וליווי: ${iss.title}`,
    [`הוועד ביקש שוועד1 תתאם את ${q.vendor_name} (${v?.phone || ''}) ושאיש האחזקה ילווה אותו.`,
      `עבודה: ${iss.title} · ${addressOf(b)}`, `מחיר סגור: ${nis(q.amount)} לפני מע"מ · ביצוע ${availText(q)}`,
      ...(queued.length ? [`באותו ביקור איש האחזקה יכול לטפל גם ב: ${queued.map((m) => m.title).join(' · ')}`] : [])], iss.building_id)
  return { ...res, ok: true, vendor: v,
    text: `✅ ועד1 תתאם עם ${q.vendor_name}, ואיש האחזקה ילווה אותו בבניין.\n`
      + `${hour ? `שעת אחזקה: ₪${hour} לפני מע"מ, או שעה מהכרטיסייה. נרשמת אחרי הביקור.\n` : ''}`
      + (queued.length ? `באותו ביקור איש האחזקה יטפל גם ב: ${queued.map((m) => m.title).join(' · ')}\n` : '')
      + 'נעדכן אתכם כשייקבע מועד.' }
}

/** Committee tapped a button on the recommended quote: "bq:<quoteId>:take|coord|no". */
export async function handleBestQuoteButton(ctx: JobCtx, from: string, payload: string) {
  const [, id, a] = payload.split(':')
  const choice = a === 'take' ? 'take' : a === 'coord' ? 'coordinate' : 'reject'
  const r = await committeeChoice(ctx, id, choice, { phone: from })
  const { data: q } = await ctx.svc.from('quotes').select('building_id').eq('id', id).maybeSingle()
  if (!ctx.ready) return
  const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: String(r.text) } })
  await ctx.log({ recipient: from, audience: 'resident', building_id: q?.building_id || null, subject: 'החלטת ועד על הצעת מחיר', body: String(r.text),
    status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
}

/** Scheduler: requests whose deadline passed go to the committee with what came in. */
export async function sweepQuotes(ctx: JobCtx) {
  const { data } = await ctx.svc.from('quotes').select('issue_id')
    .in('stage', BEFORE_AMOUNT).lte('deadline', new Date().toISOString()).not('issue_id', 'is', null).limit(200)
  const ids = [...new Set((data || []).map((x) => x.issue_id as string))]
  const out: Record<string, unknown>[] = []
  for (const id of ids) out.push({ issueId: id, ...(await pickBest(ctx, id, true)) })
  const alerted = await alertUnansweredQuestions(ctx)
  const auto = await autoTakeIssues(ctx)
  const closedNotified = await notifyClosed(ctx)
  const reminded = await remindCommittee(ctx)
  const vendorsReminded = await remindVendors(ctx)
  const coordinationReminded = await remindCoordination(ctx)
  const tasksReminded = await remindTasks(ctx)
  return { ok: true, issues: ids.length, results: out, questionsAlerted: alerted, autoTaken: auto, closedNotified, reminded, vendorsReminded, coordinationReminded, tasksReminded }
}

// ── ועד1 coordinates the chosen vendor ──────────────────────────────────────
const COORDINATE_REMIND_HOURS = 24

/**
 * The committee chose "תאמו ולוו אותנו" and no date was set: ועד1 hears once a
 * day until one is. Email to ועד1 only; nobody in the building is written to.
 */
async function remindCoordination(ctx: JobCtx) {
  const cutoff = new Date(Date.now() - COORDINATE_REMIND_HOURS * 3600 * 1000).toISOString()
  const { data: rows } = await ctx.svc.from('issues')
    .select('id, title, ticket_no, building_id, vendor_id, vendor_name, estimated_cost, coordination_reminded_at')
    .eq('handler', 'management').eq('handler_kind', 'vendor').eq('stage', 'awaiting_assignment')
    .is('scheduled_date', null).not('vendor_id', 'is', null).not('status', 'in', `(${DONE.join(',')})`)
    .or(`coordination_reminded_at.is.null,coordination_reminded_at.lte.${cutoff}`).limit(30)
  let sent = 0
  for (const i of rows || []) {
    const { data: won } = await ctx.svc.from('quotes').select('committee_choice_at, available_by, available_when')
      .eq('issue_id', i.id).eq('stage', 'won').maybeSingle()
    if (!won?.committee_choice_at || new Date(won.committee_choice_at).getTime() > new Date(cutoff).getTime()) continue
    // Claim first, so two sweeps cannot both send.
    let claim = ctx.svc.from('issues').update({ coordination_reminded_at: new Date().toISOString() }).eq('id', i.id)
    claim = i.coordination_reminded_at ? claim.eq('coordination_reminded_at', i.coordination_reminded_at) : claim.is('coordination_reminded_at', null)
    const { data: mine } = await claim.select('id').maybeSingle()
    if (!mine) continue
    const { data: v } = await ctx.svc.from('vendors').select('phone').eq('id', i.vendor_id).maybeSingle()
    const { data: b } = await ctx.svc.from('buildings').select('id, name, street, house_number, city').eq('id', i.building_id).maybeSingle()
    const days = Math.max(1, Math.floor((Date.now() - new Date(won.committee_choice_at).getTime()) / 86400000))
    await emailAdmins(ctx.svc, `ממתין לתיאום מועד ${days} ימים: ${whatOf(i)}`,
      ['הוועד ביקש שוועד1 תתאם, ועוד לא נקבע מועד.',
        `עבודה: ${whatOf(i)} · ${addressOf(b)}`,
        `ספק: ${i.vendor_name || ''} (${v?.phone || ''}) · ${nis(i.estimated_cost)} לפני מע"מ${availText(won) ? ` · התחייב לביצוע ${availText(won)}` : ''}`,
        'אחרי התיאום עם הספק: "קבע מועד" במסך התקלות. הוועד והספק יקבלו את המועד בוואטסאפ.'], i.building_id)
    sent++
  }
  return sent
}

/**
 * A date was set for a job ועד1 coordinates: the committee was promised
 * "נעדכן אתכם כשייקבע מועד", and the vendor needs it in writing. Each change
 * of date goes out again — it is the new answer to "when".
 */
export async function jobScheduled(ctx: JobCtx, issueId: string, sentBy: string | null) {
  const { data } = await ctx.svc.from('issues').select(ISSUE_COLS + ', vendor_id, scheduled_date, estimated_cost').eq('id', issueId).maybeSingle()
  const iss = data as Record<string, any> | null
  if (!iss) return { ok: false, error: 'not_found' }
  if (iss.handler !== 'management' || iss.handler_kind !== 'vendor' || !iss.vendor_id || !iss.scheduled_date) return { ok: true, skipped: true, committee: 0, vendor: false }
  if (iss.stage !== 'scheduled') await ctx.svc.from('issues').update({ stage: 'scheduled' }).eq('id', iss.id)
  const { data: b } = await ctx.svc.from('buildings').select('id, name, street, house_number, city').eq('id', iss.building_id).maybeSingle()
  const when = new Date(`${String(iss.scheduled_date).slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: '2-digit', month: '2-digit' })
  const what = whatOf(iss)

  const committee = await tellCommittee(ctx, iss,
    `שלום, כאן ועד1.\nנקבע מועד לתקלה *${what}*: ${iss.vendor_name} יגיע ב${when}.\nאיש האחזקה של ועד1 ילווה אותו בבניין. נעדכן כשהעבודה תסתיים.`,
    `נקבע מועד: ${iss.vendor_name} יגיע ב${when}, בליווי איש האחזקה של ועד1`, `נקבע מועד: ${what}`)

  let vendor = false
  const { data: v } = await ctx.svc.from('vendors').select('name, contact_name, phone').eq('id', iss.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  if (to && ctx.ready) {
    const meta = { vendor_id: iss.vendor_id, building_id: iss.building_id, subject: `נקבע מועד: ${what.slice(0, 100)}`, sent_by: sentBy }
    const address = addressOf(b)
    if (await windowOpen(ctx.svc, to)) {
      vendor = (await reply(ctx, to, `שלום, כאן ועד1.\nנקבע מועד לעבודה "${iss.title}"${iss.ticket_no ? ` (#${iss.ticket_no})` : ''} ב${address}: ${when}.\n`
        + 'איש האחזקה של ועד1 ילווה אותך בבניין. אם המועד לא מתאים, כתוב לנו כאן.', meta)).ok
    } else {
      const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'vendor_job_assignment').maybeSingle()
      if (t?.active && t.meta_status === 'APPROVED') {
        const vars = [vendorGreeting(v), address, `${iss.title}${Number(iss.estimated_cost) > 0 ? ` · מחיר סגור ${nis(iss.estimated_cost)} לפני מע"מ` : ''}`,
          when, 'ועד1 — איש האחזקה שלנו ילווה אותך בבניין'].map(ctx.cleanParam)
        const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
          components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } })
        await ctx.log({ recipient: to, audience: 'vendor', template_key: 'vendor_job_assignment', body: ctx.render(t.body, vars),
          status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, ...meta })
        vendor = r.ok
      }
    }
  }
  if (!committee || !vendor) {
    await emailAdmins(ctx.svc, `המועד נקבע, אבל לא כולם עודכנו: ${what}`,
      [`מועד: ${when}`, committee ? 'הוועד עודכן בוואטסאפ.' : 'הוועד לא קיבל הודעה בוואטסאפ. צריך לעדכן אותו.',
        vendor ? 'הספק עודכן בוואטסאפ.' : `הספק ${iss.vendor_name || ''} (${v?.phone || ''}) לא קיבל הודעה בוואטסאפ. צריך לעדכן אותו.`], iss.building_id)
  }
  return { ok: true, committee, vendor }
}

// ── A vendor said "interested" and sent no amount ───────────────────────────
const AMOUNT_REMIND_HOURS = 3

/** One reminder, AMOUNT_REMIND_HOURS after "interested", while there is still an hour to answer. */
async function remindVendors(ctx: JobCtx) {
  if (!ctx.ready) return 0
  const now = Date.now()
  const { data: rows } = await ctx.svc.from('quotes').select('*')
    .eq('stage', 'awaiting_amount').is('amount_reminded_at', null).not('issue_id', 'is', null)
    .lte('interested_at', new Date(now - AMOUNT_REMIND_HOURS * 3600 * 1000).toISOString())
    .gt('deadline', new Date(now + 3600 * 1000).toISOString()).limit(50)
  let sent = 0
  for (const q of rows || []) {
    // Claim first, so two sweeps cannot both send.
    const { data: mine } = await ctx.svc.from('quotes').update({ amount_reminded_at: new Date().toISOString() })
      .eq('id', q.id).is('amount_reminded_at', null).select('id').maybeSingle()
    if (!mine) continue
    const loaded = await loadIssue(ctx.svc, q.issue_id)
    const { data: v } = await ctx.svc.from('vendors').select('phone').eq('id', q.vendor_id).maybeSingle()
    const to = ctx.toE164(String(v?.phone || ''))
    // Free text only: he wrote to us lately; outside the window there is no fitting template.
    if (!loaded || !to || !(await windowOpen(ctx.svc, to))) continue
    const { iss } = loaded
    const text = `שלום, כאן ועד1. מחכים להצעת המחיר שלך ל"${iss.title}"${iss.ticket_no ? ` (#${iss.ticket_no})` : ''}. `
      + `ההגשה נסגרת ב-${ilWhen(new Date(q.deadline))}. אפשר פשוט לענות כאן עם הסכום לפני מע"מ.`
    if ((await reply(ctx, to, text, { vendor_id: q.vendor_id, building_id: q.building_id, subject: `תזכורת להגשת הצעה: ${whatOf(iss).slice(0, 100)}` })).ok) sent++
  }
  return sent
}

// ── Nobody priced it, but a vendor asked to see the place first ─────────────
const VISIT_HOURS = 72   // to visit and send a price

async function offerVisit(ctx: JobCtx, q: Record<string, any>, iss: Record<string, any>, b: Record<string, any> | null, count: number) {
  const text = `ועד1 — לא התקבלה הצעת מחיר ל*${whatOf(iss)}*${b?.name ? ` (${b.name})` : ''} מ-${count} ספקים.\n`
    + `${q.vendor_name} ביקש לראות את המקום לפני שייתן מחיר. להזמין אותו לביקור?`
  let sent = 0
  for (const to of await adminPhones(ctx)) {
    if (await sendButtons(ctx, to, text, [['להזמין לביקור', `vv:${q.id}:yes`], ['לא צריך', `vv:${q.id}:no`]],
      { building_id: iss.building_id, subject: `ביקור לפני מחיר: ${whatOf(iss)}` })) sent++
  }
  await emailAdmins(ctx.svc, `לא התקבלה הצעה, ספק מבקש ביקור: ${iss.title}`,
    [`אף ספק לא הגיש מחיר לעבודה "${iss.title}" (${addressOf(b)}).`, `${q.vendor_name} ביקש לראות את המקום לפני שייתן מחיר.`,
      sent ? 'נשלחו לך כפתורים בוואטסאפ: להזמין לביקור / לא צריך.' : `אין חלון וואטסאפ פתוח. אפשר לשלוח מכאן "ביקור" לספק ידנית, או לשלוח לספקים נוספים ממסך התקלות. ${APP}/issues`],
    iss.building_id)
}

/** ועד1's answer on a visit: "vv:<quoteId>:yes|no". */
export async function handleVisitButton(ctx: JobCtx, from: string, payload: string) {
  const [, quoteId, answer] = payload.split(':')
  const me = ctx.toE164(from)
  const answerAdmin = async (text: string) => {
    if (!ctx.ready) return
    const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: text } })
    await ctx.log({ recipient: from, audience: 'resident', subject: 'ביקור לפני מחיר — תשובה', body: text,
      status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
  }
  if (!me || !(await adminPhones(ctx, true)).includes(me)) return answerAdmin('ההחלטה הזאת שמורה לוועד1.')
  const c = await quoteContext(ctx, quoteId)
  if (!c?.iss) return answerAdmin('הבקשה לא נמצאה.')
  const { q, b } = c
  if (q.visit_invited_at) return answerAdmin(`${q.vendor_name} כבר הוזמן לביקור.`)
  const { data: iss } = await ctx.svc.from('issues').select(ISSUE_COLS).eq('id', q.issue_id).maybeSingle()
  if (!iss || DONE.includes(iss.status)) return answerAdmin('התקלה כבר נסגרה.')
  const { data: v } = await ctx.svc.from('vendors').select('name, contact_name, phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  const open = !!to && ctx.ready && await windowOpen(ctx.svc, to)
  const meta = { vendor_id: q.vendor_id, building_id: q.building_id }

  if (answer !== 'yes') {
    if (open) await reply(ctx, to!, `תודה על הנכונות להגיע ל"${iss.title}". הפעם לא נצטרך ביקור. נפנה אליך שוב בעבודה הבאה.`,
      { ...meta, subject: `ביקור לא נדרש: ${whatOf(iss).slice(0, 100)}` })
    return answerAdmin(`רשמנו: אין ביקור ל-${whatOf(iss)}. אפשר לשלוח לספקים נוספים ממסך התקלות.`)
  }

  // Who the vendor arranges the visit with depends on the track.
  const vaad1 = iss.handler === 'management'
  let contact = ''
  if (!vaad1 && iss.assigned_to) {
    const { data: r } = await ctx.svc.from('unit_residents').select('last_name, phone, units(number)').eq('id', iss.assigned_to).maybeSingle()
    const u = (r?.units as unknown as { number?: string } | null)
    if (r) contact = [r.last_name, u?.number ? `דירה ${u.number}` : '', r.phone].filter(Boolean).join(' · ')
  }
  if (!contact) contact = vaad1 ? 'ועד1 — נתאם איתך כאן בוואטסאפ' : 'ועד הבית — ניצור איתך קשר כאן בוואטסאפ'

  const deadline = new Date(Date.now() + VISIT_HOURS * 3600 * 1000)
  await ctx.svc.from('quotes').update({ stage: 'awaiting_amount', status: 'pending', deadline: deadline.toISOString(),
    visit_invited_at: new Date().toISOString(), amount_reminded_at: new Date().toISOString() }).eq('id', q.id)

  const link = briefLink(c.iss.brief_token)
  const text = `שלום, כאן ועד1. נשמח שתגיע לראות את המקום לפני שתיתן מחיר.\nעבודה: ${iss.title}${iss.ticket_no ? ` (#${iss.ticket_no})` : ''}\n`
    + `כתובת: ${addressOf(b)}\nתיאום הביקור: ${contact}\n\n`
    + `אחרי הביקור כתוב כאן את הסכום לפני מע"מ, סופי לעבודה כפי שתוארה. אפשר להגיש עד ${ilWhen(deadline)}.${link ? `\nפרטים ותמונות: ${link}` : ''}`
  const delivered = open ? (await reply(ctx, to!, text, { ...meta, subject: `הוזמן לביקור: ${whatOf(iss).slice(0, 100)}` })).ok : false

  if (!vaad1) {
    await notifyCommittee(ctx, iss, `שלום, כאן ועד1.\n${q.vendor_name} יגיע לראות את המקום לתקלה *${whatOf(iss)}* לפני שייתן מחיר. הוא ייצור איתכם קשר לתיאום.`,
      `ספק יגיע לביקור: ${whatOf(iss)}`)
  }
  const reach = delivered ? '' : `\nההודעה לספק לא יצאה (אין חלון שיחה פתוח). צריך להתקשר אליו: ${v?.phone || ''}.`
  return answerAdmin(`✅ ${q.vendor_name} הוזמן לביקור ל-${whatOf(iss)}. יש לו עד ${ilWhen(deadline)} לשלוח מחיר.`
    + (vaad1 ? `\nתאם איתו את הביקור: ${v?.phone || ''}.` : '\nהוא יתאם עם הוועד.') + reach)
}

/** Tell the committee something (no buttons). Free text only inside the 24h window; else the app shows it. */
async function notifyCommittee(ctx: JobCtx, iss: Record<string, any>, text: string, subject: string) {
  if (!ctx.ready) return 0
  let sent = 0
  for (const to of await committeePhones(ctx, iss)) {
    if (!(await windowOpen(ctx.svc, to))) continue
    const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4096) } })
    if (r.ok) sent++
    await ctx.log({ recipient: to, audience: 'resident', building_id: iss.building_id, subject, body: text,
      status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error })
  }
  return sent
}

const URGENT_WAIT_MIN = 60        // an emergency the committee did not decide on → ועד1
const HIGH_WAIT_MIN = 240         // "דחוף" the committee did not decide on → ועד1
const VAAD1_DECIDE_MIN = 30       // דחוף/חירום ועד1 did not decide on → the suggestion goes out
const REMIND_DAYS = 7             // an issue the committee took on, still open
const ROUTE_GRACE_MIN = 3         // the trigger is the fast path; the scheduler catches what it missed

const whatOf = (iss: Record<string, any>) => `${iss.ticket_no ? `#${iss.ticket_no} ` : ''}${iss.title}`
const ISSUE_COLS = 'id, title, description, category, priority, status, handler, handler_kind, stage, building_id, unit_id, assigned_to, ticket_no, vendor_name, routed_at, route, vaad1_suggestion'

/**
 * Phones that receive ועד1's decision buttons. billing_settings.vaad1_decision_phone
 * wins when set (the admin profile phone may be the handyman's); otherwise
 * every admin profile. With `all`, both — for checking who may press a button.
 */
async function adminPhones(ctx: JobCtx, all = false) {
  const valid = (p: unknown) => { const x = ctx.toE164(String(p || '')); return x && /^9725\d{8}$/.test(x) ? x : null }
  const { data: bs } = await ctx.svc.from('billing_settings').select('vaad1_decision_phone').eq('id', 'default').maybeSingle()
  const fixed = valid(bs?.vaad1_decision_phone)
  if (fixed && !all) return [fixed]
  const { data } = await ctx.svc.from('profiles').select('phone').eq('role', 'admin')
  return [...new Set([fixed, ...(data || []).map((a) => valid(a.phone))].filter((x): x is string => !!x))]
}

/** Interactive buttons inside the 24h window; else plain notice by template where one fits. */
async function sendButtons(ctx: JobCtx, to: string, text: string, buttons: [string, string][], meta: Record<string, unknown>) {
  if (!ctx.ready || !(await windowOpen(ctx.svc, to))) return false
  const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: text.slice(0, 1024) },
    action: { buttons: buttons.map(([title, id]) => ({ type: 'reply', reply: { id, title } })) } } })
  await ctx.log({ recipient: to, audience: 'resident', body: text, status: r.ok ? 'sent' : 'failed',
    delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, ...meta })
  return r.ok
}

/**
 * Tell the committee about an issue, with or without buttons. Inside the 24h
 * window: free text (buttons if given). Outside: the approved
 * committee_issue_opened template, its description line carrying the news.
 */
async function tellCommittee(ctx: JobCtx, iss: Record<string, any>, text: string, line: string, subject: string, buttons?: [string, string][]) {
  if (!ctx.ready) return 0
  const { data: b } = await ctx.svc.from('buildings').select('name').eq('id', iss.building_id).maybeSingle()
  const { data: tpl } = await ctx.svc.from('message_templates').select('*').eq('key', 'committee_issue_opened').maybeSingle()
  const { data: u } = iss.unit_id ? await ctx.svc.from('units').select('number').eq('id', iss.unit_id).maybeSingle() : { data: null }
  let sent = 0
  for (const to of await committeePhones(ctx, iss)) {
    let payload: Record<string, unknown> | null = null
    let body = text
    if (await windowOpen(ctx.svc, to)) {
      payload = buttons?.length
        ? { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: text.slice(0, 1024) },
            action: { buttons: buttons.map(([title, id]) => ({ type: 'reply', reply: { id, title } })) } } }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4096) } }
    } else if (tpl?.active !== false && tpl?.meta_status === 'APPROVED') {
      const { data: m } = await ctx.svc.from('unit_residents').select('last_name, phone, units!inner(building_id, board_member)')
        .eq('units.building_id', iss.building_id).eq('units.board_member', true).eq('archived', false)
      const me = (m || []).find((r) => ctx.toE164(String(r.phone || '')) === to)
      const vars = [me?.last_name ? `משפחת ${me.last_name}` : 'חבר ועד', b?.name || 'הבניין', iss.category || 'כללי',
        `${whatOf(iss)} — ${line}`, u?.number ? `דירה ${u.number}` : '—'].map(ctx.cleanParam)
      body = ctx.render(tpl.body, vars)
      payload = { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl.meta_name, language: { code: tpl.language || 'he' },
        components: [{ type: 'body', parameters: vars.map((t) => ({ type: 'text', text: t })) }] } }
    }
    if (!payload) continue
    const r = await ctx.send(payload)
    if (r.ok) sent++
    await ctx.log({ recipient: to, audience: 'resident', building_id: iss.building_id, subject, body,
      status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error })
    await new Promise((res) => setTimeout(res, 300))
  }
  return sent
}

// ── Opening route ───────────────────────────────────────────────────────────
/**
 * A new issue, once: by its category's route in the building.
 *   vendor     straight to the standing contractor; committee + ועד1 told
 *   committee  the committee gets "ועד1 תטפל" / "הוועד יטפל"
 *   vaad1      ועד1 decides (handyman or quotes); the committee is told
 */
export async function routeNewIssue(ctx: JobCtx, issueId: string) {
  const { data: claimed } = await ctx.svc.from('issues').update({ routed_at: new Date().toISOString() })
    .eq('id', issueId).is('routed_at', null).select(ISSUE_COLS).maybeSingle()
  if (!claimed) return { ok: true, state: 'already' }
  const iss = claimed
  if (DONE.includes(iss.status)) return { ok: true, state: 'closed' }
  const { data: rule } = iss.category ? await ctx.svc.from('issue_routing_rules').select('route, vendor_name, notify_email, active')
    .eq('building_id', iss.building_id).eq('category', iss.category).maybeSingle() : { data: null }
  const { data: b } = await ctx.svc.from('buildings').select('name, street, house_number, city, handling_mode').eq('id', iss.building_id).maybeSingle()
  const route = (iss.route as string) || routeFor(rule, b)
  if (!iss.route) await ctx.svc.from('issues').update({ route }).eq('id', iss.id)
  const what = whatOf(iss)

  if (route === 'vendor') {
    const vendorName = String(rule!.vendor_name)
    // A resident's emergency may already have sent it (report_emergency); then only tell.
    if (!iss.handler) {
      await ctx.svc.from('issues').update({ handler: 'committee', handler_kind: 'contractor', stage: 'sent_to_vendor',
        status: 'acknowledged', vendor_name: vendorName, handled_at: new Date().toISOString() }).eq('id', iss.id)
    }
    const how = await dispatchContractor(ctx, iss, b, vendorName, rule?.notify_email || null)
    const line = `נותבה אוטומטית ל${vendorName}, הספק הקבוע של הבניין (${how}).`
    await tellCommittee(ctx, iss, `שלום, כאן ועד1.\nנפתחה פנייה: *${what}*\n${line}\nכשהטיפול מסתיים, סמנו אותה כטופלה באפליקציה.`,
      line, `נותבה לספק קבוע: ${what}`)
    await emailAdmins(ctx.svc, `נותבה לספק הקבוע: ${what}`, [`${b?.name || ''} · ${iss.category || ''}`, line], iss.building_id)
    return { ok: true, state: 'vendor', vendor: vendorName, how }
  }

  if (route === 'vaad1') {
    const r = await askVaad1(ctx, iss, 'route')
    await tellCommittee(ctx, iss, `שלום, כאן ועד1.\nנפתחה פנייה: *${what}*\nועד1 מטפלת בה — ${r.committeeLine}`,
      `ועד1 מטפלת: ${r.committeeLine}`, `ועד1 מטפלת: ${what}`)
    return { ok: true, state: 'vaad1', suggestion: r.suggestion }
  }

  // committee: the decision buttons, now.
  const urgentNote = iss.priority === 'urgent' ? '\n⚠️ חירום: אם לא תחליטו תוך שעה, ועד1 מטפלת בעצמה.'
    : iss.priority === 'high' ? '\nסומנה דחופה.' : ''
  const text = `שלום, כאן ועד1.\nנפתחה פנייה ב${b?.name || 'בניין'}:\n*${what}*${iss.description ? `\n${String(iss.description).slice(0, 300)}` : ''}${urgentNote}\n\n`
    + `ועד1 תטפל: אנחנו מחליטים אם לשלוח את איש האחזקה שלנו או לבקש הצעות מספקים. הצעת ספק מגיעה אליכם לאישור לפני כל הזמנה.\n`
    + `הוועד יטפל: אתם מטפלים בעצמכם וסוגרים את הפנייה באפליקציה.\n`
    + `לעריכת הפנייה לפני ההחלטה: ${APP}/issues`
  const sent = await tellCommittee(ctx, iss, text, 'ממתינה להחלטת הוועד באפליקציה: ועד1 תטפל או הוועד יטפל.', `להחלטת הוועד: ${what}`,
    [['ועד1 תטפל', `issue:${iss.id}:vaad1`], ['הוועד יטפל', `issue:${iss.id}:self`]])
  return { ok: true, state: 'committee', sent }
}

/** Send a new issue to the building's standing contractor. Returns how it went out. */
async function dispatchContractor(ctx: JobCtx, iss: Record<string, any>, b: Record<string, any> | null, vendorName: string, notifyEmail: string | null) {
  const { data: v } = await ctx.svc.from('vendors').select('id, name, contact_name, phone, email, contact_channel').eq('name', vendorName).maybeSingle()
  const ways: string[] = []
  // The category's standing address already got the opening email (analyze-issue).
  if (notifyEmail) ways.push('במייל')
  const channel = String(v?.contact_channel || 'auto')
  const to = v ? ctx.toE164(String(v.phone || '')) : null
  if (v && to && /^9725\d{8}$/.test(to) && ctx.ready && channel !== 'email' && channel !== 'phone') {
    const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'vendor_issue_dispatch').maybeSingle()
    const { data: ib } = await ctx.svc.from('issues').select('brief_token').eq('id', iss.id).maybeSingle()
    const link = briefLink(ib?.brief_token || null)
    const contact = await committeeContact(ctx, iss)
    if (t?.meta_status === 'APPROVED') {
      const vars = [vendorGreeting(v), addressOf(b), `${iss.priority === 'urgent' ? 'חירום — ' : ''}${[iss.title, iss.description].filter(Boolean).join(' — ')}${link ? ` | פרטים ותמונות: ${link}` : ''}`, contact].map(ctx.cleanParam)
      const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
        components: [{ type: 'body', parameters: vars.map((x) => ({ type: 'text', text: x })) }] } })
      await ctx.log({ recipient: to, audience: 'vendor', vendor_id: v.id, building_id: iss.building_id, template_key: 'vendor_issue_dispatch',
        subject: `קריאה לספק הקבוע: ${String(iss.title).slice(0, 120)}`, body: ctx.render(t.body, vars),
        status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error })
      if (r.ok) ways.push('בוואטסאפ')
    }
  }
  if (!ways.length) {
    await emailAdmins(ctx.svc, `לא הצלחנו לשלוח לספק הקבוע: ${iss.title}`,
      [`לספק ${vendorName} אין מייל קטגוריה או נייד לוואטסאפ. צריך להעביר לו ידנית.`], iss.building_id)
    return 'צריך להעביר ידנית — ועד1 עודכנה'
  }
  return ways.join(' ו')
}

/** Who the contractor calls to get in: the member in charge — surname + phone. */
async function committeeContact(ctx: JobCtx, iss: Record<string, any>) {
  if (iss.assigned_to) {
    const { data: m } = await ctx.svc.from('unit_residents').select('last_name, phone').eq('id', iss.assigned_to).maybeSingle()
    if (m) return [m.last_name ? `משפחת ${m.last_name}` : 'ועד הבית', m.phone].filter(Boolean).join(' ')
  }
  return 'ועד הבית'
}

// ── ועד1 decides ────────────────────────────────────────────────────────────
const SUGGEST_LABEL: Record<string, string> = { handyman: 'איש האחזקה', quotes: 'הצעות מספקים', admin: 'חברת המעליות של הבניין' }

/**
 * The issue is ועד1's (the committee said "ועד1 תטפל", the category routes to
 * ועד1, or nobody answered an emergency). The lift goes on at once; anything
 * else waits for the admin's choice (handyman / quotes), with a suggestion.
 */
async function askVaad1(ctx: JobCtx, iss: Record<string, any>, why: 'route' | 'committee' | 'no_answer') {
  const suggestion = decideHandling(iss)
  if (suggestion === 'admin') {
    await ctx.svc.from('issues').update({ handler: null, stage: null }).eq('id', iss.id)
    const r = await executeHandling(ctx, iss.id, 'admin')
    return { suggestion, committeeLine: r.text.replace(/^✅ /, ''), text: r.text }
  }
  const now = new Date().toISOString()
  await ctx.svc.from('issues').update({ handler: 'management', handler_kind: null, stage: 'awaiting_vaad1', status: 'acknowledged',
    handled_at: now, vaad1_suggestion: suggestion, vaad1_asked_at: now }).eq('id', iss.id)
  const urgent = isUrgent(iss.priority)
  const { data: b } = await ctx.svc.from('buildings').select('name').eq('id', iss.building_id).maybeSingle()
  const why_he = why === 'committee' ? 'הוועד ביקש שוועד1 תטפל' : why === 'no_answer' ? 'חירום בלי החלטת ועד שעה' : 'התחום מנותב לוועד1'
  const text = `ועד1 — החלטה נדרשת (${why_he})\n${b?.name || ''}: *${whatOf(iss)}*${iss.description ? `\n${String(iss.description).slice(0, 300)}` : ''}\n`
    + `${iss.category ? `תחום: ${iss.category}\n` : ''}${urgent ? `${iss.priority === 'urgent' ? 'חירום' : 'דחוף'}: אם לא תחליט תוך ${VAAD1_DECIDE_MIN} דקות, יוצא לפי ההמלצה.\n` : ''}`
    + `המלצה: ${SUGGEST_LABEL[suggestion]}.`
  let sent = 0
  for (const to of await adminPhones(ctx)) {
    if (await sendButtons(ctx, to, text, [['איש אחזקה', `v1:${iss.id}:handyman`], ['הצעות מספקים', `v1:${iss.id}:quotes`]],
      { building_id: iss.building_id, subject: `החלטת ועד1: ${whatOf(iss)}` })) sent++
  }
  await emailAdmins(ctx.svc, `${urgent ? '[דחוף] ' : ''}החלטה נדרשת: ${whatOf(iss)}`,
    [why_he, `${b?.name || ''} · ${iss.category || ''}`, `המלצה: ${SUGGEST_LABEL[suggestion]}.`,
      sent ? 'נשלחו לך כפתורים בוואטסאפ.' : 'אין חלון וואטסאפ פתוח — אפשר להחליט במסך התקלות.', `${APP}/issues`], iss.building_id)
  const committeeLine = `נעדכן בהמשך${urgent ? ' (תוך חצי שעה)' : ''}.`
  return { suggestion, committeeLine, text: `✅ התקבל. ועד1 מטפלת ב"${iss.title}"${iss.ticket_no ? ` (#${iss.ticket_no})` : ''} — ${committeeLine}` }
}

/** The admin's choice (WhatsApp button, the app, or the 30-minute default). */
export async function vaad1Decide(ctx: JobCtx, issueId: string, mode: 'handyman' | 'quotes', by: 'admin' | 'timeout') {
  const { data: iss } = await ctx.svc.from('issues').select(ISSUE_COLS).eq('id', issueId).maybeSingle()
  if (!iss) return { ok: false, text: 'התקלה לא נמצאה.' }
  if (iss.stage !== 'awaiting_vaad1') return { ok: false, text: `כבר הוחלט על "${iss.title}".` }
  // Claim it so a button and the timeout cannot both act.
  const { data: mine } = await ctx.svc.from('issues').update({ handler: null, handler_kind: null, stage: null })
    .eq('id', iss.id).eq('stage', 'awaiting_vaad1').select('id').maybeSingle()
  if (!mine) return { ok: false, text: `כבר הוחלט על "${iss.title}".` }
  const r = await executeHandling(ctx, iss.id, mode)
  const lead = by === 'timeout' ? 'לא התקבלה החלטה בזמן, אז יצא לפי ההמלצה. ' : ''
  await tellCommittee(ctx, iss, r.text, r.text.replace(/^✅ /, ''), `ועד1 החליטה: ${whatOf(iss)}`,
    r.ok ? undefined : [['הוועד יטפל', `issue:${iss.id}:self`]])
  if (by === 'timeout') await emailAdmins(ctx.svc, `יצא לפי ההמלצה (${SUGGEST_LABEL[mode]}): ${iss.title}`, [lead + r.text], iss.building_id)
  return { ok: r.ok, text: `${lead}${r.text}` }
}

// ── Committee buttons ───────────────────────────────────────────────────────
/** The committee said "ועד1 תטפל" (WhatsApp). It lands with ועד1 to decide. */
export async function takeIssue(ctx: JobCtx, issueId: string, fromPhone: string | null): Promise<{ ok: boolean; text: string }> {
  const { data: iss } = await ctx.svc.from('issues').select(ISSUE_COLS).eq('id', issueId).maybeSingle()
  if (!iss) return { ok: false, text: 'התקלה לא נמצאה. אפשר להחליט באפליקציה.' }
  if (fromPhone !== null && !(await isCommitteePhone(ctx.svc, iss.building_id, fromPhone))) return { ok: false, text: 'ההחלטה שמורה לחברי ועד הבניין, והמספר הזה לא רשום כחבר ועד.' }
  if (iss.handler || DONE.includes(iss.status)) return { ok: false, text: `כבר התקבלה החלטה על "${iss.title}". אפשר לראות באפליקציה.` }
  const r = await askVaad1(ctx, iss, fromPhone === null ? 'no_answer' : 'committee')
  return { ok: true, text: r.text }
}

/** Set the chosen handling going: quotes, the standing contractor, the lift, or the handyman. */
async function executeHandling(ctx: JobCtx, issueId: string, mode: string): Promise<{ ok: boolean; text: string }> {
  const { data: iss } = await ctx.svc.from('issues').select(ISSUE_COLS).eq('id', issueId).maybeSingle()
  if (!iss) return { ok: false, text: 'התקלה לא נמצאה.' }
  const title = String(iss.title)
  const tno = iss.ticket_no ? ` (#${iss.ticket_no})` : ''
  const now = new Date().toISOString()
  const urgent = isUrgent(iss.priority)

  if (mode === 'quotes') {
    const { data: b } = await ctx.svc.from('buildings').select('service_plan').eq('id', iss.building_id).maybeSingle()
    const { data: p } = await ctx.svc.from('service_plans').select('includes_auto_quotes').eq('key', b?.service_plan || 'basic').maybeSingle()
    if (!p?.includes_auto_quotes) {
      // Not in the plan: back to the committee's decision, and ועד1 knows.
      await ctx.svc.from('issues').update({ handler: null, handler_kind: null, stage: null, status: 'reported' }).eq('id', iss.id)
      await emailAdmins(ctx.svc, `צריך ספק מוסמך, הבניין במסלול בסיס: ${title}`,
        ['הצעות מספקים דרך ועד1 כלולות רק במסלול ליווי. הוועד עודכן ויכול לשדרג או לטפל בעצמו.'], iss.building_id)
      return { ok: false, text: `"${title}"${tno} דורשת ספק מוסמך. הצעות מספקים דרך ועד1 כלולות במסלול ליווי — אפשר לשדרג במסך "חשבון ועד1". עד אז ההחלטה אצל הוועד.` }
    }
    await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'vendor', stage: 'awaiting_quote_approval', status: 'acknowledged', handled_at: now }).eq('id', iss.id)
    const ids = await pickVendorsFor(ctx.svc, iss.id, ctx.toE164)
    const r = ids.length ? await sendJobOffers(ctx, { issueId: iss.id, vendorIds: ids, kind: 'quote', sentBy: null }) : { sent: 0 }
    const sent = Number((r as Record<string, unknown>).sent) || 0
    await emailAdmins(ctx.svc, `ועד1 → הצעות מספקים: ${title}`,
      [sent ? `נשלח ל-${sent} ספקים. ההצעה הזולה תגיע לוועד לאישור.` : 'לא נמצאו ספקים מאושרים עם נייד לתחום הזה — צריך לשלוח ידנית ממסך התקלות.'], iss.building_id)
    return { ok: true, text: `ועד1 ביקשה הצעות מספקים ל"${title}"${tno}. ההצעה הזולה תגיע אליכם לאישור — שום דבר לא יוזמן בלעדיכם.` }
  }

  if (mode === 'admin') {
    await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'contractor', stage: 'awaiting_assignment', status: 'acknowledged', handled_at: now }).eq('id', iss.id)
    await emailAdmins(ctx.svc, `ועד1 → מעלית: ${title}`, ['להעביר לחברת המעליות של הבניין (אין לבניין ספק קבוע מוגדר לתחום).'], iss.building_id)
    return { ok: true, text: `ועד1 מעבירה את "${title}"${tno} לחברת המעליות של הבניין. נעדכן בהמשך.` }
  }

  // handyman
  const { data: bb } = await ctx.svc.from('buildings').select('card_exhausted_policy').eq('id', iss.building_id).maybeSingle()
  if (bb?.card_exhausted_policy === 'block') {
    const { data: bal } = await ctx.svc.from('building_punch_balance').select('balance').eq('building_id', iss.building_id).maybeSingle()
    if ((Number(bal?.balance) || 0) < 1) {
      await ctx.svc.from('issues').update({ handler: null, handler_kind: null, stage: null, status: 'reported' }).eq('id', iss.id)
      return { ok: false, text: 'הכרטיסייה של הבניין נגמרה, ולכן איש האחזקה לא נשלח. אפשר לקנות כרטיסייה במסך "חשבון ועד1".' }
    }
  }
  await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'handyman', stage: urgent ? 'awaiting_assignment' : 'queued_for_visit',
    status: 'acknowledged', handled_at: now }).eq('id', iss.id)
  await sendJobOffers(ctx, { issueId: iss.id, kind: 'handyman', sentBy: null })
  const hour = await hourPrice(ctx, iss.building_id)
  const cost = `שעה מהכרטיסייה${hour ? `, או ₪${hour} לפני מע"מ לשעה (או חלק ממנה) אם אין כרטיסייה` : ''}.`
  if (isDiagnosis(iss) && !urgent) {
    return { ok: true, text: `איש האחזקה של ועד1 יבדוק את "${title}"${tno} בביקור הבא. אם צריך ספק מוסמך, תקבלו הצעה לאישור.\n${cost}` }
  }
  return { ok: true, text: `איש האחזקה של ועד1 יגיע ל"${title}"${tno} ${urgent ? 'בהקדם' : 'בביקור הבא'}. ${cost}` }
}

// ── Scheduler pieces ────────────────────────────────────────────────────────
/** What the opening trigger missed, emergencies nobody decided on, and ועד1's 30 minutes. */
async function autoTakeIssues(ctx: JobCtx) {
  const now = Date.now()
  const open = `(${DONE.join(',')})`
  const out: Record<string, unknown>[] = []

  // 1. Not routed yet (the trigger failed): route now. New ones only.
  const { data: missed } = await ctx.svc.from('issues').select('id').is('routed_at', null).not('status', 'in', open)
    .lte('created_at', new Date(now - ROUTE_GRACE_MIN * 60000).toISOString())
    .gte('created_at', new Date(now - 86400000).toISOString()).limit(20)
  for (const i of missed || []) out.push({ issueId: i.id, reason: 'route', ...(await routeNewIssue(ctx, i.id)) })

  // 2. The committee did not decide: an emergency after an hour, "דחוף" after four.
  for (const [prio, wait] of [['urgent', URGENT_WAIT_MIN], ['high', HIGH_WAIT_MIN]] as const) {
    const { data: rows } = await ctx.svc.from('issues').select('id')
      .is('handler', null).is('auto_taken_at', null).eq('priority', prio).not('status', 'in', open)
      .lte('created_at', new Date(now - wait * 60000).toISOString())
      .gte('created_at', new Date(now - 86400000).toISOString()).limit(20)   // an old forgotten one is not urgent now
    for (const i of rows || []) {
      const { data: claimed } = await ctx.svc.from('issues').update({ auto_taken_at: new Date().toISOString(), auto_taken_reason: `${prio}_no_answer` })
        .eq('id', i.id).is('auto_taken_at', null).is('handler', null).select(ISSUE_COLS).maybeSingle()
      if (!claimed) continue
      const r = await askVaad1(ctx, claimed, 'no_answer')
      const what = whatOf(claimed)
      const hours = prio === 'urgent' ? 'שעה' : 'ארבע שעות'
      await tellCommittee(ctx, claimed, `שלום, כאן ועד1.\nהתקלה ה${prio === 'urgent' ? 'דחופה (חירום)' : 'דחופה'} *${what}* חיכתה ${hours} בלי החלטה, אז ועד1 לקחה אותה.\n${r.committeeLine}`,
        `חיכתה ${hours} בלי החלטה, ועד1 לקחה אותה.`, `דחוף נלקח אוטומטית: ${what}`)
      out.push({ issueId: i.id, reason: `${prio}_no_answer` })
    }
  }

  // 3. ועד1 did not decide a דחוף/חירום within 30 minutes: the suggestion goes out.
  const { data: waiting } = await ctx.svc.from('issues').select('id, vaad1_suggestion').eq('stage', 'awaiting_vaad1')
    .in('priority', ['urgent', 'high']).lte('vaad1_asked_at', new Date(now - VAAD1_DECIDE_MIN * 60000).toISOString()).limit(20)
  for (const i of waiting || []) {
    const mode = i.vaad1_suggestion === 'quotes' ? 'quotes' : 'handyman'
    out.push({ issueId: i.id, reason: 'vaad1_timeout', ...(await vaad1Decide(ctx, i.id, mode, 'timeout')) })
  }
  return out
}

/** The resident who reported it hears on WhatsApp when it closes (once per closing). */
async function notifyClosed(ctx: JobCtx) {
  if (!ctx.ready) return 0
  const { data: rows } = await ctx.svc.from('issues').select('id, title, ticket_no, status, unit_id, building_id, closed_notified_at, reopened_at, close_reason')
    .in('status', DONE).gte('updated_at', new Date(Date.now() - 2 * 86400000).toISOString()).limit(50)
  const due = (rows || []).filter((i) => !i.closed_notified_at || (i.reopened_at && new Date(i.reopened_at) > new Date(i.closed_notified_at)))
  const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'resident_issue_update').maybeSingle()
  let sent = 0
  for (const i of due) {
    const { data: mine } = await ctx.svc.from('issues').update({ closed_notified_at: new Date().toISOString() })
      .eq('id', i.id).eq('status', i.status).select('id').maybeSingle()
    if (!mine || !i.unit_id || t?.meta_status !== 'APPROVED') continue
    const { data: residents } = await ctx.svc.from('unit_residents').select('last_name, phone, is_primary').eq('unit_id', i.unit_id).eq('archived', false)
    const r = (residents || []).find((x) => x.is_primary && x.phone) || (residents || []).find((x) => x.phone)
    const to = ctx.toE164(String(r?.phone || ''))
    if (!to || !/^9725\d{8}$/.test(to)) continue
    const news = i.status === 'rejected'
      ? `הפנייה נסגרה ללא טיפול${i.close_reason ? `: ${i.close_reason}` : ''}. לשאלות אפשר לפנות לוועד הבית. ועד1`
      : 'הפנייה טופלה ונסגרה. אם התקלה חזרה, אפשר לפתוח אותה מחדש באפליקציה. ועד1'
    const vars = [r?.last_name ? `משפחת ${r.last_name}` : 'דייר/ת', String(i.ticket_no || '—'), String(i.title || ''), news].map(ctx.cleanParam)
    const s = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
      components: [{ type: 'body', parameters: vars.map((x) => ({ type: 'text', text: x })) }] } })
    if (s.ok) sent++
    await ctx.log({ recipient: to, audience: 'resident', building_id: i.building_id, template_key: 'resident_issue_update',
      subject: `הפנייה נסגרה: ${String(i.title).slice(0, 120)}`, body: ctx.render(t.body, vars),
      status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
  }
  return sent
}

/** An issue the committee took on (or passed to its contractor), open a week: "טופל?" */
async function remindCommittee(ctx: JobCtx) {
  const cutoff = new Date(Date.now() - REMIND_DAYS * 86400000).toISOString()
  const { data: rows } = await ctx.svc.from('issues').select(ISSUE_COLS + ', handled_at, committee_reminded_at')
    .or('handler.eq.committee,handler_kind.eq.contractor').not('status', 'in', `(${DONE.join(',')})`)
    .lte('handled_at', cutoff).or(`committee_reminded_at.is.null,committee_reminded_at.lte.${cutoff}`).limit(30)
  let sent = 0
  for (const i of rows || []) {
    const { data: mine } = await ctx.svc.from('issues').update({ committee_reminded_at: new Date().toISOString() })
      .eq('id', i.id).select('id').maybeSingle()
    if (!mine) continue
    const days = Math.floor((Date.now() - new Date(i.handled_at).getTime()) / 86400000)
    const who = i.handler_kind === 'contractor' && i.vendor_name ? ` (אצל ${i.vendor_name})` : ''
    sent += await tellCommittee(ctx, i, `שלום, כאן ועד1.\nהפנייה *${whatOf(i)}*${who} פתוחה ${days} ימים. טופלה?`,
      `פתוחה ${days} ימים${who}. טופלה? אפשר לסמן באפליקציה.`, `תזכורת לוועד: ${whatOf(i)}`,
      [['טופל', `cr:${i.id}:done`], ['עדיין בטיפול', `cr:${i.id}:open`]])
  }
  return sent
}

/** The 7-day reminder's buttons. */
export async function handleReminderButton(ctx: JobCtx, from: string, payload: string) {
  const [, issueId, action] = payload.split(':')
  let text = ''
  if (action === 'done') {
    const { data: res } = await ctx.svc.rpc('close_issue_by_phone', { p_issue: issueId, p_phone: from })
    text = res === 'ok' ? '✅ נרשם שהפנייה טופלה ונסגרה. הדייר שדיווח יקבל עדכון.'
      : res === 'already_closed' ? 'הפנייה כבר סגורה.' : res === 'forbidden' ? 'רק חברי ועד הבניין יכולים לסגור פנייה.' : 'לא הצלחנו לסגור. אפשר לסגור באפליקציה.'
  } else {
    text = 'רשמנו. נזכיר שוב בעוד שבוע.'
  }
  if (!ctx.ready) return
  const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: text } })
  await ctx.log({ recipient: from, audience: 'resident', subject: 'תזכורת לוועד — תשובה', body: text,
    status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
}

// ── Recurring tasks ─────────────────────────────────────────────────────────
// A task with a due date reminds the committee ahead of time (30 days when the
// law requires it, 14 otherwise, or what the task says) and once more when the
// date passes. The reminder is where the work starts: one tap sends it to the
// task's regular vendor or out for quotes, as an ordinary issue. Closing that
// issue moves the task to its next date (DB trigger).
const TASK_COLS = 'id, building_id, title, frequency, next_due_date, is_required_by_law, notes, trade, vendor_id, remind_days, reminded_at, overdue_reminded_at, issue_id'
const ilToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)
const dm = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`

/** Whoever handles this kind of work in the building: the routing rule's member. */
async function taskOwner(ctx: JobCtx, buildingId: string, category: string) {
  const { data: rule } = await ctx.svc.from('issue_routing_rules').select('assigned_to')
    .eq('building_id', buildingId).eq('category', category).maybeSingle()
  return (rule?.assigned_to as string) || null
}

async function remindTasks(ctx: JobCtx) {
  if (!ctx.ready) return 0
  // Daytime only, never on Shabbat: a reminder is not an emergency.
  const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const hour = il.getHours(), dow = il.getDay()
  if (hour < 9 || hour >= 19 || dow === 6 || (dow === 5 && hour >= 13)) return 0
  const today = ilToday()
  const horizon = new Date(Date.parse(today + 'T00:00:00Z') + 120 * 86400000).toISOString().slice(0, 10)
  const { data: rows } = await ctx.svc.from('recurring_tasks').select(TASK_COLS)
    .not('next_due_date', 'is', null).is('issue_id', null).lte('next_due_date', horizon)
    .or('reminded_at.is.null,overdue_reminded_at.is.null').order('next_due_date').limit(60)
  let sent = 0
  for (const t of rows || []) {
    const days = dayDiff(String(t.next_due_date), today)
    const stage = days < 0 ? (t.overdue_reminded_at ? null : 'overdue') : (!t.reminded_at && days <= taskLeadDays(t) ? 'ahead' : null)
    if (!stage) continue
    const col = stage === 'overdue' ? 'overdue_reminded_at' : 'reminded_at'
    const now = new Date().toISOString()
    // Claim it, so two runs cannot both send. An overdue task skips the "ahead" one.
    const { data: mine } = await ctx.svc.from('recurring_tasks')
      .update(stage === 'overdue' ? { overdue_reminded_at: now, reminded_at: t.reminded_at || now } : { reminded_at: now })
      .eq('id', t.id).is(col, null).select('id').maybeSingle()
    if (!mine) continue
    const cat = taskIssueCategory(t.trade)
    const lift = cat === 'מעלית'
    const { data: v } = t.vendor_id ? await ctx.svc.from('vendors').select('name').eq('id', t.vendor_id).maybeSingle() : { data: null }
    const { data: b } = await ctx.svc.from('buildings').select('name').eq('id', t.building_id).maybeSingle()
    const law = t.is_required_by_law ? ' (חובה בחוק)' : ''
    const when = stage === 'overdue'
      ? `המועד עבר ב-${dm(String(t.next_due_date))}, לפני ${-days} ימים.`
      : days === 0 ? 'המועד היום.' : `לביצוע עד ${dm(String(t.next_due_date))}, בעוד ${days} ימים.`
    const text = `שלום, כאן ועד1.\nמשימה תקופתית ב${b?.name || 'בניין'}: *${t.title}*${law}\n${when}`
      + (v?.name ? `\nהספק הקבוע: ${v.name}.` : '') + `\nאפשר גם מהאפליקציה: ${APP}/recurring-tasks`
    const buttons: [string, string][] = []
    if (v?.name) buttons.push(['להזמין את הספק', `rt:${t.id}:vendor`])
    else if (lift) buttons.push(['לחברת המעליות', `rt:${t.id}:vendor`])
    if (!lift) buttons.push(['הצעות מחיר', `rt:${t.id}:quotes`])
    buttons.push(['כבר בוצע', `rt:${t.id}:done`])
    const pseudo = { building_id: t.building_id, assigned_to: await taskOwner(ctx, t.building_id, cat), category: cat, title: t.title, unit_id: null, ticket_no: null }
    sent += await tellCommittee(ctx, pseudo, text,
      `משימה תקופתית${law}. ${when} להזמנת ספק או הצעות מחיר: ${APP}/recurring-tasks`,
      `${stage === 'overdue' ? 'משימה תקופתית באיחור' : 'תזכורת משימה תקופתית'}: ${t.title}`, buttons)
  }
  return sent
}

/**
 * What the committee chose for a task: its regular vendor, quotes, or "done".
 * `fromPhone` is the WhatsApp number that pressed the button; null = the app,
 * where the caller was already checked.
 */
export async function taskAction(ctx: JobCtx, taskId: string, mode: string, fromPhone: string | null): Promise<{ ok: boolean; text: string }> {
  const { data: t } = await ctx.svc.from('recurring_tasks').select(TASK_COLS).eq('id', taskId).maybeSingle()
  if (!t) return { ok: false, text: 'המשימה לא נמצאה.' }
  if (fromPhone !== null && !(await isCommitteePhone(ctx.svc, t.building_id, fromPhone))) {
    return { ok: false, text: 'הפעולה שמורה לחברי ועד הבניין, והמספר הזה לא רשום כחבר ועד.' }
  }
  if (mode === 'done') {
    const { data: next, error } = await ctx.svc.rpc('complete_recurring_task', { p_task: t.id, p_via: fromPhone ? 'whatsapp' : 'app' })
    if (error || !next) return { ok: false, text: 'לא הצלחנו לעדכן את המשימה. אפשר לסמן באפליקציה.' }
    return { ok: true, text: `✅ נרשם ש"${t.title}" בוצעה. המועד הבא: ${dm(String(next))}.${String(next).slice(0, 4)}.` }
  }
  if (mode !== 'vendor' && mode !== 'quotes') return { ok: false, text: 'פעולה לא מוכרת.' }
  if (t.issue_id) {
    const { data: open } = await ctx.svc.from('issues').select('ticket_no, status').eq('id', t.issue_id).maybeSingle()
    if (open && !DONE.includes(open.status)) {
      return { ok: false, text: `כבר נפתחה פנייה${open.ticket_no ? ` #${open.ticket_no}` : ''} למשימה "${t.title}". אפשר לעקוב אחריה באפליקציה.` }
    }
  }
  const cat = taskIssueCategory(t.trade)
  const lift = cat === 'מעלית'
  const { data: v } = t.vendor_id ? await ctx.svc.from('vendors').select('id, name').eq('id', t.vendor_id).maybeSingle() : { data: null }
  if (mode === 'quotes' && lift) return { ok: false, text: 'מעליות מטופלות רק מול חברת המעליות של הבניין, בלי הצעות מחיר.' }
  if (mode === 'vendor' && !v && !lift) return { ok: false, text: `למשימה "${t.title}" לא הוגדר ספק קבוע. אפשר לבקש הצעות מחיר, או להגדיר ספק במסך המשימות.` }

  const today = ilToday()
  const overdue = !!t.next_due_date && String(t.next_due_date) < today
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    building_id: t.building_id, title: t.title,
    description: [`משימה תקופתית${t.is_required_by_law ? ' (חובה בחוק)' : ''}.`,
      t.next_due_date ? `${overdue ? 'המועד עבר ב-' : 'לביצוע עד '}${dm(String(t.next_due_date))}.${String(t.next_due_date).slice(0, 4)}.` : '', t.notes || ''].filter(Boolean).join(' '),
    category: cat, ai_category: t.trade || null, priority: overdue && t.is_required_by_law ? 'high' : 'medium',
    status: 'reported', reported_at: now, assigned_to: await taskOwner(ctx, t.building_id, cat),
  }
  // The committee already chose, so the opening route (its "ועד1 תטפל / הוועד יטפל"
  // question) is skipped. A lift task with no vendor of its own is the exception:
  // it opens as an ordinary lift issue and the building's lift rule routes it.
  if (mode === 'vendor' && v) {
    Object.assign(row, { route: 'vendor', routed_at: now, handler: 'committee', handler_kind: 'contractor', stage: 'sent_to_vendor',
      status: 'acknowledged', vendor_name: v.name, vendor_id: v.id, handled_at: now })
  } else if (mode === 'quotes') {
    Object.assign(row, { route: 'vaad1', routed_at: now })
  }
  const { data: iss, error } = await ctx.svc.from('issues').insert(row).select(ISSUE_COLS).maybeSingle()
  if (error || !iss) return { ok: false, text: 'לא הצלחנו לפתוח פנייה למשימה. אפשר לנסות שוב מהאפליקציה.' }
  // Two people pressing at once: the second issue is withdrawn.
  let link = ctx.svc.from('recurring_tasks').update({ issue_id: iss.id }).eq('id', t.id)
  link = t.issue_id ? link.eq('issue_id', t.issue_id) : link.is('issue_id', null)
  const { data: linked } = await link.select('id').maybeSingle()
  if (!linked) {
    await ctx.svc.from('issues').update({ status: 'rejected', close_reason: 'כפילות של משימה תקופתית', closed_notified_at: now, resolved_at: now }).eq('id', iss.id)
    return { ok: false, text: `כבר נפתחה פנייה למשימה "${t.title}". אפשר לעקוב אחריה באפליקציה.` }
  }
  const tno = iss.ticket_no ? ` #${iss.ticket_no}` : ''
  const tail = 'כשהעבודה מסתיימת, סמנו את הפנייה כטופלה והמשימה תעבור למועד הבא.'
  if (mode === 'vendor' && v) {
    const { data: b } = await ctx.svc.from('buildings').select('name, street, house_number, city').eq('id', t.building_id).maybeSingle()
    const how = await dispatchContractor(ctx, iss, b, String(v.name), null)
    return { ok: true, text: `✅ נפתחה פנייה${tno} ל"${t.title}" ונשלחה ל${v.name} (${how}). ${tail}` }
  }
  if (mode === 'quotes') {
    const r = await executeHandling(ctx, iss.id, 'quotes')
    return { ok: r.ok, text: r.ok ? `✅ נפתחה פנייה${tno}. ${r.text} ${tail}` : r.text }
  }
  return { ok: true, text: `✅ נפתחה פנייה${tno} ל"${t.title}". היא מנותבת לחברת המעליות של הבניין. ${tail}` }
}

/** The task reminder's buttons: "rt:<taskId>:vendor|quotes|done". */
export async function handleTaskButton(ctx: JobCtx, from: string, payload: string) {
  const [, taskId, mode] = payload.split(':')
  const r = await taskAction(ctx, taskId, mode, from)
  if (!ctx.ready) return
  const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: r.text } })
  await ctx.log({ recipient: from, audience: 'resident', subject: 'משימה תקופתית — תשובה', body: r.text,
    status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
}

/** The admin's WhatsApp buttons on a "החלטה נדרשת". */
export async function handleVaad1Button(ctx: JobCtx, from: string, payload: string) {
  const [, issueId, mode] = payload.split(':')
  const admins = await adminPhones(ctx, true)
  const me = ctx.toE164(from)
  const r = me && admins.includes(me) && (mode === 'handyman' || mode === 'quotes')
    ? await vaad1Decide(ctx, issueId, mode, 'admin')
    : { ok: false, text: 'ההחלטה הזאת שמורה לוועד1.' }
  if (!ctx.ready) return
  const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: r.text } })
  await ctx.log({ recipient: from, audience: 'resident', subject: 'החלטת ועד1', body: r.text,
    status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
}

// ── "ועד1 תטפל": decide who handles it and set it going ─────────────────────
/** Up to QUOTE_FANOUT agreed vendors with a mobile, ranked for the issue — what the app's "send to all" picks. */
export async function pickVendorsFor(svc: SupabaseClient, issueId: string, toE164: (p: string) => string | null) {
  const { data: iss } = await svc.from('issues').select('id, title, category, priority, building_id, ai_category, ai_search_terms').eq('id', issueId).maybeSingle()
  if (!iss) return []
  const { data: b } = await svc.from('buildings').select('id, geo_lat, geo_lng').eq('id', iss.building_id).maybeSingle()
  const { data: vendors } = await svc.from('vendors').select('*').eq('membership_status', 'agreed')
  const usable = (vendors || []).filter((v) => /^9725\d{8}$/.test(toE164(String(v.phone || '')) || ''))
  // deno-lint-ignore no-explicit-any
  return (rankVendorsForIssue(iss, usable, { building: b }) as any[]).slice(0, QUOTE_FANOUT).map((r) => r.vendor.id as string)
}

// ── A vendor's question before pricing ──────────────────────────────────────
const QWORD = /^(האם|מה|מהו|מהי|כמה|איפה|היכן|איך|כיצד|מתי|למה|מדוע|איזה|איזו|אילו|באיזה|באיזו|יש |אפשר|ניתן|מי )/
export const isQuestion = (t: string) => /[?？]/.test(t) || QWORD.test(String(t || '').trim())
const isBareAmount = (t: string) => /^\s*₪?\s*[\d,.]+\s*(₪|ש"ח|שח|שקל|שקלים)?\s*$/.test(t)
const QUESTION_HOURS = 6

/** Relay the question to the committee member in charge; tell the vendor; give him time. */
async function askCommittee(ctx: JobCtx, q: Record<string, any>, iss: Record<string, any> | null, b: Record<string, any> | null,
  vendor: Record<string, any>, from: string, text: string) {
  const meta = { vendor_id: q.vendor_id, building_id: q.building_id }
  const question = text.slice(0, 600)
  const phones = iss ? await committeePhones(ctx, iss) : []
  const { data: row } = await ctx.svc.from('quote_questions').insert({
    quote_id: q.id, issue_id: q.issue_id, building_id: q.building_id, vendor_id: q.vendor_id, question, committee_phones: phones,
  }).select('id').single()
  // Waiting for an answer must not cost him the job.
  const until = new Date(Date.now() + QUESTION_HOURS * 3600 * 1000)
  if (!q.deadline || new Date(q.deadline) < until) await ctx.svc.from('quotes').update({ deadline: until.toISOString() }).eq('id', q.id)

  const what = `${iss?.ticket_no ? `#${iss.ticket_no} ` : ''}${iss?.title || ''}`
  const text1 = `שלום, כאן ועד1.\nספק ששוקל לתת הצעה לתקלה *${what}* שואל:\n"${question}"\n\nכתבו כאן את התשובה, ונעביר אותה אליו. הפרטים שלכם לא מועברים.`
  let relayed = 0
  const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'committee_vendor_question').maybeSingle()
  for (const to of phones) {
    let payload: Record<string, unknown> | null = null
    let body = text1
    if (await windowOpen(ctx.svc, to)) {
      payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text1 } }
    } else if (t?.active && t.meta_status === 'APPROVED') {
      const vars = [what, question].map(ctx.cleanParam)
      body = ctx.render(t.body, vars)
      payload = { messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
        components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } }
    }
    if (!payload) continue
    const r = await ctx.send(payload)
    if (r.ok) relayed++
    await ctx.log({ recipient: to, audience: 'resident', building_id: q.building_id, template_key: 'committee_vendor_question',
      subject: `שאלה מספק: ${what.slice(0, 120)}`, body, status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null,
      external_id: r.wamid, error_message: r.error })
  }
  if (row) await ctx.svc.from('quote_questions').update({ relayed: relayed > 0 }).eq('id', row.id)
  await reply(ctx, from, `השאלה הועברה לוועד הבית, והתשובה תגיע אליך כאן.\nאם אפשר לתת מחיר גם בלי התשובה, כתוב את הסכום לפני מע"מ.`,
    { ...meta, subject: `שאלה הועברה לוועד: ${what.slice(0, 100)}` })
  await emailAdmins(ctx.svc, `ספק שאל שאלה: ${iss?.title || ''}`,
    [`${vendor.name} (${vendor.phone}) שאל על "${iss?.title || ''}" (${addressOf(b)}):`, `"${question}"`,
      relayed ? 'השאלה הועברה לחבר הוועד האחראי בוואטסאפ.' : 'לא הצלחנו להעביר לוועד בוואטסאפ (אין חלון שיחה פתוח ואין תבנית מאושרת). כדאי לענות לספק או לעדכן את הוועד.',
      `אם לא תהיה תשובה תוך ${QUESTION_HOURS} שעות, תקבל תזכורת.`], q.building_id)
}

/**
 * A committee member wrote to us. If a vendor question is waiting for this
 * phone, this is the answer: pass it on. True when it was handled here.
 */
export async function handleCommitteeAnswer(ctx: JobCtx, from: string, text: string) {
  if (!text) return false
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: rows } = await ctx.svc.from('quote_questions').select('*')
    .eq('status', 'pending').contains('committee_phones', [from]).gte('asked_at', since)
    .order('asked_at', { ascending: false }).limit(1)
  const qq = rows?.[0]
  if (!qq) return false
  await ctx.svc.from('quote_questions').update({ status: 'answered', answer: text.slice(0, 1000), answered_at: new Date().toISOString(), answered_by: from }).eq('id', qq.id)
  const c = await quoteContext(ctx, qq.quote_id)
  const meta = { building_id: qq.building_id }
  if (!c) return true
  const { q, iss } = c
  const until = new Date(Date.now() + QUESTION_HOURS * 3600 * 1000)
  const deadline = !q.deadline || new Date(q.deadline) < until ? until : new Date(q.deadline)
  if (BEFORE_AMOUNT.includes(q.stage)) await ctx.svc.from('quotes').update({ deadline: deadline.toISOString() }).eq('id', q.id)

  const { data: v } = await ctx.svc.from('vendors').select('phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  let ok = false
  if (to) {
    const r = await reply(ctx, to, `תשובת ועד הבית לשאלה שלך על "${iss?.title || ''}":\n${text.slice(0, 1000)}\n\n`
      + `כדי להגיש הצעה, כתוב כאן את הסכום לפני מע"מ, סופי לעבודה כפי שתוארה. אפשר להגיש עד ${ilWhen(deadline)}.`,
      { vendor_id: q.vendor_id, building_id: q.building_id, subject: `תשובת הוועד לשאלה: ${String(iss?.title || '').slice(0, 100)}` })
    ok = r.ok
  }
  const ack = ok ? '✅ התשובה הועברה לספק. תודה!' : 'רשמנו את התשובה, אבל לא הצלחנו להעביר אותה לספק כרגע. ועד1 תדאג שתגיע אליו.'
  const s = await ctx.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: ack } })
  await ctx.log({ recipient: from, audience: 'resident', ...meta, subject: 'אישור העברת תשובה לספק', body: ack,
    status: s.ok ? 'sent' : 'failed', delivery_status: s.ok ? 'sent' : null, external_id: s.wamid, error_message: s.error })
  if (!ok) await emailAdmins(ctx.svc, `תשובת ועד לא הגיעה לספק: ${iss?.title || ''}`,
    [`הוועד ענה: "${text.slice(0, 500)}"`, 'ההודעה לספק לא יצאה. צריך להעביר לו ידנית.'], qq.building_id)
  return true
}

/** Questions the committee did not answer within QUESTION_HOURS: tell ועד1 once. */
async function alertUnansweredQuestions(ctx: JobCtx) {
  const before = new Date(Date.now() - QUESTION_HOURS * 3600 * 1000).toISOString()
  const { data: rows } = await ctx.svc.from('quote_questions').select('*')
    .eq('status', 'pending').eq('admin_alerted', false).lte('asked_at', before).limit(50)
  for (const qq of rows || []) {
    const c = await quoteContext(ctx, qq.quote_id)
    await emailAdmins(ctx.svc, `שאלת ספק בלי תשובה ${QUESTION_HOURS} שעות: ${c?.iss?.title || ''}`,
      [`הספק ${c?.q?.vendor_name || ''} שאל: "${qq.question}"`, 'הוועד עוד לא ענה. כדאי להזכיר לו, או לענות לספק בעצמך.'], qq.building_id)
    await ctx.svc.from('quote_questions').update({ admin_alerted: true }).eq('id', qq.id)
  }
  return (rows || []).length
}
