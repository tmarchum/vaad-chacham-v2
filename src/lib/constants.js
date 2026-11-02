export const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** Month options for <FormSelect> — [{value:'01',label:'ינואר'}, …] */
export const HEBREW_MONTH_OPTIONS = HEBREW_MONTHS.map((label, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label,
}))

/** '2026-11' → 'נובמבר 2026' (falls back to the raw value). */
export const hebrewMonthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-')
  const name = HEBREW_MONTHS[Number(m) - 1]
  return name && y ? `${name} ${y}` : (ym || '')
}
