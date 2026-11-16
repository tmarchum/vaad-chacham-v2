// Monthly statement of ועד1's charges to a building.
import { CHARGE_TYPE_LABELS, APPROVAL_LABELS } from '@/lib/servicePlans'

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export const statementLink = (s) => (s?.token ? `https://app.vaad1.co.il/statement/${s.token}` : '')

/** '2026-11' → 'נובמבר 2026' */
export function periodLabel(period) {
  const [y, m] = String(period || '').split('-')
  return MONTHS[Number(m) - 1] && y ? `${MONTHS[Number(m) - 1]} ${y}` : String(period || '')
}

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

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function statementEmailHtml(s, buildingName) {
  const { billed, awaiting } = splitLines(s.lines)
  const row = (l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(lineLabel(l))}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap">${nis(l.amount)}</td></tr>`
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0b1c30">
  <h2 style="margin:0 0 4px">ועד1 — חשבון חודשי</h2>
  <p style="margin:0 0 16px;color:#565e74">${esc(buildingName)} · ${esc(periodLabel(s.period))}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${billed.map(row).join('')}
    <tr><td style="padding:10px 0;font-weight:bold">סה"כ לתשלום (לפני מע"מ)</td><td style="padding:10px 0;font-weight:bold;text-align:left">${nis(s.total)}</td></tr>
  </table>
  ${awaiting.length ? `<p style="margin:16px 0 4px;font-weight:bold">ממתינים לאישור הוועד — לא נכללים בסכום (${nis(s.awaiting)})</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;color:#565e74">${awaiting.map(row).join('')}</table>` : ''}
  <p style="margin:20px 0"><a href="${statementLink(s)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">לפירוט המלא</a></p>
  <p style="font-size:12px;color:#737686">החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות, וועד1 לא מקבלת עמלה מאף ספק.</p>
</div>`
}
