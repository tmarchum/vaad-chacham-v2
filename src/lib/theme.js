// Theme engine — the design tokens live in src/index.css under
// [data-theme="…"]; this module applies the attribute and persists the pick.
const KEY = 'vc_theme'

export const THEMES = [
  { id: 'bright', label: 'הבהירה', description: 'נייר חם, טורקיז-אמרלד' },
  { id: 'dark', label: 'הכהה', description: 'משטחים כהים, אותו מותג' },
]

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY)
    return THEMES.some((x) => x.id === t) ? t : 'bright'
  } catch {
    return 'bright'
  }
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  applyTheme(id)
}

/** Call once at startup, before React renders. */
export function initTheme() {
  applyTheme(getTheme())
}
