// Job offers over WhatsApp — to vendors (for a quote) and to ועד1's handyman.
//
// Vendor:
//   1. "יש עבודה חדשה" + [מעוניין לתת הצעה] [לא מעוניין] — task and address only,
//      no contacts. A deadline: 24h, or 2h for an urgent issue.
//   2. Interested → link to details and photos, ask for the price BEFORE VAT,
//      final for the job as described; "ביקור" asks to see the place first.
//   3. A number → recorded as the quote; ask when they can do it.
//   4. The answer → "ההצעה הועברה לוועד הבית".
//   5. The committee picks one (award): the winner gets the contact, the
//      apartment and the rules; whoever else offered gets a thank-you.
// Handyman:
//   "עבודה חדשה" + [אגיע] [לא יכול] → when he will come.
//
// All prices are before VAT. Every message opens with "כאן ועד1" (the sender
// name on this number belongs to another business).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// ── Send ────────────────────────────────────────────────────────────────────
export async function sendJobOffers(ctx: JobCtx, opts: { issueId: string; vendorIds?: string[]; kind: 'quote' | 'handyman'; sentBy: string | null }) {
  const loaded = await loadIssue(ctx.svc, opts.issueId)
  if (!loaded) return { ok: false, error: 'issue_not_found' }
  const { iss, b } = loaded
  const address = addressOf(b)
  const desc = ctx.cleanParam([iss.title, iss.description].filter(Boolean).join(' — ')).slice(0, 600)
  const link = briefLink(iss.brief_token)
  const deadline = new Date(Date.now() + (iss.priority === 'urgent' ? 2 : 24) * 3600 * 1000)
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
    const fields = { stage: 'offered', status: 'pending', amount: null, available_when: null, visit_requested: false,
      deadline: deadline.toISOString(), sent_at: new Date().toISOString(), responded_at: null }
    const { data: q } = prev
      ? await ctx.svc.from('quotes').update(fields).eq('id', prev.id).select('id').single()
      : await ctx.svc.from('quotes').insert({ ...fields, issue_id: iss.id, vendor_id: v.id, building_id: iss.building_id,
          vendor_name: v.name, description: iss.title }).select('id').single()
    if (!q) { failed++; continue }
    const msg = await build(to, 'vendor_job_offer', [v.name, iss.category || 'כללי', desc, address].map(ctx.cleanParam),
      [`offer:${q.id}:yes`, `offer:${q.id}:no`], ['מעוניין לתת הצעה', 'לא מעוניין'],
      'vendor_quote_request', [v.name, address, `${desc}${link ? ` | פרטים ותמונות: ${link}` : ''}`, 'ועד1'].map(ctx.cleanParam))
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
const askAmountText = (link: string, deadline: Date | null) =>
  `תודה!${link ? ` הפרטים והתמונות כאן: ${link}` : ''}\n\n`
  + 'כדי להגיש הצעה, כתוב כאן את הסכום הכולל בשקלים, *לפני מע"מ*: עבודה וחלקים.\n\n'
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
  await ctx.svc.from('quotes').update({ amount, stage: 'awaiting_date', status: 'pending', responded_at: new Date().toISOString() }).eq('id', q.id)
  await reply(ctx, to, `קיבלנו: ${nis(amount)} לפני מע"מ, סופי לעבודה כפי שתוארה.\nמתי תוכל לבצע? כתוב יום ושעה משוערים.`,
    { vendor_id: q.vendor_id, building_id: q.building_id, subject: `הצעת מחיר התקבלה: ${String(iss?.title || '').slice(0, 100)}` })
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
    return
  }
  if (q.stage === 'awaiting_date') {
    await reply(ctx, from, 'כבר קיבלנו את הסכום שלך. מתי תוכל לבצע? כתוב יום ושעה משוערים.', { vendor_id: q.vendor_id, building_id: q.building_id, subject: 'הצעת מחיר: ממתין למועד' })
    return
  }
  await ctx.svc.from('quotes').update({ stage: 'awaiting_amount' }).eq('id', q.id)
  await reply(ctx, from, askAmountText(briefLink(iss?.brief_token || null), q.deadline ? new Date(q.deadline) : null),
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
    .eq('vendor_id', vendor.id).in('stage', OPEN_STAGES).gte('sent_at', since)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!q) return false
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
    if (amount != null) { await recordAmount(ctx, q, iss, from, text, amount); return true }
    if (q.stage === 'offered') {
      // A typed "yes" to the first message.
      if (/(^|[^א-ת])(מעוניין|מעוניינת|כן|מאשר|אשמח)(?![א-ת])/.test(text)) { await handleOfferButton(ctx, from, `offer:${q.id}:yes`, vendor); return true }
      return false
    }
    await reply(ctx, from, 'לא זיהינו סכום. כתוב רק את הסכום במספרים, לפני מע"מ (למשל 850).\nצריך לראות את המקום קודם? כתוב "ביקור".', { ...meta, subject: 'הצעת מחיר: לא זוהה סכום' })
    return true
  }

  // awaiting_date: any text is the date.
  const when = text.slice(0, 200)
  await ctx.svc.from('quotes').update({ available_when: when, stage: 'submitted' }).eq('id', q.id)
  const by = new Date(Math.max(Date.now(), q.deadline ? new Date(q.deadline).getTime() : 0) + 2 * 86400 * 1000)
  await reply(ctx, from, `ההצעה הועברה לוועד הבית. נעדכן אותך בכל מקרה עד ${ilDay(by)}.`, { ...meta, subject: `הצעה הוגשה: ${String(iss?.title || '').slice(0, 100)}` })
  await emailAdmins(ctx.svc, `הצעת מחיר חדשה: ${vendor.name} · ${nis(q.amount)} · ${iss?.title || ''}`,
    [`ספק: ${vendor.name} (${vendor.phone})`, `עבודה: ${iss?.title || ''}`, `סכום: ${nis(q.amount)} לפני מע"מ`, `מועד אפשרי: ${when}`,
      'אפשר לבחור את ההצעה במסך התקלות.'], q.building_id)
  return true
}

