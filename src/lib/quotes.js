// Quote discipline — replaces a management company's "we get prices and
// negotiate". Compares the quotes on an issue, recommends the lowest valid one,
// flags outliers, and enforces a minimum number of quotes for big jobs.
//
// analyzeQuotes(quotes, { requireMin }) → summary for the committee to decide.

const isExpired = (q) => {
  const v = q.valid_until || q.validUntil
  if (!v) return false
  const t = new Date(v).getTime()
  return Number.isFinite(t) && t < Date.now()
}

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function analyzeQuotes(quotes = [], { requireMin = 0 } = {}) {
  // Valid = not rejected and not past its validity date.
  const valid = quotes.filter(
    (q) => (q.status !== 'rejected') && !isExpired(q) && Number(q.amount) > 0,
  )
  const amounts = valid.map((q) => Number(q.amount))
  const count = valid.length

  if (count === 0) {
    return { count: 0, valid: [], needsMore: requireMin > 0, missing: requireMin, lowest: null, highest: null, median: 0, spreadPct: 0, recommended: null, outliers: [] }
  }

  const lowest = valid.reduce((a, b) => (Number(a.amount) <= Number(b.amount) ? a : b))
  const highest = valid.reduce((a, b) => (Number(a.amount) >= Number(b.amount) ? a : b))
  const med = median(amounts)
  const lo = Number(lowest.amount)
  const hi = Number(highest.amount)
  const spreadPct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 0

  // Outliers = quotes more than 30% above the median.
  const outliers = valid.filter((q) => med > 0 && Number(q.amount) > med * 1.3)

  return {
    count,
    valid,
    needsMore: count < requireMin,
    missing: Math.max(0, requireMin - count),
    lowest,
    highest,
    median: med,
    spreadPct,
    recommended: lowest, // cheapest valid quote
    outliers,
  }
}
