/**
 * Learned income patterns — matching the recurring credits that carry no name.
 *
 * A standing order shows up in the bank feed every month on the same day, for
 * the same amount, often described as nothing more than "זיכוי". Nothing in the
 * text says which apartment paid, so name-based matching cannot help and the
 * row sits unmatched month after month while the resident looks like a debtor.
 *
 * So the FIRST match is done by a person. From then on the shape of that
 * credit — day of month + amount + whatever description it carries — is stored
 * as a rule in income_patterns, and every later credit of the same shape is
 * matched to the same apartment by itself. Both the app and the monthly Drive
 * import (moneyman-ui/pipeline.mjs) apply the same rules.
 *
 * Deliberately strict: the amount must be exact, the day within DAY_TOLERANCE,
 * and a named description must match a named description. A rule only ever
 * matches credits, never debits.
 */

import { supabase } from '@/lib/supabase'

// A standing order can land a day or two late when the date falls on a weekend.
export const DAY_TOLERANCE = 3

// Words that say nothing about who paid — stripped so that "זיכוי" and
// "זיכוי מיידי" produce the same key.
// NOTE: "הורא.קבע" is deliberately NOT here. Three different residents of this
// building pay the same 515 ₪ with no name on the credit; the only thing that
// separates the one paying around the 10th from the one paying around the 9th
// is that the bank writes their row as "… הורא.קבע". Dropping those words would
// collapse two neighbours into one rule.
const GENERIC_WORDS = [
  'זיכוי', 'מיידי', 'העברה', 'תשלום', 'הפקדה', 'שיק', 'צק', 'מבנק', 'בנק',
]

/** Stable key for a transaction description: drops reference numbers,
 *  punctuation and generic banking words. Nameless credits normalize to ''. */
