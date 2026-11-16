// billing-statements — builds and sends ועד1's monthly statement to a building's treasurer.
//
//   Scheduler (GitHub Actions, 1st of the month, x-cron-secret):
//     {}                                  → previous month, every building whose
//                                           "automatic sending" switch is on
//   Admin (user JWT, role admin):
//     { buildingId, period?, force? }     → send one building now (the "שליחה לגזבר" button)
//     { buildingId, period?, preview: true } → return the email without sending
//   Treasurer (public statement page, no login; the statement token is the key):
//     { objection: { token, note } }      → holds the direct debit and emails the admin
//
// The treasurer does not pay: ועד1 collects by direct debit on debit_on
// (send date + statement_objection_days) unless an objection was raised.
//
// Nothing is sent for a building without a treasurer, and the scheduler never
// touches a building whose switch is off. One implementation of the wording for
// both paths: subject / intro / payment / footer come from billing_settings.

import { corsHeaders, json, serviceClient, identifyCaller, timingSafeEqual } from '../_shared/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP = 'https://app.vaad1.co.il'
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const TYPE_LABELS: Record<string, string> = {
  hours: 'שעות אחזקה', card: 'כרטיסייה', handle_fee: 'ועד1 מטפלת בספק', service_item: 'שירות',
  parts: 'חלקים', building_subscription: 'מנוי חודשי',
}

const nis = (n: unknown) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const periodLabel = (p: string) => { const [y, m] = p.split('-'); return `${MONTHS[Number(m) - 1] || m} ${y}` }
const fill = (t: string, v: Record<string, string>) => String(t || '').replace(/\{(building|month|total|debit_date)\}/g, (_, k) => v[k] ?? '')
const para = (t: string) => esc(t).replace(/\n/g, '<br>')

const ilToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const heDate = (iso: string) => iso.split('-').reverse().join('/')

