// green-whatsapp — sends WhatsApp via the GreenAPI gateway, or checks the
// instance connection. The GreenAPI token lives in messaging_secrets (service
// role only) and never reaches the browser.
//
// Actions:
//   { action: 'status' }                         → getStateInstance (test connection)
//   { action: 'send', chatId, message,           → sendMessage / sendFileByUrl
//     fileUrl?, fileName? }
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

    // Authenticate the caller and require an admin/committee role.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData } = await svc.auth.getUser(jwt)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'unauthorized' }, 401)
    const { data: prof } = await svc.from('profiles').select('role').eq('id', uid).single()
    if (!prof || !['admin', 'committee'].includes(prof.role)) {
      return json({ error: 'forbidden' }, 403)
    }

    const { action, chatId, message, fileUrl, fileName } = await req.json()

    const { data: integ } = await svc
      .from('messaging_integrations').select('*').eq('provider', 'greenapi').single()
    const { data: secret } = await svc
      .from('messaging_secrets').select('api_token').eq('provider', 'greenapi').single()

    const idInstance = integ?.id_instance
    const token = secret?.api_token
    // Expected state (nothing saved yet) — return 200 so the UI can show a
    // friendly message instead of a generic "non-2xx" error.
    if (!idInstance || !token) return json({ ok: false, error: 'not_configured' }, 200)

    const base = (integ.api_url || 'https://api.green-api.com').replace(/\/+$/, '')

    if (action === 'status') {
      const r = await fetch(`${base}/waInstance${idInstance}/getStateInstance/${token}`, {
        signal: AbortSignal.timeout(15000),
      })
      const j = await r.json().catch(() => ({}))
      const state = j?.stateInstance ?? null
      await svc.from('messaging_integrations')
        .update({ status: state || `http_${r.status}`, last_checked_at: new Date().toISOString() })
        .eq('provider', 'greenapi')
      return json({ ok: r.ok, state, raw: j })
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
