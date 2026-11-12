// Text size — the one accessibility control this app was missing.
//
// A building committee is not a product team: the people reading these screens
// are every age in the building, and the ones most likely to be chasing a
// payment or a fault are often the ones who find 12px hardest. The competitor
// puts this control on its main menu, and it is right to.
//
// Why `zoom` and not a font scale: this UI sizes almost everything in px
// (text-[13px] and friends), so changing a root font-size would move almost
// nothing. `zoom` scales type AND tap targets together, which is the half that
// actually matters on a phone. Supported in Chrome, Edge, Safari and Firefox
// 126+; where it is not, the page simply renders at its normal size.
const KEY = 'vc_text_size'

export const TEXT_SIZES = [
  { id: 'normal', label: 'רגיל', zoom: 1 },
  { id: 'large', label: 'גדול', zoom: 1.15 },
  { id: 'xlarge', label: 'גדול מאוד', zoom: 1.3 },
]

export function getTextSize() {
  try {
    const v = localStorage.getItem(KEY)
    return TEXT_SIZES.some((x) => x.id === v) ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function applyTextSize(id) {
  const pick = TEXT_SIZES.find((x) => x.id === id) || TEXT_SIZES[0]
  // '' rather than '1' at the normal size, so nothing is left on the element
  // for a browser to mis-handle when the user never touched this.
  document.documentElement.style.zoom = pick.zoom === 1 ? '' : String(pick.zoom)
}

export function setTextSize(id) {
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  applyTextSize(id)
}

/** Call once at startup, before React renders. */
export function initTextSize() {
  applyTextSize(getTextSize())
}
