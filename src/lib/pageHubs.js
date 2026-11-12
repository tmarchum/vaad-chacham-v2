// Pairs of pages that answer the same question from two angles used to be two
// separate entries in the menu. They are now one entry with tabs. Each tab is
// still its own URL, so links, the back button and the plan gate all keep
// working, and the page under the tab is the same page as before.
export const PAGE_HUBS = [
  [{ to: '/payments', label: 'תשלומים' }, { to: '/collection-cases', label: 'מעקב חובות' }],
  [{ to: '/expenses', label: 'ספר הוצאות' }, { to: '/expense-analysis', label: 'ניתוח הוצאות' }],
  [{ to: '/bank-transactions', label: 'תנועות בנק' }, { to: '/income', label: 'הכנסות' }],
  [{ to: '/reports', label: 'דוחות' }, { to: '/balance', label: 'מאזן' }],
]

/** Every path that belongs to the same hub as `path` (for the sidebar's active state). */
export function hubPathsFor(path) {
  return PAGE_HUBS.find((h) => h.some((t) => t.to === path))?.map((t) => t.to) || [path]
}
