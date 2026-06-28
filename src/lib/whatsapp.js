// System WhatsApp sending via the green-whatsapp Edge Function (GreenAPI).
// Falls back to manual wa.me / tel links when the integration is off or a send
// fails, so the committee always has a working path.

import { supabase } from './supabase'
import { waNumber, waLink, telHref } from './phone'

let _enabledCache // undefined = not yet fetched

// Is the GreenAPI gateway configured + enabled? Cached after first read.
export async function isWhatsappSystemEnabled() {
  if (_enabledCache !== undefined) return _enabledCache
  const { data } = await supabase
    .from('messaging_integrations').select('enabled').eq('provider', 'greenapi').maybeSingle()
  _enabledCache = !!data?.enabled
  return _enabledCache
}

// Force a re-read next call (e.g. after the admin toggles it).
export function resetWhatsappEnabledCache() { _enabledCache = undefined }

// Send through the system. Returns { sent: true } on success, otherwise
// { sent: false, reason } so the caller can fall back to a manual link.
export async function systemSendWhatsapp(phone, message, opts = {}) {
  const wa = waNumber(phone)
  if (!wa) return { sent: false, reason: 'not_whatsappable' }
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
  if (link) window.open(link, '_blank')
  return false
}
