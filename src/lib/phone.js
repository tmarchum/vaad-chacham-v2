// Phone helpers — decide whether a number can receive WhatsApp.
//
// WhatsApp (wa.me) only works for a real mobile/landline. Service short-codes
// (*3626), toll lines (1-700-…, 1-800-…), and anything not starting with a
// leading 0 are NOT reachable on WhatsApp — for those we fall back to a phone
// call. This matters because the vendor pool includes such numbers (gas
// companies, national service lines).

// Israeli mobile (05x… → 10 digits) or landline (0x… → 9 digits).
export function isWhatsappable(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return /^0\d{8,9}$/.test(digits)
}

// International form for wa.me (972…), or null if not WhatsApp-able.
export function waNumber(phone) {
  if (!isWhatsappable(phone)) return null
  return '972' + String(phone).replace(/\D/g, '').slice(1)
}

// wa.me link, or null when the number can't use WhatsApp.
export function waLink(phone, text = '') {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

// tel: link — keeps * and digits so short-codes like *3626 still dial.
export function telHref(phone) {
  const raw = String(phone || '').replace(/[^\d*+]/g, '')
  return raw ? `tel:${raw}` : null
}
