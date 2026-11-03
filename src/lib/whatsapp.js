// System WhatsApp sending. Two providers:
//  - whatsapp_cloud — the official WhatsApp Business (Meta Cloud API), via the
//    `whatsapp` Edge Function. Business-initiated messages must use a template
//    Meta approved, so callers pass { template: { key, variables } }.
//  - greenapi — the older gateway (vendor-only), via `green-whatsapp`.
// The official channel wins when enabled. If nothing is enabled or a send
// fails, we fall back to a manual wa.me / tel link so the committee always has
// a working path. Every system send is written to notification_log server-side.

import { supabase } from './supabase'
import { waNumber, waLink, telHref } from './phone'

let _providerCache // undefined = not yet fetched

// 'whatsapp_cloud' | 'greenapi' | null — cached after first read.
export async function getWhatsappProvider() {
  if (_providerCache !== undefined) return _providerCache
  const { data } = await supabase
    .from('messaging_integrations').select('provider, enabled').in('provider', ['whatsapp_cloud', 'greenapi'])
  const on = new Set((data || []).filter((r) => r.enabled).map((r) => r.provider))
  _providerCache = on.has('whatsapp_cloud') ? 'whatsapp_cloud' : on.has('greenapi') ? 'greenapi' : null
  return _providerCache
}

export async function isWhatsappSystemEnabled() {
  return !!(await getWhatsappProvider())
}

// Force a re-read next call (e.g. after the admin toggles a provider).
export function resetWhatsappEnabledCache() { _providerCache = undefined }

// Official channel: send an approved template.
// audience: 'resident' | 'vendor'. Returns { sent, reason }.
export async function sendWhatsappTemplate({ audience, to, templateKey, variables = [], buildingId, unitId, confirmManual }) {
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp', {
      body: { action: 'send', audience, to, templateKey, variables, buildingId, unitId, confirmManual },
    })
    if (!error && data?.ok) return { sent: true }
    return { sent: false, reason: data?.error || error?.message || 'send_failed' }
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'send_failed' }
  }
}

// Send through the system. Returns { sent: true } on success, otherwise
// { sent: false, reason } so the caller can fall back to a manual link.
// opts.template = { key, variables } is used on the official channel;
// opts.audience defaults to 'vendor' (GreenAPI is vendor-only).
export async function systemSendWhatsapp(phone, message, opts = {}) {
  const wa = waNumber(phone)
  if (!wa) return { sent: false, reason: 'not_whatsappable' }
  const provider = await getWhatsappProvider()
  if (provider === 'whatsapp_cloud') {
    if (!opts.template?.key) return { sent: false, reason: 'no_template' }
    return sendWhatsappTemplate({
      audience: opts.audience || 'vendor', to: wa,
      templateKey: opts.template.key, variables: opts.template.variables || [],
      buildingId: opts.buildingId, unitId: opts.unitId,
    })
  }
  if (provider !== 'greenapi') return { sent: false, reason: 'disabled' }
  try {
    const { data, error } = await supabase.functions.invoke('green-whatsapp', {
      body: { action: 'send', chatId: `${wa}@c.us`, message, fileUrl: opts.fileUrl, fileName: opts.fileName },
    })
    if (!error && data?.ok) return { sent: true }
    return { sent: false, reason: error?.message || data?.error || 'send_failed' }
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'send_failed' }
  }
}

// One-call helper for a button: try the system, fall back to opening a manual
// WhatsApp/phone link. Returns true if sent by the system.
export async function sendOrOpen(phone, message, opts = {}) {
  if (await isWhatsappSystemEnabled()) {
    const res = await systemSendWhatsapp(phone, message, opts)
    if (res.sent) return true
  }
  const link = waLink(phone, message) || telHref(phone)
  if (link) {
    window.open(link, '_blank')
    logManualSend({ phone, message, link, ...opts })
  }
  return false
}

// Record a hand-sent message (wa.me / tel opened by the user) in the message
// log, so the admin log covers every message — not only system sends.
export async function logManualSend({ phone, message, link, audience, buildingId, unitId, template }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const isCall = String(link || '').startsWith('tel:')
    await supabase.from('notification_log').insert({
      channel: isCall ? 'phone' : 'whatsapp', provider: 'manual', status: 'opened',
      audience: audience || null, recipient: String(phone || ''),
      subject: isCall ? 'שיחה יזומה (ידני)' : 'וואטסאפ ידני — נפתח לשליחה',
      body: String(message || '').slice(0, 4000),
      template_key: template?.key || null,
      building_id: buildingId || null, unit_id: unitId || null, sent_by: uid,
    })
  } catch { /* logging must never block the user */ }
}
