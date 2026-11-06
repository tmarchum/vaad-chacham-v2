// Israeli clock changes, and the Saturday-night window they open.
//
// By the Time Decree Law (as amended in 2013) Israel moves to summer time
// (IDT, UTC+3) on the FRIDAY before the last Sunday of March at 02:00, and back
// to winter time (IST, UTC+2) on the last Sunday of October at 02:00.
//
// Why a building-committee app cares: in winter Shabbat ends early — around
// 17:00 in the centre of the country in December — so Saturday evening is free
// and the residents' room can be let out for a מוצ"ש event as a booking of its
// own, separate from the Shabbat. In summer Shabbat ends past 20:00 and that
// window does not exist, so the slot must not be offered.
//
// Everything here is decided from the CALENDAR DATE alone — never from the
// browser's clock or timezone. A resident booking 14/12 from abroad has to see
// exactly the slots the committee member standing in the lobby sees.

/** Day-of-month of the last Sunday in a month (monthIdx is 0-based). */
function lastSundayDayOfMonth(year, monthIdx) {
  const last = new Date(Date.UTC(year, monthIdx + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

/** Accepts a Date or a 'YYYY-MM-DD' string; returns {y, m, d} with m 1-based. */
function dateParts(dateish) {
  if (dateish instanceof Date) {
    if (Number.isNaN(dateish.getTime())) return null
    return { y: dateish.getFullYear(), m: dateish.getMonth() + 1, d: dateish.getDate() }
  }
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(dateish || ''))
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}

/** The hours of the Saturday-night slot, in one place so every screen agrees. */
export const MOTZASH_HOURS = '19:00-23:00'

/**
 * Is this calendar date in Israeli winter time (UTC+2)?
 *
 * The transitions happen at 02:00, so the boundary days resolve by the hour
 * nobody books in: the March Friday is already summer time by 19:00, and the
 * October Sunday is already winter time. Both are therefore counted whole.
 */
export function isIsraelWinterTime(dateish) {
  const p = dateParts(dateish)
  if (!p) return false
  const dstStart = 3 * 100 + (lastSundayDayOfMonth(p.y, 2) - 2) // the Friday before
  const dstEnd = 10 * 100 + lastSundayDayOfMonth(p.y, 9)
  const md = p.m * 100 + p.d
  return md < dstStart || md >= dstEnd
}

/**
 * May the מוצ"ש slot be booked on this date? Saturdays in winter time only.
 *
 * Deliberately not extended to a festival eve: the only festivals that fall in
 * winter time are minor ones that are not a יום טוב, so there is nothing to
 * come out of.
 */
export function isMotzashSlotOpen(dateish) {
  const p = dateParts(dateish)
  if (!p) return false
  if (new Date(p.y, p.m - 1, p.d).getDay() !== 6) return false
  return isIsraelWinterTime(dateish)
}
