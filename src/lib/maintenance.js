// Proactive maintenance — the thing a management company does that committees
// forget: surface every upcoming/overdue service, legal inspection, warranty
// and recurring task BEFORE it lapses, so a vendor can be booked in time.
//
// upcomingMaintenance({ assets, compliance, recurringTasks }, withinDays)
//   → unified list sorted by urgency (overdue first), each:
//     { kind, title, dueDate, daysUntil, overdue, requiredByLaw, source }

const DAY = 86400000

function daysUntil(dateStr) {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (!Number.isFinite(t)) return null
  // Compare at day granularity from "now".
  return Math.round((t - Date.now()) / DAY)
}

export function upcomingMaintenance(
  { assets = [], compliance = [], recurringTasks = [] } = {},
  withinDays = 45,
) {
  const items = []
  const add = (dateStr, base) => {
    const d = daysUntil(dateStr)
    if (d === null) return
    if (d > withinDays) return // not due yet
    items.push({ ...base, dueDate: dateStr, daysUntil: d, overdue: d < 0 })
  }

  for (const a of assets) {
    add(a.next_service || a.nextService, {
      kind: 'service', title: `טיפול: ${a.name || 'ציוד'}`, requiredByLaw: false, source: 'asset',
    })
    add(a.warranty_end || a.warrantyEnd, {
      kind: 'warranty', title: `אחריות מסתיימת: ${a.name || 'ציוד'}`, requiredByLaw: false, source: 'asset',
    })
  }
  for (const c of compliance) {
    add(c.expiry_date || c.expiryDate, {
      kind: 'compliance', title: `אישור פג תוקף: ${c.title || c.type || 'מסמך'}`, requiredByLaw: true, source: 'compliance',
    })
  }
  for (const r of recurringTasks) {
    add(r.next_due_date || r.nextDueDate, {
      kind: 'recurring', title: r.title || 'משימה',
      requiredByLaw: !!(r.is_required_by_law || r.isRequiredByLaw), source: 'recurring',
    })
  }

  // Overdue first, then soonest. Legal items break ties.
  return items.sort((a, b) =>
    a.daysUntil - b.daysUntil || (b.requiredByLaw - a.requiredByLaw),
  )
}