export function normalizeDesc(desc) {
  if (!desc) return ''
  return String(desc)
    .replace(/\d{3,}/g, ' ')            // reference / account numbers
    .replace(/[.,"'`/\\()\-־–—]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !GENERIC_WORDS.includes(w))
    .join(' ')
    .trim()
}

const dayOf = (tx) => {
  const d = tx?.transaction_date ? new Date(tx.transaction_date) : null
  return d && !isNaN(d) ? d.getDate() : null
}

const amountOf = (tx) => Math.round((Number(tx?.credit) || 0) * 100) / 100

/** The shape we store and look up by. Returns null for anything that is not a
 *  dated credit. */
export function fingerprint(tx) {
  const day = dayOf(tx)
  const amount = amountOf(tx)
  if (!day || amount <= 0) return null
  return { day_of_month: day, amount, description: normalizeDesc(tx.description) }
}

/** Distance between two days of month, wrapping around the end of the month
 *  (the 1st and the 30th are two days apart, not twenty-nine). */
function dayDistance(a, b) {
  const raw = Math.abs(a - b)
  return Math.min(raw, 30 - raw)
}

/**
 * Does this rule describe this transaction?
 * Exact amount, nearby day, and the descriptions have to agree: a rule learned
 * from a nameless credit does not get to claim a credit that carries a name.
 */
export function patternMatches(pattern, tx) {
  if (!pattern?.active) return false
  const fp = fingerprint(tx)
  if (!fp) return false
  if (Math.round(Number(pattern.amount) * 100) !== Math.round(fp.amount * 100)) return false
  if (dayDistance(Number(pattern.day_of_month), fp.day_of_month) > DAY_TOLERANCE) return false
  return (pattern.description || '') === fp.description
}

/** The unit a set of rules assigns to this transaction, or null.
 *  Ambiguity is a non-answer: if two rules point at different units, we leave
 *  the row for a human rather than guess. */
export function unitForTransaction(patterns, tx) {
  const hits = (patterns || []).filter(p => patternMatches(p, tx))
  if (hits.length === 0) return null
  const units = new Set(hits.map(h => h.unit_id))
  if (units.size > 1) return null
  return hits[0].unit_id
}

/** Load the active rules of a building. Never throws — a failure here must not
 *  break the page that was only trying to match a payment. */
export async function loadPatterns(buildingId) {
  if (!buildingId) return []
  const { data, error } = await supabase
    .from('income_patterns')
    .select('*')
    .eq('building_id', buildingId)
    .eq('active', true)
  if (error) { console.error('loadPatterns', error); return [] }
  return data || []
}

/**
 * Remember that this transaction belongs to this unit.
 *
 * Called after a human matches a credit by hand. Seeing the same shape again
 * bumps times_seen instead of creating a second rule (unique index on
 * building+day+amount+description). A rule that already points at a different
 * unit is overwritten — the person doing the matching now is the better source.
 */
export async function learnPattern({ buildingId, unitId, tx, userId = null }) {
  const fp = fingerprint(tx)
  if (!buildingId || !unitId || !fp) return null

  const { data: existing } = await supabase
    .from('income_patterns')
    .select('id, unit_id, times_seen')
    .eq('building_id', buildingId)
    .eq('day_of_month', fp.day_of_month)
    .eq('amount', fp.amount)
    .eq('description', fp.description)
    .maybeSingle()

  const lastSeen = tx.transaction_date || new Date().toISOString().slice(0, 10)

  if (existing) {
    // Same shape, different apartment: two residents pay the same amount on
    // the same day with nothing in the description to tell them apart. Keeping
    // the rule would send one neighbour's money to the other every month, so
    // it is retired instead of repointed, and the caller says so.
    if (existing.unit_id !== unitId) {
      await supabase
        .from('income_patterns')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      return { conflict: true, ...fp }
    }
    const { data, error } = await supabase
      .from('income_patterns')
      .update({
        active: true,
        last_seen: lastSeen,
        times_seen: (existing.times_seen || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) { console.error('learnPattern update', error); return null }
    return data
  }

  const { data, error } = await supabase
    .from('income_patterns')
    .insert({
      building_id: buildingId,
      unit_id: unitId,
      ...fp,
      last_seen: lastSeen,
      source: 'manual',
      created_by: userId,
    })
    .select()
    .single()
  if (error) { console.error('learnPattern insert', error); return null }
  return data
}

/**
 * Build rules out of matches that were already confirmed in earlier months.
 *
 * Months of hand-matching are themselves the training data: a credit shape
 * that was matched to the same apartment two or more times is a standing
 * order, and there is no reason to wait for it to be matched once more before
 * acting on it. A shape that was matched to two DIFFERENT apartments is
 * ambiguous and is skipped rather than guessed.
 *
 * Returns { created, skipped, conflicts } — nothing is written for shapes that
 * already have a rule.
 */
export async function learnFromExisting({ buildingId, transactions, userId = null }) {
  const groups = new Map()
  for (const tx of transactions || []) {
    if (tx.match_status !== 'matched' || !tx.unit_id) continue
    const fp = fingerprint(tx)
    if (!fp) continue
    // Day is clustered to the tolerance window so "the 9th" and "the 11th"
    // of different months count as the same standing order.
    const key = `${fp.amount}|${fp.description}|${Math.round(fp.day_of_month / DAY_TOLERANCE)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ tx, fp })
  }

  const existing = await loadPatterns(buildingId)
  let created = 0, skipped = 0, conflicts = 0

  for (const members of groups.values()) {
    if (members.length < 2) { skipped++; continue }            // not recurring yet
    const units = new Set(members.map(m => m.tx.unit_id))
    if (units.size > 1) { conflicts++; continue }               // ambiguous shape
    const latest = members.sort((a, b) =>
      (b.tx.transaction_date || '').localeCompare(a.tx.transaction_date || ''))[0]
    if (existing.some(p => patternMatches(p, latest.tx))) { skipped++; continue }
    const saved = await learnPattern({ buildingId, unitId: latest.tx.unit_id, tx: latest.tx, userId })
    if (saved?.conflict) conflicts++
    else if (saved) created++
    else skipped++
  }
  return { created, skipped, conflicts }
}

/** Stop applying a rule (kept for history rather than deleted). */
export async function deactivatePattern(id) {
  const { error } = await supabase
    .from('income_patterns')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('deactivatePattern', error)
  return !error
}

/** Human-readable rule, e.g. "כל ה-5 בחודש • 515 ₪ • ללא שם". */
export function describePattern(p) {
  const desc = p.description ? `"${p.description}"` : 'ללא שם'
  return `כל ה-${p.day_of_month} בחודש • ${Number(p.amount).toLocaleString('he-IL')} ₪ • ${desc}`
}
