// send-notification — sends email from the committee Gmail via SMTP.
//
// AUTHORIZATION (fail closed — this function was an open relay until 2026-10):
//   - service-role bearer (mcp-proxy / monthly-summary)  → free-form send
//   - admin/committee JWT                                → free-form send
//   - any other authenticated user (resident)            → ONLY the 'booking'
//     template: HTML + recipients are built server-side from the booking row,
//     which must belong to the caller's own unit.
//   - no/invalid token (anon key included)               → 401
//
// Collection emails (caseId present) are additionally gated by the building's
// collection_notifications_enabled toggle. Fail CLOSED — missing buildingId,
// a lookup error, or a null/disabled value all block.

import { corsHeaders, json, serviceClient, identifyCaller, isPrivileged } from '../_shared/mod.ts'

const GMAIL_USER = Deno.env.get('GMAIL_USER') || ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') || ''

// ── SMTP helpers ──────────────────────────────────────────────────

const enc = new TextEncoder()
const dec = new TextDecoder()

async function smtpRead(conn: Deno.Conn): Promise<string> {
  const buf = new Uint8Array(8192)
  let result = ''
  while (true) {
    const n = await conn.read(buf)
    if (!n) break
    result += dec.decode(buf.subarray(0, n))
    const last = result.trimEnd().split('\n').pop() || ''
    if (/^\d{3} /.test(last)) break
  }
  return result
}

async function smtpCmd(conn: Deno.Conn, cmd: string): Promise<string> {
  await conn.write(enc.encode(cmd + '\r\n'))
  return smtpRead(conn)
}

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/

// RFC 2047 encoded-word for non-ASCII subjects (Gmail mangles raw UTF-8 headers
// on some receivers).
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject
  const bytes = enc.encode(subject)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `=?UTF-8?B?${btoa(bin)}?=`
}

// ── Send via Gmail SMTP (port 465, implicit TLS) ─────────────────

