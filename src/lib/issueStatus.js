// Canonical issue-status vocabulary — ONE place for "what counts as open".
//
// issues.status carries a fine-grained lifecycle (reported → acknowledged →
// quoted → approved → scheduled → in_progress → completed → closed), plus
// legacy values written by older builds ('open', 'new', 'resolved'). Any page
// that asks "is this issue still open?" must use these helpers — filtering on
// one or two literal statuses is how the dashboard ended up showing
// "0 תקלות פתוחות" while residents had live faults in 'reported'.

export const ISSUE_STATUS_ORDER = [
  'reported', 'pending_committee', 'acknowledged', 'approved_for_quotes',
  'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'closed',
]

// Statuses where the fault no longer needs committee attention.
// 'completed'/'awaiting_payment' = work done (payment may still be pending);
// 'resolved' is legacy. Everything NOT here is an open fault — including any
// unknown/legacy value, so new statuses fail toward "open" (visible) rather
// than silently dropping off the dashboard.
export const DONE_ISSUE_STATUSES = new Set([
  'completed', 'awaiting_payment', 'closed', 'resolved', 'rejected', 'declined',
])

export const isOpenIssueStatus = (s) => !DONE_ISSUE_STATUSES.has(s)

// Committee-facing bucket labels (mirrors Issues.jsx STATUS_BUCKETS).
export const ISSUE_STATUS_LABELS = {
  reported: 'חדשה', pending_committee: 'חדשה', acknowledged: 'חדשה',
  new: 'חדשה', open: 'חדשה',
  approved_for_quotes: 'בטיפול', quoted: 'בטיפול', approved: 'בטיפול',
  scheduled: 'בטיפול', in_progress: 'בטיפול',
  completed: 'הושלמה', awaiting_payment: 'לתשלום וסגירה',
  closed: 'סגורה', resolved: 'טופלה',
  rejected: 'נדחתה', declined: 'נדחתה',
}

export const issueStatusLabel = (s) => ISSUE_STATUS_LABELS[s] || s
