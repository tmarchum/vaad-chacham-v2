export const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** Month options for <FormSelect> — [{value:'01',label:'ינואר'}, …] */
export const HEBREW_MONTH_OPTIONS = HEBREW_MONTHS.map((label, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label,
}))

// ONE issue-category vocabulary for the whole app (committee form, resident
// portal, routing rules). The resident portal used to carry its own shorter
// list with a different spelling (נקיון/ניקיון), which broke exact-match
// category routing.
// Ten, not fifteen. A reporting resident is not a dispatcher: given too
// many near-identical choices they pick "אחר" or "כללי", and in practice a
// third of all faults landed in a bucket with no owner. The list only has to
// be fine-grained enough to route — and only ONE category routes anywhere by
// itself (מעלית, straight to the lift contractor). Everything else reaches
// the committee, which decides. Keep this list short for that reason; adding
// a category is adding a decision the resident has to get right.
// Cleaning, gardening and general maintenance are three, not one: each has its
// own regular contractor in a building, so one shared category could only be
// routed to one of them.
export const ISSUE_CATEGORIES = [
  'מעלית',
  'חשמל ותאורה',
  'אינסטלציה ומים',
  'שערים, דלתות וחניה',
  'ניקיון',
  // The rubbish chute is the most reported fault in a tower (a quarter of all
  // issues in the pilot building) and was scattered over "אחר", "ניקיון",
  // "אינסטלציה" and "חשמל" — so nobody could see it was one recurring problem.
  'פיר אשפה',
  'גינון',
  'תחזוקה כללית',
  'בטיחות וביטחון',
  // The residents' room is a place, not a trade — a fault there can be the AC,
  // the furniture or the cleaning. It earns a category anyway because the
  // committee wanted it routed on its own: it is the one shared space with
  // bookings and a key, so its faults have a different owner from "אחר".
  'חדר דיירים',
  'אחר',
]

/** '2026-11' → 'נובמבר 2026' (falls back to the raw value). */
export const hebrewMonthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-')
  const name = HEBREW_MONTHS[Number(m) - 1]
  return name && y ? `${name} ${y}` : (ym || '')
}