async function sendGmail(to: string, subject: string, html: string): Promise<void> {
  // Reject header/SMTP injection before anything touches the wire.
  if (!EMAIL_RE.test(to)) throw new Error('invalid recipient address')
  if (/[\r\n]/.test(subject)) throw new Error('invalid subject')

  const conn = await Deno.connect({ hostname: 'smtp.gmail.com', port: 465 })
  const tls = await Deno.startTls(conn, { hostname: 'smtp.gmail.com' })
  const cmd = (c: string) => smtpCmd(tls, c)

  // Hard deadline: a stalled Gmail connection must not hang the function.
  const deadline = setTimeout(() => { try { tls.close() } catch { /* */ } }, 30_000)

  try {
    await smtpRead(tls) // greeting
    await cmd('EHLO localhost')

    // AUTH LOGIN
    const a1 = await cmd('AUTH LOGIN')
    if (!a1.startsWith('334')) throw new Error('AUTH rejected: ' + a1)
    const a2 = await cmd(btoa(GMAIL_USER))
    if (!a2.startsWith('334')) throw new Error('User rejected: ' + a2)
    const a3 = await cmd(btoa(GMAIL_APP_PASSWORD))
    if (!a3.startsWith('235')) throw new Error('Auth failed: ' + a3)

    const mf = await cmd(`MAIL FROM:<${GMAIL_USER}> BODY=8BITMIME`)
    if (!mf.startsWith('250')) throw new Error('MAIL FROM: ' + mf)
    const rt = await cmd(`RCPT TO:<${to}>`)
    if (!rt.startsWith('250')) throw new Error('RCPT TO: ' + rt)
    const dr = await cmd('DATA')
    if (!dr.startsWith('354')) throw new Error('DATA: ' + dr)

    // Simple text/html email — NO multipart, just direct HTML.
    // Dot-stuff the body so a line starting with "." can't terminate DATA early.
    const stuffedHtml = html.replace(/(^|\r\n)\./g, '$1..')
    const rawEmail = [
      `From: VaadPlus <${GMAIL_USER}>`,
      `To: <${to}>`,
      `Subject: ${encodeSubject(subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      stuffedHtml,
    ].join('\r\n')

    await tls.write(enc.encode(rawEmail + '\r\n.\r\n'))
    const sent = await smtpRead(tls)
    if (!sent.startsWith('250')) throw new Error('Send: ' + sent)

    await cmd('QUIT')
  } finally {
    clearTimeout(deadline)
    try { tls.close() } catch { /* */ }
  }
}

// ── Booking template (resident-safe path) ─────────────────────────
// Recipients + HTML are derived entirely server-side from the booking row, so
// a resident JWT can never pick an arbitrary recipient or body.

const SLOT_LABELS: Record<string, string> = {
  morning: 'בוקר', evening: 'ערב', full_day: 'שבת מלאה',
}
const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0)

function bookingHtml(resource: Record<string, unknown>, booking: Record<string, unknown>): string {
  const dateStr = new Date(String(booking.booking_date)).toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const slotLabel = SLOT_LABELS[String(booking.slot)] || String(booking.slot)
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 10px;color:#64748b;">${k}</td><td style="padding:6px 10px;font-weight:bold;">${v}</td></tr>`
  const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))
  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:18px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;">שיריון ${esc(resource.name)}</h2>
      </div>
      <div style="background:#f8fafc;padding:18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          ${row('תאריך', dateStr)}
          ${row('משבצת', esc(slotLabel))}
          ${row('שם המזמין', esc(booking.booker_name))}
          ${booking.booker_phone ? row('טלפון', esc(booking.booker_phone)) : ''}
          ${booking.booker_email ? row('מייל', esc(booking.booker_email)) : ''}
          ${Number(booking.price) > 0 ? row('מחיר', ils(Number(booking.price))) : ''}
        </table>
        <p style="margin-top:14px;color:#475569;">הבקשה התקבלה וממתינה לאישור נציג הוועד.</p>
      </div>
    </div>`
}

// ── Edge Function ────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const supabase = serviceClient()

    const caller = await identifyCaller(req, supabase)
    if (!caller) return json({ error: 'unauthorized' }, 401)

    let to = '', subject = '', html = ''
    let buildingId = body.buildingId || null
    let unitId = body.unitId || null
    const caseId = body.caseId || null
    const channel = body.channel || 'email'
    let recipients: Array<{ to: string; subject: string }> = []

    if (isPrivileged(caller)) {
      // Free-form send for admin/committee/service callers.
      ;({ to, subject, html } = body)
      if (!to || !subject || !html) {
        return json({ error: 'Missing to, subject, or html' }, 400)
      }
      recipients = [{ to, subject }]
    } else if (body.template === 'booking' && body.bookingId) {
      // Resident path: everything derived server-side from the caller's own booking.
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select('id, building_id, unit_id, resource_id, booker_name, booker_phone, booker_email, booking_date, slot, price, status')
        .eq('id', body.bookingId)
        .maybeSingle()
      if (bErr || !booking) return json({ error: 'booking_not_found' }, 404)
      if (caller.kind !== 'user' || !caller.unit_id || booking.unit_id !== caller.unit_id) {
        return json({ error: 'forbidden' }, 403)
      }
      if (booking.status !== 'pending') return json({ error: 'booking_not_pending' }, 400)

      const { data: resource } = await supabase
        .from('booking_resources')
        .select('id, name, notify_email')
        .eq('id', booking.resource_id)
        .maybeSingle()
      if (!resource) return json({ error: 'resource_not_found' }, 404)

      html = bookingHtml(resource, booking)
      buildingId = booking.building_id
      unitId = booking.unit_id
      if (resource.notify_email) {
        recipients.push({ to: resource.notify_email, subject: `שיריון חדש ממתין לאישור — ${resource.name}` })
      }
      if (booking.booker_email) {
        recipients.push({ to: booking.booker_email, subject: `בקשת השיריון שלך התקבלה — ${resource.name}` })
      }
      if (recipients.length === 0) return json({ success: true, sent: 0 })
    } else {
      return json({ error: 'forbidden' }, 403)
    }

    // ── Gate: collection emails (caseId present) are sent ONLY if the building's
    // toggle is EXPLICITLY enabled. Fail CLOSED — missing buildingId, a lookup
    // error, or a null/disabled value all block. (Previously this failed open.)
    if (caseId) {
      let enabled = false
      if (buildingId) {
        const { data: building } = await supabase
          .from('buildings')
          .select('collection_notifications_enabled')
          .eq('id', buildingId)
          .single()
        enabled = building?.collection_notifications_enabled === true
      }

      if (!enabled) {
        // Log as blocked (not failed) so we have an audit trail
        try {
          await supabase.from('notification_log').insert({
            building_id: buildingId,
            unit_id: unitId || null,
            case_id: caseId,
            channel,
            recipient: recipients[0]?.to || '',
            subject: recipients[0]?.subject || '',
            body: html,
            status: 'blocked',
            error_message: 'collection_notifications_disabled',
          })
        } catch { /* */ }

        return json({ success: false, blocked: true, reason: 'collection_notifications_disabled' })
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const results: Array<{ to: string; success: boolean; error?: string }> = []
    for (const r of recipients) {
      const sendResult = { success: false, error: '', provider: '' }
      if (GMAIL_USER && GMAIL_APP_PASSWORD) {
        try {
          await sendGmail(r.to, r.subject, html)
          sendResult.success = true
          sendResult.provider = 'gmail'
        } catch (err) {
          sendResult.error = `gmail_error: ${err instanceof Error ? err.message : String(err)}`
          sendResult.provider = 'gmail_failed'
        }
      } else {
        sendResult.error = 'no_gmail_credentials'
        sendResult.provider = 'none'
      }

      try {
        await supabase.from('notification_log').insert({
          building_id: buildingId || null,
          unit_id: unitId || null,
          case_id: caseId || null,
          channel,
          recipient: r.to,
          subject: r.subject,
          body: html,
          status: sendResult.success ? 'sent' : 'failed',
          error_message: sendResult.error || null,
        })
      } catch { /* */ }

      results.push({ to: r.to, success: sendResult.success, error: sendResult.error || undefined })
    }

    const allOk = results.every((r) => r.success)
    return json({
      success: allOk,
      sent: results.filter((r) => r.success).length,
      results,
      error: allOk ? undefined : results.find((r) => !r.success)?.error,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
