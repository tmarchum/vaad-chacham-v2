// Vendor-rule matching — the ONE implementation of "which rule tags this
// bank expense". Used by the VendorRules page (apply-now) and kept in sync
// with the Drive-import pipeline. Longest match_text wins; ties break on
// priority (higher wins). Inactive rules never match.

/** Pick the winning rule for a bank-expense description (or null). */
export function pickRule(rules, description) {
  const desc = description || ''
  let best = null
  for (const r of rules || []) {
    if (r.active === false || !r.match_text) continue
    if (!desc.includes(r.match_text)) continue
    if (
      !best ||
      r.match_text.length > best.match_text.length ||
      (r.match_text.length === best.match_text.length && (r.priority || 0) > (best.priority || 0))
    ) {
      best = r
    }
  }
  return best
}

/**
 * Which of these bank expenses should rule `rule` retag right now?
 * Only rows whose vendor is empty or whose category is still "אחר"
 * (never clobbers a hand-edited row), and only when the rule actually
 * changes something. `allRules` guards against stealing a row that a
 * LONGER rule wins.
 */
export function expensesToRetag(rule, expenses, allRules) {
  return (expenses || []).filter((e) => {
    const desc = e.description || ''
    if (!desc.includes(rule.match_text)) return false
    // Respect longest-match-wins: if another active rule beats this one on
    // this description, leave the row for that rule.
    const winner = pickRule(allRules, desc)
    if (winner && winner.match_text !== rule.match_text) return false
    const tagged = e.vendor || (e.category && e.category !== 'אחר')
    if (tagged && !(e.vendor === rule.vendor && e.category === rule.category)) return false
    return e.vendor !== rule.vendor || e.category !== rule.category
  })
}
