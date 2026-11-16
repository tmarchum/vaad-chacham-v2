// Monthly statement of ועד1's charges to a building.
import { CHARGE_TYPE_LABELS, APPROVAL_LABELS } from '@/lib/servicePlans'

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export const statementLink = (s) => (s?.token ? `https://app.vaad1.co.il/statement/${s.token}` : '')

/** '2026-11' → 'נובמבר 2026' */
export function periodLabel(period) {
  const [y, m] = String(period || '').split('-')
  return MONTHS[Number(m) - 1] && y ? `${MONTHS[Number(m) - 1]} ${y}` : String(period || '')
}

/** '2026-12-08' → '08/12/2026' */
export const heDate = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/')

export const nis = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`

/** Lines that count toward the total, and lines still waiting for approval. */
export function splitLines(lines = []) {
  return {
    billed: lines.filter((l) => l.approval !== 'awaiting'),
    awaiting: lines.filter((l) => l.approval === 'awaiting'),
  }
}

export const lineLabel = (l) => [CHARGE_TYPE_LABELS[l.type] || l.type, l.note].filter(Boolean).join(' · ')
export const approvalLabel = (a) => APPROVAL_LABELS[a] || a
