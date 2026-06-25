// Deterministic vendor↔issue matching — the "dispatcher" a management company
// provides, as explainable rules (no AI guesswork for who to call).
//
// rankVendorsForIssue(issue, vendors, { urgent }) → sorted candidates:
//   [{ vendor, score, reasons[], warnings[] }]
// Blacklisted/sanctioned vendors are excluded; expired insurance is a warning.

// Trade synonym groups — an issue category and a vendor category match if they
// share a group, or one string contains the other.
const SYNONYMS = [
  ['אינסטלציה', 'אינסטלטור', 'שרברב', 'ביוב', 'נזיל', 'מים', 'דוד'],
  ['חשמל', 'חשמלאי', 'תאורה', 'מאור'],
  ['מעלית', 'מעליות'],
  ['גינון', 'גינה', 'גנן', 'גינות', 'גן'],
  ['ניקיון', 'נקיון', 'ניקוי', 'נקי'],
  ['מבנה', 'שיפוץ', 'בנייה', 'בניה', 'אטימה', 'איטום', 'צבע', 'טיח'],
  ['מיזוג', 'מזגן', 'מיזוג אוויר'],
  ['שער', 'חניה', 'חנייה', 'מחסום'],
  ['בטיחות', 'כיבוי', 'אש', 'גילוי'],
  ['דלת', 'חלון', 'מסגרות', 'מסגר'],
]

const norm = (s) => String(s || '').toLowerCase().trim()

function tokens(...vals) {
  return vals.flatMap((v) => norm(v).split(/[\s,/|]+/)).filter(Boolean)
}

// Does any issue token relate to any vendor token (direct or via synonyms)?
function categoryMatch(issueTokens, vendorTokens) {
  for (const it of issueTokens) {
    for (const vt of vendorTokens) {
      if (!it || !vt) continue
      if (it.includes(vt) || vt.includes(it)) return true
      for (const group of SYNONYMS) {
        const inIt = group.some((g) => it.includes(g))
        const inVt = group.some((g) => vt.includes(g))
        if (inIt && inVt) return true
      }
    }
  }
  return false
}

function isInsuranceExpired(vendor) {
  const exp = vendor.insurance_expiry || vendor.insuranceExpiry
  if (!exp) return false
  const t = new Date(exp).getTime()
  return Number.isFinite(t) && t < Date.now()
}

export function scoreVendorForIssue(issue, vendor, { urgent = false } = {}) {
  const reasons = []
  const warnings = []

  const issueTokens = tokens(issue?.category, issue?.ai_category, issue?.ai_search_terms, issue?.title)
  const vendorTokens = tokens(vendor?.category, vendor?.specialties)

  let score = 0
  const matched = categoryMatch(issueTokens, vendorTokens)
  if (matched) { score += 50; reasons.push('התמחות מתאימה') }

  const rating = Number(vendor.rating) || 0
  if (rating > 0) { score += rating * 6; reasons.push(`דירוג ${rating}/5`) }

  if (vendor.preferred) { score += 12; reasons.push('ספק מועדף') }

  if (urgent && (vendor.available_24_7 || vendor.available247)) {
    score += 20; reasons.push('זמין 24/7')
  } else if (urgent) {
    warnings.push('לא מסומן כזמין 24/7')
  }

  if (isInsuranceExpired(vendor)) { score -= 40; warnings.push('ביטוח פג תוקף') }
  if (!(vendor.license_number || vendor.licenseNumber)) warnings.push('אין מספר רישיון')

  return { vendor, score: Math.round(score), matched, reasons, warnings }
}

export function rankVendorsForIssue(issue, vendors, opts = {}) {
  const urgent = opts.urgent ?? ['high', 'urgent'].includes(issue?.priority)
  return (vendors || [])
    .filter((v) => !v.is_blacklisted && !v.isBlacklisted && !v.sanctions)
    .map((v) => scoreVendorForIssue(issue, v, { urgent }))
    // Only suggest vendors whose trade actually fits the issue.
    .filter((r) => r.matched)
    .sort((a, b) => b.score - a.score)
}
