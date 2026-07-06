// green-whatsapp — sends WhatsApp via the GreenAPI gateway, or checks the
// instance connection. The GreenAPI token lives in messaging_secrets (service
// role only) and never reaches the browser.
//
// Actions:
//   { action: 'status' }                         → getStateInstance (test connection)
//   { action: 'send', chatId, message,           → sendMessage / sendFileByUrl
//     fileUrl?, fileName? }
//   { action: 'setup-replies' }                  → point GreenAPI's incoming
//     webhook at this function so vendor replies ("מאשר"/"מסרב") update
//     membership_status automatically.
//
// Incoming webhooks from GreenAPI (typeWebhook payloads) are authenticated by
// a dedicated shared token (messaging_secrets.webhook_token), NOT by user JWT.
//
// GUARDRAIL: this is committee→vendor tooling. Resident-facing dunning /
// collection messages must NOT be wired to auto-send through here — keep that
// human-initiated and toggle-gated (see the collection-email incident).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({}))

    // ── Incoming GreenAPI webhook (vendor reply) ─────────────────────────────
    // GreenAPI posts { typeWebhook, ... } with our webhook token in the
    // Authorization header. This path never uses user JWT.
    if (typeof body?.typeWebhook === 'string') {
      const provided = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
      const { data: sec } = await svc.from('messaging_secrets')
        .select('webhook_token').eq('provider', 'greenapi').maybeSingle()
      // Fail closed: no token configured → reject all webhooks.
      if (!sec?.webhook_token || provided !== sec.webhook_token) {
        return json({ error: 'unauthorized' }, 401)
      }
      if (body.typeWebhook !== 'incomingMessageReceived') return json({ ok: true, ignored: body.typeWebhook })

      const chat = String(body?.senderData?.chatId || '')
      const text = String(
        body?.messageData?.textMessageData?.textMessage ||
        body?.messageData?.extendedTextMessageData?.text || '',
      ).trim()
      if (!chat.endsWith('@c.us') || !text) return json({ ok: true, ignored: 'not_text' })

      // '972501234567@c.us' → match vendors by the last 9 digits.
      const digitsOnly = chat.replace(/\D/g, '')
      const last9 = digitsOnly.slice(-9)
      if (last9.length < 9) return json({ ok: true, ignored: 'bad_number' })
      const { data: vendors } = await svc.from('vendors')
        .select('id, name, phone, membership_status')
        .like('phone', `%${last9.slice(0, 2)}%`) // cheap prefilter; exact match below
      const vendor = (vendors || []).find((v) =>
        String(v.phone || '').replace(/\D/g, '').endsWith(last9))
      if (!vendor) return json({ ok: true, ignored: 'no_vendor_match' })

      // Classify the reply. Check decline FIRST ("לא מעוניין" contains "מעוניין").
      const declineRe = /מסרב|סירוב|לא מעוניין|לא מתאים|הסר אותי|תסיר/
      const approveRe = /מאשר|מעוניין|מסכים|אשר/
      let newStatus: string | null = null
      if (declineRe.test(text)) newStatus = 'declined'
      else if (approveRe.test(text)) newStatus = 'agreed'

      // Only auto-flip vendors that are in the invite flow — a random later
      // message from an approved vendor must not change their status.
      const current = vendor.membership_status || 'pending'
      if (newStatus && ['pending', 'invited'].includes(current)) {
        await svc.from('vendors').update({ membership_status: newStatus }).eq('id', vendor.id)
        // Audit trail of the inbound reply.
        await svc.from('notification_log').insert({
          channel: 'whatsapp_in', recipient: vendor.phone, status: 'received',
          subject: `תשובת ספק: ${vendor.name} → ${newStatus === 'agreed' ? 'אישר' : 'סירב'}`,
          body: text,
        }).then(() => {}, () => {})
        // Polite acknowledgement back to the vendor.
        const ack = newStatus === 'agreed'
          ? 'תודה! נרשמת כספק מאושר במאגר ועד פלוס — נפנה אליך כשתהיה קריאה מתאימה. בברכה, תומר — ועד פלוס'
          : 'תודה על המענה, הוסרת מרשימת הפניות. אם תתחרט — כתוב "מאשר". בברכה, תומר — ועד פלוס'
        try {
          const { data: integ2 } = await svc.from('messaging_integrations').select('*').eq('provider', 'greenapi').maybeSingle()
          const { data: secret2 } = await svc.from('messaging_secrets').select('api_token').eq('provider', 'greenapi').maybeSingle()
          if (integ2?.id_instance && secret2?.api_token && integ2.enabled === true) {
            const b = ((integ2.api_url && integ2.api_url.trim()) || `https://${String(integ2.id_instance).slice(0, 4)}.api.greenapi.com`).replace(/\/+$/, '')
            await fetch(`${b}/waInstance${integ2.id_instance}/sendMessage/${secret2.api_token}`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ chatId: chat, message: ack }),
              signal: AbortSignal.timeout(15000),
            })
          }
        } catch { /* ack is best-effort */ }
        return json({ ok: true, vendor: vendor.name, status: newStatus })
      }
      return json({ ok: true, ignored: newStatus ? `status_${current}` : 'no_keyword' })
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Authenticate the caller and require an admin/committee role.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData } = await svc.auth.getUser(jwt)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'unauthorized' }, 401)
    const { data: prof } = await svc.from('profiles').select('role').eq('id', uid).single()
    if (!prof || !['admin', 'committee'].includes(prof.role)) {
      return json({ error: 'forbidden' }, 403)
    }

    const { action, chatId, message, fileUrl, fileName } = body

    // Save credentials through the service role (avoids any RLS-write ambiguity
    // on the secret). Admin only.
    if (action === 'save') {
      if (prof.role !== 'admin') return json({ error: 'forbidden' }, 403)
      const cfg = body.config || {}
      const hasNewToken = typeof body.api_token === 'string' && body.api_token.trim().length > 0
      await svc.from('messaging_integrations').upsert({
        provider: 'greenapi',
        id_instance: cfg.id_instance ?? null,
        api_url: cfg.api_url ?? null,
        sender_number: cfg.sender_number ?? null,
        sender_label: cfg.sender_label ?? null,
        enabled: cfg.enabled === true,
        ...(hasNewToken ? { has_token: true } : {}),
        updated_at: new Date().toISOString(),
      })
      if (hasNewToken) {
        await svc.from('messaging_secrets').upsert({
          provider: 'greenapi', api_token: body.api_token.trim(), updated_at: new Date().toISOString(),
        })
      }
      const { data: sec } = await svc.from('messaging_secrets')
        .select('api_token').eq('provider', 'greenapi').maybeSingle()
      return json({ ok: true, has_token: !!sec?.api_token })
    }

    const { data: integ } = await svc
      .from('messaging_integrations').select('*').eq('provider', 'greenapi').maybeSingle()
    const { data: secret } = await svc
      .from('messaging_secrets').select('api_token').eq('provider', 'greenapi').maybeSingle()

    const idInstance = integ?.id_instance
    const token = secret?.api_token
    // Expected state (nothing saved yet) — return 200 so the UI can show a
    // friendly message instead of a generic "non-2xx" error.
    if (!idInstance || !token) return json({ ok: false, error: 'not_configured' }, 200)

    // GreenAPI host: use the configured apiUrl, else derive from the instance
    // prefix (e.g. 7103… → https://7103.api.greenapi.com).
    const prefix = String(idInstance).slice(0, 4)
    const base = ((integ.api_url && integ.api_url.trim()) || `https://${prefix}.api.greenapi.com`)
      .replace(/\/+$/, '')

    // Point GreenAPI's incoming-message webhook at this function so vendor
    // replies auto-update membership_status. Generates (or reuses) a dedicated
    // webhook token — the only credential GreenAPI presents when calling us.
    if (action === 'setup-replies') {
      if (prof.role !== 'admin') return json({ error: 'forbidden' }, 403)
      const { data: sec } = await svc.from('messaging_secrets')
        .select('webhook_token').eq('provider', 'greenapi').maybeSingle()
      const webhookToken = sec?.webhook_token || crypto.randomUUID().replace(/-/g, '')
      if (!sec?.webhook_token) {
        await svc.from('messaging_secrets')
          .update({ webhook_token: webhookToken, updated_at: new Date().toISOString() })
          .eq('provider', 'greenapi')
      }
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/green-whatsapp`
      const r = await fetch(`${base}/waInstance${idInstance}/setSettings/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
          webhookUrlToken: webhookToken,
          incomingWebhook: 'yes',
        }),
        signal: AbortSignal.timeout(15000),
      })
      const j = await r.json().catch(() => ({}))
      return json({ ok: r.ok, webhookUrl, result: j }, r.ok ? 200 : 502)
    }

    if (action === 'status') {
      const r = await fetch(`${base}/waInstance${idInstance}/getStateInstance/${token}`, {
        signal: AbortSignal.timeout(15000),
      })
      const j = await r.json().catch(() => ({}))
      const state = j?.stateInstance ?? null
      await svc.from('messaging_integrations')
        .update({ status: state || `http_${r.status}`, last_checked_at: new Date().toISOString() })
        .eq('provider', 'greenapi')
      return json({ ok: r.ok, state, has_token: true, base, raw: j })
    }

    if (action === 'send') {
      if (integ.enabled !== true) return json({ error: 'integration_disabled' }, 400)
      if (!chatId) return json({ error: 'chatId_required' }, 400)
      let r: Response
      if (fileUrl) {
        r = await fetch(`${base}/waInstance${idInstance}/sendFileByUrl/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chatId, urlFile: fileUrl, fileName: fileName || 'file', caption: message || '' }),
          signal: AbortSignal.timeout(20000),
        })
      } else {
        r = await fetch(`${base}/waInstance${idInstance}/sendMessage/${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chatId, message: message || '' }),
          signal: AbortSignal.timeout(20000),
        })
      }
      const j = await r.json().catch(() => ({}))
      return json({ ok: r.ok, result: j }, r.ok ? 200 : 502)
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown' }, 500)
  }
})
