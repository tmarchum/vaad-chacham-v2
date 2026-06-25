// Emergency response — the "always-on" value of a management company.
// For an urgent issue (flood, elevator entrapment, no power), surface the best
// 24/7 on-call vendor for one-tap dispatch. The committee taps to call — never
// a silent auto-dispatch (outward action stays human-initiated, per policy).
import { rankVendorsForIssue } from './vendorMatch'

export function isEmergency(issue) {
  return ['urgent', 'high'].includes(issue?.priority)
}

// Best matching vendor that is available 24/7; falls back to the top match if
// none are flagged on-call.
export function emergencyVendorFor(issue, vendors) {
  const ranked = rankVendorsForIssue(issue, vendors, { urgent: true })
  if (ranked.length === 0) return null
  const onCall = ranked.find((r) => r.vendor.available_24_7 || r.vendor.available247)
  return (onCall || ranked[0]).vendor
}
