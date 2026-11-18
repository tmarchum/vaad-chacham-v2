// Service plans, pricing and punch arithmetic.
//
// One place for the rules, so the admin screen, the issue flow and any report
// agree on what a building owes and what a job costs in punches.
import { supabase } from '@/lib/supabase'

export const PLAN_KEYS = ['basic', 'assisted', 'managed']

export const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export const STAGE_LABELS = {
  queued_for_visit: 'ממתין לביקור הבא של איש האחזקה',
  sent_to_vendor: 'נשלח לספק',
  awaiting_assignment: 'ממתין לשיבוץ',
  awaiting_quote_approval: 'ממתין לאישור הצעת מחיר',
  scheduled: 'תואם מועד',
  done_awaiting_confirmation: 'בוצע, ממתין לאישור',
}

export const HANDLER_LABELS = { committee: 'הוועד', management: 'ועד1' }
export const HANDLER_KIND_LABELS = { handyman: 'איש אחזקה', vendor: 'ספק מהצעות ועד1', contractor: 'הספק הקבוע של הבניין' }

// What happens when a building's punch card runs out — the committee chooses.
export const CARD_POLICY_LABELS = {
  bill_hourly: 'לחייב כל שעה בחשבון החודשי',
  block: 'לעצור העברה לאיש האחזקה עד קניית כרטיסייה',
  auto_renew: 'לחדש כרטיסייה אוטומטית',
}

// ועד1's own charges to a building. Vendor bills never appear here — the
// building pays vendors directly.
export const CHARGE_TYPE_LABELS = {
  hours: 'שעות אחזקה',
  card: 'כרטיסייה',
  handle_fee: 'ועד1 מטפלת בספק',
  service_item: 'שירות',
  parts: 'חלקים',
  building_subscription: 'מנוי חודשי',
  vendor_call: 'דמי הפניה מספק',
}

export const APPROVAL_LABELS = {
  awaiting: 'ממתין לאישור הוועד',
  approved: 'אושר',
  auto: 'אושר אוטומטית',
  rejected: 'נדחה',
}

export const UNIT_LABELS = { job: 'לעבודה', event: 'לאירוע', year: 'לשנה', item: 'ליחידה' }

/** Plans that can be offered (the retired full-management row is hidden). */
export const activePlans = (plans = []) => plans.filter((p) => p.active !== false)

/** Price of an extras item on a plan, or null when the plan does not offer it. */
export function itemPrice(item, planKey) {
  if (!item) return null
  const v = planKey === 'assisted' ? item.price_assisted : item.price_basic
  return v == null ? null : Number(v)
}

/** Total for a parts line: catalogue stock at its price, receipts plus handling. */
export function partLineTotal({ qty, unitCost, handlingPct }) {
  const q = Math.max(0, Number(qty) || 0)
  const c = Math.max(0, Number(unitCost) || 0)
  const h = Math.max(0, Number(handlingPct) || 0)
  return Math.round(q * c * (1 + h / 100) * 100) / 100
}

/**
 * Loads plans + settings. Returns { ready: false } when migration 030 has not
 * been applied yet, so callers can keep the old behaviour instead of failing
 * on columns that do not exist.
 */
export async function loadServiceConfig() {
  const [plansRes, settingsRes] = await Promise.all([
    supabase.from('service_plans').select('*').order('position'),
    supabase.from('service_settings').select('*').maybeSingle(),
  ])
  if (plansRes.error || settingsRes.error || !settingsRes.data) {
    return { ready: false, plans: [], settings: null }
  }
  return { ready: true, plans: plansRes.data || [], settings: settingsRes.data }
}

/** Monthly subscription for a building: per-unit price with a per-building floor. */
export function monthlyPrice(plan, units, override) {
  if (override != null && override !== '') return Number(override)
  if (!plan) return 0
  const perUnit = Number(plan.price_per_unit) || 0
  if (perUnit === 0) return 0
  return Math.max(perUnit * (Number(units) || 0), Number(plan.min_per_building) || 0)
}

/** Is this moment outside the configured business hours? */
export function isOffHours(date, settings) {
  if (!settings) return false
  const d = date instanceof Date ? date : new Date(date)
  const days = settings.business_days || [0, 1, 2, 3, 4]
  if (!days.includes(d.getDay())) return true
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const start = String(settings.business_start || '08:00').slice(0, 5)
  const end = String(settings.business_end || '17:00').slice(0, 5)
  return hhmm < start || hhmm >= end
}

/**
 * Punches for a VISIT (one call-out, however many issues it covers).
 * Every visit costs at least visit_min_punches; beyond that one punch per
 * hour STARTED (2.5h = 3); the total is multiplied outside business hours.
 * Coordinating a licensed contractor is a flat single punch: the contractor's
 * own bill goes to the building against an approved quote.
 */
