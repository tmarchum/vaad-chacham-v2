// Client for the send-notification Edge Function — resident-facing updates.
//
// Fire-and-forget by design: closing the loop with the resident must never
// block or fail the committee's own action (the status update already
// happened). Failures are logged and surfaced as a soft toast.

import { supabase } from '@/lib/supabase'
import { toastError } from '@/lib/toast'

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

/** Push a new announcement to all residents of the building (push-only). */
export async function notifyAnnouncement(announcementId) {
  try {
    return await callSendNotification({ template: 'announcement_push', announcementId })
  } catch (e) {
    console.error('notifyAnnouncement error', e)
    return { success: false, error: String(e) }
  }
}
