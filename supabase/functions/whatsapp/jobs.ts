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
import { rankVendorsForIssue } from '../_shared/vendorMatch.js'
import { decideHandling } from '../_shared/handling.js'

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
  if (priority === 'urgent') {
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
  const hours = iss.priority === 'urgent' ? Number(ss?.quote_hours_urgent) || 3 : Number(ss?.quote_hours_normal) || 24
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
    const { data: hm } = await ctx.svc.from('vendors').select('id, name, phone').eq('is_internal', true).limit(1).maybeSingle()
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
    .select('id, name, phone, is_blacklisted, is_internal').in('id', (opts.vendorIds || []).slice(0, 10))
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
    const msg = await build(to, 'vendor_job_offer', [v.name, iss.category || 'כללי', jobDesc, address].map(ctx.cleanParam),
      [`offer:${q.id}:yes`, `offer:${q.id}:no`], ['מעוניין לתת הצעה', 'לא מעוניין'],
      'vendor_quote_request', [v.name, address, `${jobDesc}${link ? ` | פרטים ותמונות: ${link}` : ''}`, 'ועד1'].map(ctx.cleanParam))
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
    const { data: v } = await ctx.svc.from('vendors').select('name, phone').eq('id', q.vendor_id).maybeSingle()
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
  await ctx.svc.from('quotes').update({ stage: 'awaiting_amount' }).eq('id', q.id)
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
      if (q.stage === 'offered') await ctx.svc.from('quotes').update({ stage: 'awaiting_amount' }).eq('id', q.id)
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
async function sendJobTaken(ctx: JobCtx, q: Record<string, any>, title: string, offered: boolean, sentBy: string | null) {
  const { data: v } = await ctx.svc.from('vendors').select('name, phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  if (!to || !ctx.ready) return false
  const meta = { vendor_id: q.vendor_id, building_id: q.building_id, subject: `העבודה נתפסה: ${title.slice(0, 100)}`, sent_by: sentBy }
  if (await windowOpen(ctx.svc, to)) {
    const text = offered
      ? `תודה על ההצעה ל"${title}". הפעם העבודה נתפסה. נפנה אליך שוב בעבודה הבאה.`
      : `העבודה "${title}" כבר נתפסה. תודה על הזמינות, נפנה אליך שוב בעבודה הבאה.`
    return (await reply(ctx, to, text, meta)).ok
  }
  const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'vendor_job_closed').maybeSingle()
  if (!t?.active || t.meta_status !== 'APPROVED') return false
  const vars = [v?.name, title].map(ctx.cleanParam)
  const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
    components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } })
  await ctx.log({ recipient: to, audience: 'vendor', template_key: 'vendor_job_closed', body: ctx.render(t.body, vars),
    status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, ...meta })
  return r.ok
}

/** Close the request without picking anyone: every vendor still in it hears the job was taken. */
export async function closeQuotes(ctx: JobCtx, issueId: string, sentBy: string | null) {
  const loaded = await loadIssue(ctx.svc, issueId)
  if (!loaded) return { ok: false, error: 'not_found' }
  await ctx.svc.from('quote_questions').update({ status: 'closed' }).eq('issue_id', issueId).eq('status', 'pending')
  const { data: open } = await ctx.svc.from('quotes').select('*').eq('issue_id', issueId)
    .in('stage', OPEN_STAGES.concat('submitted'))
  let told = 0, notTold = 0
  for (const q of open || []) {
    await ctx.svc.from('quotes').update({ stage: 'lost', status: 'rejected' }).eq('id', q.id)
    if (await sendJobTaken(ctx, q, String(loaded.iss.title), q.amount != null && Number(q.amount) > 0, sentBy)) told++; else notTold++
  }
  return { ok: true, closed: (open || []).length, told, notTold }
}

