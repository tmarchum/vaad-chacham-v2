// Vendor trades → the issue category a resident files a fault under. One map
// for the app (vendor pool grouping) and the WhatsApp server (the issue a
// recurring task opens), so the two can never disagree.
export const TRADE_TO_ISSUE = {
  'מעליות': 'מעלית', 'בדיקת מעליות': 'מעלית',
  'חשמל': 'חשמל ותאורה', 'בדיקת חשמל': 'חשמל ותאורה', 'גנרטור': 'חשמל ותאורה',
  'אינסטלציה': 'אינסטלציה ומים', 'ביוב ושאיבה': 'אינסטלציה ומים', 'משאבות מים': 'אינסטלציה ומים',
  'דוד שמש': 'אינסטלציה ומים', 'חיטוי מאגרי מים': 'אינסטלציה ומים', 'גז מרכזי': 'אינסטלציה ומים',
  'שערים ודלתות אוטומטיות': 'שערים, דלתות וחניה', 'מנעולן': 'שערים, דלתות וחניה', 'זגגות': 'שערים, דלתות וחניה',
  'אלומיניום, דלתות וחלונות': 'שערים, דלתות וחניה',
  'ניקיון': 'ניקיון', 'פינוי אשפה ודחסנים': 'פיר אשפה',
  'גינון': 'גינון',
  'הדברה': 'תחזוקה כללית', 'איטום וגגות': 'תחזוקה כללית', 'צבע ושיפוצים': 'תחזוקה כללית', 'בנייה ושיפוצים': 'תחזוקה כללית',
  'מיזוג אוויר': 'תחזוקה כללית', 'מהנדס בניין': 'תחזוקה כללית', 'אחזקה כללית': 'תחזוקה כללית',
  'כיבוי וגילוי אש': 'בטיחות וביטחון', 'בטיחות אש - בדיקות ואישורים': 'בטיחות וביטחון',
  'מצלמות ואזעקות': 'בטיחות וביטחון', 'אינטרקום': 'בטיחות וביטחון', 'יועץ נגישות': 'בטיחות וביטחון',
  'שירותי חירום': 'בטיחות וביטחון',
}

export const issueGroupOf = (trade) => TRADE_TO_ISSUE[trade] || 'אחר'

// How long a category may sit before it is late. A blocked rubbish chute is
// not a lift trapping someone, and treating them the same makes the whole list
// easy to ignore. One table for the screen's "late" badge and the weekly
// digest, so an issue is never late in one and on time in the other.
export const ISSUE_SLA_DAYS = {
  'מעלית': 2,
  'בטיחות וביטחון': 3,
  'אינסטלציה ומים': 5,
  'חשמל ותאורה': 7,
  'שערים, דלתות וחניה': 14,
  'ניקיון': 7,
  'פיר אשפה': 7,
  'גינון': 14,
  'תחזוקה כללית': 14,
  'אחר': 14,
}
export const slaDaysFor = (category) => ISSUE_SLA_DAYS[category] ?? 14

// The issue a recurring task opens. A certified lift inspector is not the
// building's lift company: filed under "מעלית" the inspection would be routed
// straight to that company, so it goes under safety like the other statutory
// inspections. A task with no trade is general maintenance.
export const taskIssueCategory = (trade) =>
  !trade ? 'תחזוקה כללית' : trade === 'בדיקת מעליות' ? 'בטיחות וביטחון' : issueGroupOf(trade)

// How long before the due date the committee is reminded, when the task does
// not say: statutory inspections need a booked inspector, the rest less.
export const taskLeadDays = (task) => {
  const own = task?.remind_days
  if (own !== null && own !== undefined && own !== '' && Number.isFinite(Number(own))) return Math.max(0, Number(own))
  return task?.is_required_by_law ? 30 : 14
}
