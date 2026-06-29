// Deterministic vendor↔issue matching — the "dispatcher" a management company
// provides, as explainable rules (no AI guesswork for who to call).
//
// rankVendorsForIssue(issue, vendors, { urgent }) → sorted candidates:
//   [{ vendor, score, reasons[], warnings[] }]
// Blacklisted/sanctioned vendors are excluded; expired insurance is a warning.

// Trade synonym groups — an issue category and a vendor category match if they
// share a group, or one string contains the other.
const SYNONYMS = [
  ['אינסטלציה', 'אינסטלטור', 'שרברב', 'ביוב', 'נזיל', 'מים', 'דוד', 'שאיבה', 'סתימה', 'צנרת'],
  ['חשמל', 'חשמלאי', 'תאורה', 'מאור', 'לוח חשמל'],
  ['מעלית', 'מעליות'],
  ['גינון', 'גינה', 'גנן', 'גינות', 'עצים', 'דשא', 'גיזום', 'השקיה'],
  ['ניקיון', 'נקיון', 'ניקוי', 'נקי'],
  ['מבנה', 'שיפוץ', 'בנייה', 'בניה', 'אטימה', 'איטום', 'צבע', 'טיח', 'גג', 'רטיבות', 'זיפות'],
  ['מיזוג', 'מזגן', 'מיזוג אוויר', 'vrf'],
  ['דוד שמש', 'שמש', 'קולט', 'סולארי', 'דוד'],
  ['שער', 'חניה', 'חנייה', 'מחסום', 'אוטומטי'],
  ['בטיחות', 'כיבוי', 'אש', 'גילוי', 'מטף'],
  ['דלת', 'חלון', 'מסגרות', 'מסגר', 'זגג', 'זגגות', 'זכוכית'],
  ['אינטרקום', 'קודן', 'דלתון', 'בקרת גישה'],
  ['מצלמ', 'אזעק', 'אבטחה'],
  ['מנעול', 'מנעולן', 'פריצה', 'צילינדר', 'מחזיר שמן', 'מחזיר', 'בולם', 'דלת', 'ציר', 'ידית', 'פלדלת'],
  ['הדברה', 'מדביר', 'מזיק', 'תיקן', 'גוק', 'גוקים', 'נמל', 'נמלים', 'עכבר', 'מכרסם', 'יתוש', 'פשפש', 'חרק', 'טרמיט', 'פרעוש', 'דבור', 'צרעה'],
  ['גנרטור', 'גינרטור', 'גיבוי', 'דיזל'],
  ['משאב', 'הידרופור', 'לחץ מים', 'מאגר', 'בוסטר'],
]

// Lowercase, trim, and drop apostrophes / Hebrew geresh so slang like "ג'וק"
// normalizes to "גוק" (matches the pest synonyms regardless of how it's typed).
const norm = (s) => String(s || '').toLowerCase().replace(/['׳’`]/g, '').trim()

// Common Hebrew function words — dropped so short stopwords can't substring-match
// vendor terms (e.g. "לי" inside "מנעולים").
const STOP = new Set([
  'לי', 'יש', 'על', 'של', 'את', 'אם', 'גם', 'לא', 'כי', 'זה', 'הוא', 'היא', 'אני',
  'עם', 'אך', 'או', 'כל', 'מה', 'מי', 'רק', 'עד', 'כך', 'בו', 'בה', 'לו', 'לה',
  'הם', 'הן', 'אנו', 'אתה', 'אבל', 'כדי', 'אז', 'יותר', 'מאוד', 'כבר',
])

function tokens(...vals) {
  return vals.flatMap((v) => norm(v).split(/[\s,/|]+/)).filter((t) => t && !STOP.has(t))
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

  if (vendor.is_regular || vendor.isRegular) { score += 18; reasons.push('ספק קבוע לבניין') }

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