// ── The committee picks a quote ─────────────────────────────────────────────
export async function awardQuote(ctx: JobCtx, quoteId: string, sentBy: string | null, opts: { contact?: string; coordinate?: boolean } = {}) {
  const c = await quoteContext(ctx, quoteId)
  if (!c || !c.iss) return { ok: false, error: 'not_found' }
  const { q, iss, b } = c
  if (q.amount == null) return { ok: false, error: 'no_amount' }

  const { data: others } = await ctx.svc.from('quotes').select('id, vendor_id, stage, status').eq('issue_id', iss.id).neq('id', q.id)
  await ctx.svc.from('quotes').update({ status: 'accepted', stage: q.stage ? 'won' : null }).eq('id', q.id)
  for (const o of others || []) {
    const patch: Record<string, unknown> = {}
    if (['pending', 'received'].includes(o.status)) patch.status = 'rejected'
    if (o.stage && OPEN_STAGES.concat('submitted').includes(o.stage)) patch.stage = 'lost'
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

  const { data: v } = await ctx.svc.from('vendors').select('id, name, phone').eq('id', q.vendor_id).maybeSingle()
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
        const vars = [v?.name, `${address}${apt}`, `${iss.title} · מחיר סגור ${nis(q.amount)} לפני מע"מ, לעבודה כפי שתוארה`,
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
    if (!o.stage || !OPEN_STAGES.concat('submitted').includes(o.stage)) continue
    const { data: full } = await ctx.svc.from('quotes').select('*').eq('id', o.id).maybeSingle()
    if (full && await sendJobTaken(ctx, full, String(iss.title), full.amount != null && Number(full.amount) > 0, sentBy)) out.thanked++
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
  const { data: v } = await ctx.svc.from('vendors').select('name, phone').eq('id', q.vendor_id).maybeSingle()
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
  return { ok: true, issues: ids.length, results: out, questionsAlerted: alerted }
}

// ── "ועד1 תטפל": decide who handles it and set it going ─────────────────────
/** Three agreed vendors with a mobile, ranked for the issue — what the app's "send to all" picks. */
export async function pickVendorsFor(svc: SupabaseClient, issueId: string, toE164: (p: string) => string | null) {
  const { data: iss } = await svc.from('issues').select('id, title, category, priority, building_id, ai_category, ai_search_terms').eq('id', issueId).maybeSingle()
  if (!iss) return []
  const { data: b } = await svc.from('buildings').select('id, geo_lat, geo_lng').eq('id', iss.building_id).maybeSingle()
  const { data: vendors } = await svc.from('vendors').select('*').eq('membership_status', 'agreed')
  const usable = (vendors || []).filter((v) => /^9725\d{8}$/.test(toE164(String(v.phone || '')) || ''))
  // deno-lint-ignore no-explicit-any
  return (rankVendorsForIssue(iss, usable, { building: b }) as any[]).slice(0, 3).map((r) => r.vendor.id as string)
}

/**
 * The committee said "ועד1 תטפל" (WhatsApp). ועד1 decides, like a management
 * company's manager: the building's regular contractor, the handyman, or
 * quotes from vendors. Returns the Hebrew line for the committee.
 */
export async function takeIssue(ctx: JobCtx, issueId: string, fromPhone: string): Promise<{ ok: boolean; text: string }> {
  const { data: iss } = await ctx.svc.from('issues')
    .select('id, title, category, priority, status, handler, building_id, ticket_no').eq('id', issueId).maybeSingle()
  if (!iss) return { ok: false, text: 'התקלה לא נמצאה. אפשר להחליט באפליקציה.' }
  if (!(await isCommitteePhone(ctx.svc, iss.building_id, fromPhone))) return { ok: false, text: 'ההחלטה שמורה לחברי ועד הבניין, והמספר הזה לא רשום כחבר ועד.' }
  if (iss.handler || DONE.includes(iss.status)) return { ok: false, text: `כבר התקבלה החלטה על "${iss.title}". אפשר לראות באפליקציה.` }
  const title = String(iss.title)
  const now = new Date().toISOString()
  const urgent = iss.priority === 'urgent'

  // 1. A regular contractor for this category (the lift company, the cleaner).
  const { data: rule } = iss.category ? await ctx.svc.from('issue_routing_rules').select('vendor_name, send_to_vendor')
    .eq('building_id', iss.building_id).eq('category', iss.category).eq('active', true).maybeSingle() : { data: null }
  let mode = rule?.send_to_vendor && rule.vendor_name ? 'contractor' : decideHandling(iss)

  if (mode === 'quotes') {
    const { data: b } = await ctx.svc.from('buildings').select('service_plan').eq('id', iss.building_id).maybeSingle()
    const { data: p } = await ctx.svc.from('service_plans').select('includes_auto_quotes').eq('key', b?.service_plan || 'basic').maybeSingle()
    if (!p?.includes_auto_quotes) {
      await ctx.svc.from('issues').update({ handler: 'committee', handler_kind: 'vendor', stage: null, status: 'in_progress', handled_at: now }).eq('id', iss.id)
      return { ok: true, text: `"${title}" דורשת ספק מוסמך. במסלול שלכם פונים לספק בעצמכם — באפליקציה יש ספקים מאושרים מהמאגר לתחום הזה.` }
    }
    await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'vendor', stage: 'awaiting_quote_approval', status: 'acknowledged', handled_at: now }).eq('id', iss.id)
    const ids = await pickVendorsFor(ctx.svc, iss.id, ctx.toE164)
    const r = ids.length ? await sendJobOffers(ctx, { issueId: iss.id, vendorIds: ids, kind: 'quote', sentBy: null }) : { sent: 0 }
    const sent = Number((r as Record<string, unknown>).sent) || 0
    await emailAdmins(ctx.svc, `ועד1 תטפל → הצעות מספקים: ${title}`,
      [sent ? `נשלח ל-${sent} ספקים. ההצעה הזולה תגיע לוועד לאישור.` : 'לא נמצאו ספקים מאושרים עם נייד לתחום הזה — צריך לשלוח ידנית ממסך התקלות.'], iss.building_id)
    return { ok: true, text: `✅ ועד1 מטפלת ב"${title}". זו עבודה לספק מוסמך, אז ביקשנו הצעות מספקים. תקבלו כאן את ההצעה הזולה מספק שיכול לבצע ${urgent ? 'היום' : 'בשבוע הקרוב'}, ושום דבר לא יוזמן בלי אישורכם.` }
  }

  if (mode === 'contractor') {
    await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'contractor', stage: 'awaiting_assignment', status: 'acknowledged', vendor_name: rule!.vendor_name, handled_at: now }).eq('id', iss.id)
    await emailAdmins(ctx.svc, `ועד1 תטפל → הספק הקבוע: ${title}`, [`להעביר ל${rule!.vendor_name}, הספק הקבוע של הבניין לתחום הזה.`], iss.building_id)
    return { ok: true, text: `✅ ועד1 מטפלת ב"${title}" ומעבירה ל${rule!.vendor_name}, הספק הקבוע של הבניין. ללא חיוב מאיתנו.` }
  }

  if (mode === 'admin') {
    await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'contractor', stage: 'awaiting_assignment', status: 'acknowledged', handled_at: now }).eq('id', iss.id)
    await emailAdmins(ctx.svc, `ועד1 תטפל → מעלית: ${title}`, ['להעביר לחברת המעליות של הבניין (אין לבניין ספק קבוע מוגדר לתחום).'], iss.building_id)
    return { ok: true, text: `✅ ועד1 מטפלת ב"${title}" ומעבירה לחברת המעליות של הבניין. נעדכן אתכם.` }
  }

  // handyman
  const { data: bb } = await ctx.svc.from('buildings').select('card_exhausted_policy').eq('id', iss.building_id).maybeSingle()
  if (bb?.card_exhausted_policy === 'block') {
    const { data: bal } = await ctx.svc.from('building_punch_balance').select('balance').eq('building_id', iss.building_id).maybeSingle()
    const balance = Number(bal?.balance) || 0
    if (balance < 1) return { ok: false, text: 'הכרטיסייה של הבניין נגמרה, ולכן איש האחזקה לא נשלח. אפשר לקנות כרטיסייה במסך "חשבון ועד1".' }
  }
  await ctx.svc.from('issues').update({ handler: 'management', handler_kind: 'handyman', stage: urgent ? 'awaiting_assignment' : 'queued_for_visit',
    status: 'acknowledged', handled_at: now }).eq('id', iss.id)
  await sendJobOffers(ctx, { issueId: iss.id, kind: 'handyman', sentBy: null })
  const hour = await hourPrice(ctx, iss.building_id)
  return { ok: true, text: `✅ ועד1 מטפלת ב"${title}": איש האחזקה שלנו ${urgent ? 'יגיע בהקדם' : 'יגיע בביקור הבא'}. `
    + `שעה מהכרטיסייה${hour ? `, או ₪${hour} לפני מע"מ לשעה אם אין כרטיסייה` : ''}.` }
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