export function punchesFor({ kind, hours, offHours }, settings) {
  // Contractors cost nothing; handling a vendor is a money fee charged at
  // transfer ("ועד1 תטפל"), so neither takes a punch.
  if (kind === 'contractor' || kind === 'vendor') return 0
  const unitMinutes = Number(settings?.punch_minutes) || 60
  const minPunches = Number(settings?.visit_min_punches) || 1
  const minutes = Math.max(0, Number(hours) || 0) * 60
  const base = Math.max(minPunches, Math.ceil(minutes / unitMinutes))
  const mult = offHours ? Number(settings?.off_hours_multiplier) || 2 : 1
  return base * mult
}

/**
 * The punch rules in plain Hebrew, built from the live settings so what the
 * committee reads is always what the system charges.
 */
export function punchRules(settings, plan, policy) {
  const unit = Number(settings?.punch_minutes) || 60
  const unitText = unit === 60 ? 'שעה' : `${unit} דקות`
  const mult = Number(settings?.off_hours_multiplier) || 2
  const days = (settings?.business_days || [0, 1, 2, 3, 4]).map((d) => DAY_LABELS[d]).join(', ')
  const hours = `${String(settings?.business_start || '08:00').slice(0, 5)}–${String(settings?.business_end || '17:00').slice(0, 5)}`
  const hourPrice = Number(plan?.hour_price) || 0
  const fee = Number(plan?.handle_fee) || 0
  const pct = Number(settings?.parts_handling_pct ?? 10)
  const threshold = Number(settings?.parts_approval_threshold) || 0
  const lines = [
    `כל ביקור של איש אחזקה הוא לפחות ${unitText}, וכל ${unitText} שמתחילה נספרת${hourPrice ? ` (₪${hourPrice} לשעה)` : ''}.`,
    `מחוץ לשעות הפעילות (${days}, ${hours}) — פי ${mult}.`,
    'תקלה לא דחופה ממתינה לביקור הבא ומטופלת יחד עם שאר התקלות — משלמים על הביקור, לא על כל תקלה.',
    'הספק הקבוע של הבניין (מעליות, ניקיון וכד׳) מקבל את התקלה ישירות — ללא חיוב.',
  ]
  if (fee) lines.push(`"ועד1 תטפל" בספק — ₪${fee} לעבודה. הוועד בוחר את ההצעה, ועד1 מתאמת ומוודאת. את הספק הבניין משלם ישירות.`)
  if (plan?.card_punches) lines.push(`כרטיסייה: ${plan.card_punches} שעות ועוד ${Number(plan.card_bonus_punches) || 0} שעת בונוס, ב-₪${Number(plan.card_price) || 0}. השעות יורדות קודם מהכרטיסייה הישנה.`)
  if (Number(plan?.included_punches)) lines.push(`ביקור ליקויים חודשי — ${plan.included_punches === 1 ? 'שעה אחת כלולה' : `${plan.included_punches} שעות כלולות`} בכל חודש.`)
  lines.push(`כשהכרטיסייה נגמרת: ${CARD_POLICY_LABELS[policy] || CARD_POLICY_LABELS.bill_hourly}.`)
  lines.push(`חלקים: פריטי מלאי לפי מחירון; כל השאר לפי קבלה${pct ? ` ועוד ${pct}% טיפול` : ''}.${threshold ? ` חלק מעל ₪${threshold} — רק אחרי אישור הוועד.` : ''}`)
  lines.push('כל חיוב מוצג לוועד עם המחיר שלו, ומאושר לפני שהוא נכנס לחשבון החודשי.')
  return lines
}

/** Extras price list and parts catalogue (both readable by any signed-in user). */
export async function loadPriceLists() {
  const [items, parts] = await Promise.all([
    supabase.from('service_price_items').select('*').order('position'),
    supabase.from('parts_catalog').select('*').order('position'),
  ])
  return { items: items.error ? [] : items.data || [], parts: parts.error ? [] : parts.data || [] }
}

/** A building's plan key and billing preferences. */
export async function loadBuildingBilling(buildingId) {
  if (!buildingId) return null
  const { data, error } = await supabase.from('buildings')
    .select('id, name, total_units, service_plan, plan_price_override, auto_approve_limit, card_exhausted_policy, handling_mode, vendor_auto_limit')
    .eq('id', buildingId).maybeSingle()
  if (error) return null
  return data || null
}

/** Current punch balance for one building (purchased, used, balance). */
export async function loadPunchBalance(buildingId) {
  if (!buildingId) return null
  const { data, error } = await supabase
    .from('building_punch_balance').select('*').eq('building_id', buildingId).maybeSingle()
  if (error) return null
  return data || { building_id: buildingId, purchased: 0, used: 0, balance: 0 }
}
