// Vendor trades grouped under the issue categories residents file faults in,
// so the vendor pool reads the same way the faults do.
import { ISSUE_CATEGORIES } from './constants'
// Shared with the WhatsApp server (supabase/functions/_shared): one map.
import { TRADE_TO_ISSUE, issueGroupOf, taskIssueCategory, taskLeadDays, slaDaysFor } from '../../supabase/functions/_shared/tradeGroups.js'

export { issueGroupOf, taskIssueCategory, taskLeadDays, slaDaysFor }

/** Every vendor trade, in the order the map lists them. */
export const TRADES = Object.keys(TRADE_TO_ISSUE)

export const ISSUE_GROUPS = ISSUE_CATEGORIES.map((key) => ({
  key,
  label: key,
  trades: Object.entries(TRADE_TO_ISSUE).filter(([, g]) => g === key).map(([t]) => t),
}))

export const issueGroupRank = (trade) => {
  const i = ISSUE_CATEGORIES.indexOf(issueGroupOf(trade))
  return i < 0 ? 99 : i
}
