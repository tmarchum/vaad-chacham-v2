// Client for the send-notification Edge Function — resident-facing updates.
//
// Fire-and-forget by design: closing the loop with the resident must never
// block or fail the committee's own action (the status update already
// happened). Failures are logged and surfaced as a soft toast.

import { supabase } from '@/lib/supabase'
import { toastError } from '@/lib/toast'
import { getWhatsappProvider, systemSendWhatsapp } from '@/lib/whatsapp'

const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-notification`

async function callSendNotification(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { skipped: true, reason: 'no_session' }
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
}

/**
 * Tell the reporting resident their issue moved forward.
 * kind: 'resolved' (work done) | 'closed'. Recipients, email HTML and the
 * push message are all derived SERVER-side from the issue row.
 */
export async function notifyIssueStatus(issueId, kind = 'resolved') {
  try {
    const out = await callSendNotification({ template: 'issue_status', issueId, kind })
    if (out?.success === false && !out?.skipped) {
      toastError('העדכון נשמר, אך שליחת ההודעה לדייר נכשלה')
    }
    return out
  } catch (e) {
    console.error('notifyIssueStatus error', e)
    return { success: false, error: String(e) }
  }
}

/**
 * Tell everyone who needs to know that a fault was just opened: the reporting
 * resident, the board member responsible for that category, and whoever is
 * meant to fix it.
 *
 * WhatsApp first where the official channel can carry it, email (and a push to
 * the app) for everyone it did not reach. Nobody gets the same message twice.
 * The server decides WHO the three parties are and writes the content; this
 * function only picks the channel.
 *
 * Returns { reached: [{ role, name, channel, phone }], unreachable: [...] } so
 * the caller can say in one line who was told — and who has to be phoned.
 */
export async function notifyIssueOpened(issueId) {
  const empty = { reached: [], unreachable: [] }
  if (!issueId) return empty
  try {
    const plan = await callSendNotification({ template: 'issue_opened', issueId, plan: true })
    if (!plan?.ok || !Array.isArray(plan.parties)) return empty

    // WhatsApp pass. The official channel is the only one allowed to write to a
    // resident — GreenAPI stays vendor-only, as it always has.
    const provider = await getWhatsappProvider()
    const reached = []
    const skip = []
    if (provider) {
      for (const p of plan.parties) {
        if (!p.phone || !p.templateKey) continue
        if (provider !== 'whatsapp_cloud' && p.audience !== 'vendor') continue
        const res = await systemSendWhatsapp(p.phone, `${p.role}: ${plan.issue?.title || ''}`, {
          audience: p.audience,
          template: { key: p.templateKey, variables: p.variables },
          buildingId: plan.issue?.buildingId,
        })
        if (res.sent) {
          skip.push(p.id)
          reached.push({ role: p.role, name: p.name, channel: 'whatsapp', phone: p.phone })
        }
      }
    }

    const out = await callSendNotification({ template: 'issue_opened', issueId, skip })
    for (const r of out?.results || []) {
      if (r.skipped) continue
      if (r.email) reached.push({ role: r.role, name: r.name, channel: 'email', phone: r.phone })
      else if (r.push > 0) reached.push({ role: r.role, name: r.name, channel: 'push', phone: r.phone })
    }
    const reachedRoles = new Set(reached.map((r) => r.role))
    const unreachable = plan.parties
      .filter((p) => !reachedRoles.has(p.role))
      .map((p) => ({ role: p.role, name: p.name, phone: p.phone }))
    return { reached, unreachable }
  } catch (e) {
    console.error('notifyIssueOpened error', e)
    return empty
  }
}

/** One Hebrew line summarising who was told and how — for the toast. */
export function describeIssueNotified({ reached = [], unreachable = [] } = {}) {
  if (!reached.length && !unreachable.length) return ''
  const label = { whatsapp: 'וואטסאפ', email: 'מייל', push: 'התראה' }
  const parts = reached.map((r) => `${r.role} (${label[r.channel] || r.channel})`)
  let msg = parts.length ? `נשלחה הודעה ל: ${parts.join(', ')}` : ''
  const callable = unreachable.filter((u) => u.phone)
  if (callable.length) {
    const who = callable.map((u) => `${u.role} — ${u.phone}`).join(', ')
    msg = msg ? `${msg}. צריך טלפון: ${who}` : `אין מייל או וואטסאפ — צריך טלפון: ${who}`
  }
  return msg
}

/** Push a new announcement to all residents of the building (push-only). */
export async function notifyAnnouncement(announcementId) {
  try {
    return await callSendNotification({ template: 'announcement_push', announcementId })
  } catch (e) {
    console.error('notifyAnnouncement error', e)
    return { success: false, error: String(e) }
  }
}
