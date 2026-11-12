// Who sees what: one table for role × plan.
//
// Three viewers:
//   admin     — the management side. Sees every page in every building.
//   committee — the building's own committee. What it sees depends on the
//               building's plan (below).
//   resident  — never reaches these pages; AuthGuard sends a resident with a
//               unit to the resident portal. The portal's own rules live there.
//
// Three plans, per building (buildings.service_plan, migration 030):
//   basic     — free software: residents, payments, expenses, announcements,
//               polls, room booking, simple fault handling.
//   assisted  — the committee runs the building with the full toolset: bank
//               feed, collection cases and letters, compliance, AI analysis,
//               the official WhatsApp channel, reports.
//   managed   — same toolset, but faults belong to the management side; the
//               committee watches and approves rather than dispatching.
//
// A building with no plan column yet (migration 030 not applied) is treated as
// "legacy": everything stays visible, exactly as before this file existed.

export const PLAN_LABELS = { basic: 'בסיסי', assisted: 'ועד מלווה', managed: 'ניהול מלא' }

// The lowest plan at which a committee sees each feature. Anything not listed
// here is available on every plan.
const MIN_PLAN = {
  collection_cases: 'assisted',
  income: 'assisted',
  balance: 'assisted',
  expense_analysis: 'assisted',
  bank_settings: 'assisted',
  compliance: 'assisted',
  building_assets: 'assisted',
  recurring_tasks: 'assisted',
  messaging: 'assisted',
  reports: 'assisted',
  ai_analysis: 'assisted',
}

// Management-side tools. A committee never sees these, on any plan.
const STAFF_ONLY = new Set([
  'vendors', 'vendor_finder', 'vendor_rules', 'issue_routing', 'work_orders',
  'supervisors', 'service_plans', 'smart_agents', 'building_agent',
])

const RANK = { basic: 1, assisted: 2, managed: 3 }

/** Route path → feature key, for the route guard and the sidebar. */
export const ROUTE_FEATURE = {
  '/collection-cases': 'collection_cases',
  '/income': 'income',
  '/balance': 'balance',
  '/expense-analysis': 'expense_analysis',
  '/bank-settings': 'bank_settings',
  '/compliance': 'compliance',
  '/building-assets': 'building_assets',
  '/recurring-tasks': 'recurring_tasks',
  '/messaging': 'messaging',
  '/reports': 'reports',
  '/vendors': 'vendors',
  '/vendor-finder': 'vendor_finder',
  '/vendor-rules': 'vendor_rules',
  '/issue-routing': 'issue_routing',
  '/work-orders': 'work_orders',
  '/supervisors': 'supervisors',
  '/service-plans': 'service_plans',
  '/smart-agents': 'smart_agents',
  '/building-agent': 'building_agent',
}

/**
 * Can this viewer use this feature in this building?
 * Returns { ok, needs } — `needs` is the plan that would unlock it, or
 * 'staff' when only the management side may use it.
 */
export function access(feature, { isAdmin, building }) {
  if (!feature || isAdmin) return { ok: true }
  if (STAFF_ONLY.has(feature)) return { ok: false, needs: 'staff' }
  const plan = building?.service_plan
  if (!plan) return { ok: true } // legacy: migration 030 not applied
  const min = MIN_PLAN[feature]
  if (!min) return { ok: true }
  return RANK[plan] >= RANK[min] ? { ok: true } : { ok: false, needs: min }
}

export const canSee = (feature, ctx) => access(feature, ctx).ok

/** On the managed plan faults are the management side's; the committee watches. */
export const committeeHandlesIssues = (building) => building?.service_plan !== 'managed'

/** One line per plan for the upgrade screen. */
export const PLAN_PITCH = {
  assisted: 'הזרמת בנק אוטומטית, תיקי גבייה ומכתבים, רגולציה ובדיקות חובה, ניתוח AI לתקלות, וואטסאפ רשמי ודוחות.',
  managed: 'כל מה שבמסלול ועד מלווה, וחברת הניהול מקבלת ומטפלת בכל התקלות מול אנשי אחזקה וספקים.',
}
