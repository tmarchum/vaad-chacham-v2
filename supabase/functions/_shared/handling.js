// "ועד1 תטפל": who actually handles the issue — decided by rule, the way a
// management company's manager decides between his own man and an outside
// vendor. One rule set for the app and the WhatsApp server.
//
//   contractor  the building has a regular contractor for this category
//               (decided by the caller from issue_routing_rules, not here)
//   handyman    small jobs ועד1's handyman does himself
//   quotes      licensed trades: three vendors are asked, the committee gets
//               the cheapest that can do it in time
//   admin       the lift: always the building's own lift company, never a
//               vendor from the pool — ועד1 routes it by hand

// Words in the title that make it a handyman job whatever the category.
const HANDYMAN_WORDS = /נורה|נורות|מנורה|ציר|צירים|ידית|מחזיר שמן|בורג|מדף|שלט|ברז|ניאגרה|סיפון|צבע|כתם|מנעול|צילינדר|תיבת דואר|ספסל|עציץ|מראה|וו |תלייה/

// Licensed trades: always a certified vendor, whatever else the title says.
const LICENSED_WORDS = /גז|כיבוי|מטפה|ספרינקלר|גלאי עשן|לוח חשמל|הארקה|מאגר מים|משאבת|גנרטור/

// Categories that need a licensed vendor unless the title says otherwise.
const VENDOR_CATEGORIES = ['חשמל ותאורה', 'בטיחות וביטחון']

// Categories where the handyman looks first (up to an hour, on the building):
// most "plumbing" and "gate" calls are a tap or a hinge, and three plumbers
// should not be sent to a drip. If he finds it needs a vendor, quotes follow.
// Urgent ones skip the visit and go straight to quotes (done the same day).
export const DIAGNOSIS_CATEGORIES = ['אינסטלציה ומים', 'שערים, דלתות וחניה']

// "דחוף" (high — the resident's own choice) and an emergency from the closed
// list (urgent) both shorten every timeline: quotes 3h, work today, the
// handyman now, no look-first visit. Only an emergency also escalates when
// the committee does not answer within an hour.
export const isUrgent = (priority) => priority === 'urgent' || priority === 'high'

export function decideHandling(issue) {
  const title = String(issue?.title || '')
  const urgent = isUrgent(issue?.priority)
  if (issue?.category === 'מעלית' || /מעלית/.test(title)) return 'admin'
  if (LICENSED_WORDS.test(title)) return 'quotes'
  if (HANDYMAN_WORDS.test(title)) return 'handyman'
  if (DIAGNOSIS_CATEGORIES.includes(issue?.category)) return urgent ? 'quotes' : 'handyman'
  if (VENDOR_CATEGORIES.includes(issue?.category)) return 'quotes'
  return 'handyman'
}

/** A handyman job that is really a look-first visit (plumbing, gates). */
export function isDiagnosis(issue) {
  const title = String(issue?.title || '')
  return DIAGNOSIS_CATEGORIES.includes(issue?.category) && !HANDYMAN_WORDS.test(title) && !LICENSED_WORDS.test(title)
}

// The closed list a resident picks from for a real emergency. Anything else is
// "דחוף" at most and waits for the committee like every other issue.
export const EMERGENCIES = [
  { key: 'lift_trapped', label: 'אדם תקוע במעלית', category: 'מעלית' },
  { key: 'flood', label: 'הצפה / פיצוץ צנרת', category: 'אינסטלציה ומים' },
  { key: 'gas', label: 'ריח גז', category: 'בטיחות וביטחון' },
  { key: 'electric_danger', label: 'סכנת חשמל (ניצוצות, חוט חשוף, עשן מלוח)', category: 'חשמל ותאורה' },
  { key: 'power_out', label: 'אין חשמל בכל הבניין', category: 'חשמל ותאורה' },
]

// How a category's new issues are routed in a building (issue_routing_rules.route).
export const ROUTES = [
  { key: 'committee', label: 'הוועד מחליט', hint: 'הוועד מקבל כפתורים: ועד1 תטפל / הוועד יטפל' },
  { key: 'vaad1', label: 'ועד1 מטפלת', hint: 'ועד1 מחליטה: איש אחזקה או הצעות מספקים. הוועד מקבל עדכון' },
  { key: 'vendor', label: 'ספק קבוע — ישר אליו', hint: 'נשלח מיד לספק הקבוע. הוועד וועד1 מקבלים עדכון' },
]

/** The route a new issue takes: a standing contractor, ועד1, or the committee. */
export function routeFor(rule, building) {
  if (rule?.active !== false && rule?.route === 'vendor' && rule?.vendor_name) return 'vendor'
  if (rule?.active !== false && rule?.route === 'vaad1') return 'vaad1'
  if (building?.handling_mode === 'vaad1') return 'vaad1'
  return 'committee'
}

export const HANDLING_LABELS = {
  contractor: 'הספק הקבוע של הבניין',
  handyman: 'איש האחזקה של ועד1',
  quotes: 'הצעות מספקים',
  admin: 'ועד1 תעביר לחברת המעליות של הבניין',
}
