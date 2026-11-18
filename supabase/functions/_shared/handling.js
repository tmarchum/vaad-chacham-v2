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

// Categories that need a licensed vendor unless the title says otherwise.
const VENDOR_CATEGORIES = ['חשמל ותאורה', 'אינסטלציה ומים', 'שערים, דלתות וחניה', 'בטיחות וביטחון']

export function decideHandling(issue) {
  const title = String(issue?.title || '')
  if (issue?.category === 'מעלית' || /מעלית/.test(title)) return 'admin'
  if (HANDYMAN_WORDS.test(title)) return 'handyman'
  if (VENDOR_CATEGORIES.includes(issue?.category)) return 'quotes'
  return 'handyman'
}

export const HANDLING_LABELS = {
  contractor: 'הספק הקבוע של הבניין',
  handyman: 'איש האחזקה של ועד1',
  quotes: 'הצעות מספקים',
  admin: 'ועד1 תעביר לחברת המעליות של הבניין',
}