function prevPeriod(): string {
  // Israel time: the run on the 1st bills the month that just ended.
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  now.setDate(1); now.setMonth(now.getMonth() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// deno-lint-ignore no-explicit-any
function emailHtml(s: any, building: string, w: any, vars: Record<string, string>) {
  // deno-lint-ignore no-explicit-any
  const lines = (s.lines || []) as any[]
  // deno-lint-ignore no-explicit-any
  const row = (l: any) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc([TYPE_LABELS[l.type] || l.type, l.note].filter(Boolean).join(' · '))}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap">${nis(l.amount)}</td></tr>`
  const billed = lines.filter((l) => l.approval !== 'awaiting')
  const awaiting = lines.filter((l) => l.approval === 'awaiting')
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0b1c30">
  <h2 style="margin:0 0 4px">ועד1 — חשבון חודשי</h2>
  <p style="margin:0 0 14px;color:#565e74">${esc(building)} · ${esc(periodLabel(s.period))}</p>
  <p style="font-size:14px;line-height:1.7">${para(fill(w.statement_intro, vars))}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">${billed.map(row).join('')}
    <tr><td style="padding:10px 0;font-weight:bold">סה"כ לחיוב (לפני מע"מ)</td><td style="padding:10px 0;font-weight:bold;text-align:left">${nis(s.total)}</td></tr>
  </table>
  ${awaiting.length ? `<p style="margin:16px 0 4px;font-weight:bold">ממתינים לאישור הוועד — לא נכללים בסכום (${nis(s.awaiting)})</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;color:#565e74">${awaiting.map(row).join('')}</table>` : ''}
  <p style="margin:20px 0"><a href="${APP}/statement/${s.token}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">לצפייה בחשבון</a></p>
  <p style="font-size:14px;line-height:1.7">${para(fill(w.statement_payment, vars))}</p>
  <p style="font-size:12px;color:#737686">${para(fill(w.statement_footer, vars))}</p>
</div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const svc = serviceClient()
    const body = await req.json().catch(() => ({}))

    // Public: the treasurer reports a problem from the statement page.
    if (body.objection) {
      const { data: r, error } = await svc.rpc('raise_statement_objection', { p_token: String(body.objection.token || ''), p_note: String(body.objection.note || '') })
      if (error) return json({ ok: false, error: 'failed' }, 400)
      if (r?.ok) {
        const { data: b } = await svc.from('buildings').select('name').eq('id', r.building_id).maybeSingle()
        const { data: admins } = await svc.from('profiles').select('email').eq('role', 'admin')
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif"><h3>הערת גזבר על חשבון חודשי — החיוב מעוכב</h3>
          <p>${esc(b?.name)} · ${esc(periodLabel(r.period))} · ${nis(r.total)}</p>
          <p style="white-space:pre-wrap;border-right:3px solid #f59e0b;padding-right:10px">${esc(String(body.objection.note || '').slice(0, 1000))}</p>
          <p>הוראת הקבע לא תצא עד שתסמנו "הבירור הסתיים" במסך חשבון ועד1.</p></div>`
        for (const a of admins || []) if (a.email) await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ to: a.email, subject: `הערת גזבר על חשבון ${periodLabel(r.period)} · ${b?.name || ''}`, html, buildingId: r.building_id, channel: 'email' }),
        }).catch(() => null)
      }
      return json({ ok: !!r?.ok, error: r?.error })
    }

    const CRON_SECRET = Deno.env.get('CRON_SECRET')
    const isCron = !!CRON_SECRET && timingSafeEqual(req.headers.get('x-cron-secret') || '', CRON_SECRET)
    const caller = isCron ? null : await identifyCaller(req, svc)
    const isAdmin = caller?.kind === 'user' && caller.role === 'admin'
    if (!isCron && !isAdmin) return json({ error: 'unauthorized' }, 401)

    const period: string = /^\d{4}-\d{2}$/.test(String(body.period || '')) ? body.period : prevPeriod()

    let q = svc.from('buildings').select('id, name, treasurer_resident_id, billing_email, statement_cc_committee, statement_auto_send')
    if (isCron) q = q.eq('statement_auto_send', true)          // the switch
    else if (body.buildingId) q = q.eq('id', body.buildingId)  // admin: one building, by hand
    else return json({ error: 'building_required' }, 400)
    const { data: buildings, error: bErr } = await q
    if (bErr) throw new Error(bErr.message)

    const { data: w } = await svc.from('billing_settings').select('*').eq('id', 'default').maybeSingle()
    const { data: integ } = await svc.from('messaging_integrations').select('*').eq('provider', 'whatsapp_cloud').maybeSingle()
    const { data: sec } = await svc.from('messaging_secrets').select('api_token').eq('provider', 'whatsapp_cloud').maybeSingle()
    const { data: tpl } = await svc.from('message_templates').select('*').eq('key', 'committee_monthly_statement').maybeSingle()

    const results: Record<string, unknown>[] = []
    for (const b of buildings || []) {
      const out: Record<string, unknown> = { building: b.name, period }
      results.push(out)
      if (!b.treasurer_resident_id) { out.skipped = 'no_treasurer'; continue }

      const { data: id, error: e1 } = await svc.rpc('build_statement', { p_building: b.id, p_period: period })
      if (e1 || !id) { out.error = e1?.message || 'build_failed'; continue }
      const { data: s } = await svc.from('billing_statements').select('*').eq('id', id).maybeSingle()
      if (!s) { out.error = 'statement_missing'; continue }
      if (s.status !== 'draft' && !body.force && !body.preview) { out.skipped = 'already_sent'; continue }
      if (!body.preview && (s.status === 'disputed' || s.status === 'paid')) { out.skipped = s.status; continue }
      const today = ilToday()
      const debitOn: string = s.debit_on && s.debit_on > today ? s.debit_on : addDays(today, Number(w?.statement_objection_days) || 7)

      const { data: t } = await svc.from('unit_residents').select('last_name, phone, email, unit_id').eq('id', b.treasurer_resident_id).maybeSingle()
      const vars = { building: b.name, month: periodLabel(period), total: nis(s.total), debit_date: heDate(debitOn) }
      const subject = fill(w?.statement_subject || 'ועד1 — חשבון חודשי {month} · {building}', vars)
      const html = emailHtml(s, b.name, w || {}, vars)
      if (body.preview) { out.subject = subject; out.html = html; out.total = s.total; continue }

      const emails = new Set<string>()
      const main = String(b.billing_email || t?.email || '').trim()
      if (main) emails.add(main)
      if (b.statement_cc_committee) {
        const { data: cm } = await svc.from('unit_residents').select('email, units!inner(building_id, board_member)')
          .eq('units.building_id', b.id).eq('units.board_member', true).eq('is_primary', true).eq('archived', false)
        for (const r of cm || []) if (String(r.email || '').trim()) emails.add(String(r.email).trim())
      }

      const sentTo: string[] = []
      for (const to of emails) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ to, subject, html, buildingId: b.id, channel: 'email' }),
        })
        if (r.ok) sentTo.push(to)
      }

      // WhatsApp to the treasurer: amount + link. Only with the approved template.
      let d = String(t?.phone || '').replace(/\D/g, '')
      if (d.startsWith('0')) d = '972' + d.slice(1)
      if (/^9725\d{8}$/.test(d) && integ?.enabled && integ.phone_number_id && sec?.api_token && tpl?.meta_status === 'APPROVED') {
        const params = [b.name, periodLabel(period), Number(s.total).toLocaleString('he-IL')]
        const g = await fetch(`https://graph.facebook.com/${integ.graph_version || 'v21.0'}/${integ.phone_number_id}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${sec.api_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: d, type: 'template', template: { name: tpl.meta_name, language: { code: tpl.language || 'he' }, components: [
            { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(s.token) }] }] } }),
        })
        const gd = await g.json().catch(() => ({}))
        await svc.from('notification_log').insert({
          channel: 'whatsapp', provider: 'whatsapp_cloud', recipient: d, audience: 'resident', template_key: 'committee_monthly_statement',
          building_id: b.id, unit_id: t?.unit_id || null, subject: `חשבון חודשי ${periodLabel(period)}`, body: `סה"כ ${nis(s.total)}`,
          status: g.ok ? 'sent' : 'failed', delivery_status: g.ok ? 'sent' : null, external_id: gd?.messages?.[0]?.id || null,
          error_message: g.ok ? null : String(gd?.error?.message || 'failed').slice(0, 300),
        })
        if (g.ok) sentTo.push(`whatsapp:${d}`)
      }

      if (sentTo.length) {
        await svc.from('billing_statements').update({ status: 'sent', debit_on: debitOn, sent_at: new Date().toISOString(), sent_to: sentTo.join(', '), updated_at: new Date().toISOString() }).eq('id', s.id)
        out.sent = sentTo; out.total = s.total; out.debit_on = debitOn
      } else out.error = 'no_channel'
    }
    return json({ ok: true, period, results })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
