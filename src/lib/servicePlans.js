// Service plans, pricing and punch arithmetic.
//
// One place for the rules, so the admin screen, the issue flow and any report
// agree on what a building owes and what a job costs in punches.
import { supabase } from '@/lib/supabase'

export const PLAN_KEYS = ['basic', 'assisted', 'managed']

export const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export const STAGE_LABELS = {
  queued_for_visit: 'ממתין לביקור הבא של איש האחזקה',
  awaiting_assignment: 'ממתין לשיבוץ',
  awaiting_quote_approval: 'ממתין לאישור הצעת מחיר',
  scheduled: 'תואם מועד',
  done_awaiting_confirmation: 'בוצע, ממתין לאישור',
}

export const HANDLER_LABELS = { committee: 'הוועד', management: 'חברת הניהול' }
export const HANDLER_KIND_LABELS = { handyman: 'איש אחזקה', vendor: 'ספק מוסמך' }

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
  if (kind === 'vendor') return 1
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
export function punchRules(settings) {
  const unit = Number(settings?.punch_minutes) || 60
  const unitText = unit === 60 ? 'שעה' : `${unit} דקות`
  const min = Number(settings?.visit_min_punches) || 1
  const mult = Number(settings?.off_hours_multiplier) || 2
  const days = (settings?.business_days || [0, 1, 2, 3, 4]).map((d) => DAY_LABELS[d]).join(', ')
  const hours = `${String(settings?.business_start || '08:00').slice(0, 5)}–${String(settings?.business_end || '17:00').slice(0, 5)}`
  return [
    `כל ביקור של איש אחזקה עולה לפחות ${min === 1 ? 'ניקוב אחד' : `${min} ניקובים`}, גם אם העבודה קצרה.`,
    `כל ${unitText} עבודה שמתחילה = ניקוב.`,
    `מחוץ לשעות הפעילות (${days}, ${hours}) הניקוב פי ${mult}.`,
    'תקלה לא דחופה מחכה לביקור הבא ומטופלת יחד עם שאר התקלות — משלמים על הביקור, לא על כל תקלה.',
    'תיאום ספק מוסמך = ניקוב אחד. החשבון של הספק ועלות החלקים בנפרד.',
    'ניקובים יורדים מהכרטיסייה הישנה קודם. יתרה בכרטיסייה שפג תוקפה — פגה.',
    'כשהיתרה אפס אי אפשר להעביר תקלה לטיפול עד רכישת כרטיסייה. עבודה שכבר התחילה תושלם, והחוב יקוזז מהכרטיסייה הבאה.',
  ]
}

/** Current punch balance for one building (purchased, used, balance). */
export async function loadPunchBalance(buildingId) {
  if (!buildingId) return null
  const { data, error } = await supabase
    .from('building_punch_balance').select('*').eq('building_id', buildingId).maybeSingle()
  if (error) return null
  return data || { building_id: buildingId, purchased: 0, used: 0, balance: 0 }
}