// ── The committee picks a quote ─────────────────────────────────────────────
export async function awardQuote(ctx: JobCtx, quoteId: string, sentBy: string | null) {
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

  // Who the vendor calls: the committee member who owns the issue, else ועד1.
  let contact = ''
  if (iss.assigned_to) {
    const { data: r } = await ctx.svc.from('unit_residents').select('last_name, phone, units(number)').eq('id', iss.assigned_to).maybeSingle()
    const u = (r?.units as unknown as { number?: string } | null)
    if (r) contact = [r.last_name, u?.number ? `דירה ${u.number}` : '', r.phone].filter(Boolean).join(' · ')
  }
  if (!contact) {
    const { data: a } = await ctx.svc.from('profiles').select('phone').eq('role', 'admin').not('phone', 'is', null).limit(1).maybeSingle()
    contact = `ועד1${a?.phone ? ` · ${a.phone}` : ''}`
  }
  let apt = ''
  if (iss.unit_id) {
    const { data: u } = await ctx.svc.from('units').select('number').eq('id', iss.unit_id).maybeSingle()
    if (u?.number) apt = `, דירה ${u.number}`
  }
  const address = addressOf(b)
  const link = briefLink(iss.brief_token)
  const out = { ok: true, winner: false, thanked: 0, notThanked: 0 }

  const { data: v } = await ctx.svc.from('vendors').select('id, name, phone').eq('id', q.vendor_id).maybeSingle()
  const to = ctx.toE164(String(v?.phone || ''))
  if (to && ctx.ready) {
    const text = `ההצעה שלך נבחרה ✅\nעבודה: ${iss.title}\nכתובת: ${address}${apt}\nאיש קשר בבניין: ${contact}\n`
      + `${q.available_when ? `מועד שציינת: ${q.available_when}\n` : ''}`
      + `מחיר סגור: ${nis(q.amount)} לפני מע"מ, לעבודה כפי שתוארה.\n\n`
      + 'אם בשטח מתגלה משהו שלא היה בתיאור, עצור ודווח לנו כאן לפני כל עבודה נוספת. תוספת אפשרית רק באישור הוועד דרך ועד1, ולא מול הדיירים או חברי הוועד.\n'
      + `התשלום ישירות מהבניין, לפי חשבונית.${link ? `\nפרטים ותמונות: ${link}` : ''}`
    if (await windowOpen(ctx.svc, to)) {
      const r = await reply(ctx, to, text, { vendor_id: q.vendor_id, building_id: iss.building_id, subject: `הצעתך נבחרה: ${String(iss.title).slice(0, 100)}`, sent_by: sentBy })
      out.winner = r.ok
    } else {
      const { data: t } = await ctx.svc.from('message_templates').select('*').eq('key', 'vendor_job_assignment').maybeSingle()
      if (t?.active && t.meta_status === 'APPROVED') {
        const vars = [v?.name, `${address}${apt}`, `${iss.title} · מחיר סגור ${nis(q.amount)} לפני מע"מ, לעבודה כפי שתוארה`,
          q.available_when || 'יתואם איתך', contact].map(ctx.cleanParam)
        const r = await ctx.send({ messaging_product: 'whatsapp', to, type: 'template', template: { name: t.meta_name, language: { code: t.language || 'he' },
          components: [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] } })
        await ctx.log({ recipient: to, audience: 'vendor', vendor_id: q.vendor_id, building_id: iss.building_id, template_key: 'vendor_job_assignment',
          subject: `הצעתך נבחרה: ${String(iss.title).slice(0, 100)}`, body: ctx.render(t.body, vars),
          status: r.ok ? 'sent' : 'failed', delivery_status: r.ok ? 'sent' : null, external_id: r.wamid, error_message: r.error, sent_by: sentBy })
        out.winner = r.ok
      }
    }
  }

  // A thank-you to everyone else who actually offered a price.
  for (const o of others || []) {
    if (!o.stage || !['submitted', 'awaiting_date'].includes(o.stage)) continue
    const { data: ov } = await ctx.svc.from('vendors').select('phone').eq('id', o.vendor_id).maybeSingle()
    const oto = ctx.toE164(String(ov?.phone || ''))
    if (oto && ctx.ready && await windowOpen(ctx.svc, oto)) {
      const r = await reply(ctx, oto, `תודה על ההצעה ל"${iss.title}". הפעם הוועד בחר הצעה אחרת. נפנה אליך שוב בעבודה הבאה.`,
        { vendor_id: o.vendor_id, building_id: iss.building_id, subject: `לא נבחר: ${String(iss.title).slice(0, 100)}`, sent_by: sentBy })
      if (r.ok) out.thanked++; else out.notThanked++
    } else out.notThanked++
  }
  return out
}
