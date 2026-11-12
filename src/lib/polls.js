// Resident polls: shared helpers for the committee page and the resident portal.
import { supabase } from '@/lib/supabase'

export const DEFAULT_OPTIONS = ['בעד', 'נגד', 'נמנע']

export const SHOW_RESULTS_LABELS = {
  always: 'תמיד',
  after_vote: 'אחרי שהדייר הצביע',
  after_close: 'רק אחרי סגירת ההצבעה',
}

/** Shown next to every poll, to committee and residents alike. */
export const POLL_DISCLAIMER =
  'הצבעת דיירים באפליקציה היא קול אחד לכל דירה. היא אינה מחליפה החלטה של אסיפה כללית במקרים שבהם החוק או התקנון של הבניין דורשים אחת.'

const ERRORS = {
  poll_closed: 'ההצבעה נסגרה',
  owners_only: 'ההצבעה מיועדת לבעלי דירות בלבד. אם את/ה בעל/ת הדירה, יש לעדכן את פרטי הבעלות מול הוועד.',
  not_a_resident: 'לא נמצאה דירה משויכת לחשבון שלך בבניין הזה',
  bad_option: 'אפשרות לא תקינה',
  poll_not_found: 'ההצבעה לא נמצאה',
}

export function pollErrorMessage(err) {
  const m = String(err?.message || err || '')
  const key = Object.keys(ERRORS).find((k) => m.includes(k))
  return key ? ERRORS[key] : 'ההצבעה נכשלה, נסו שוב'
}

export const isPollClosed = (p) =>
  p?.status === 'closed' || (p?.closes_at && new Date(p.closes_at) <= new Date())

/** { [pollId]: results } for a list of polls, or {} when polls are unavailable. */
export async function loadPollResults(polls) {
  const pairs = await Promise.all((polls || []).map(async (p) => {
    const { data, error } = await supabase.rpc('poll_results', { p_poll: p.id })
    return [p.id, error ? null : data]
  }))
  return Object.fromEntries(pairs)
}
