// The screens the committee opens most, fetched in the background once the
// app is idle — so the first visit to them does not wait on a download.
// Same specifiers as the lazy() routes in main.jsx, so they share one chunk.
const COMMON = [
  () => import('@/pages/Issues'),
  () => import('@/pages/Payments'),
  () => import('@/pages/Units'),
  () => import('@/pages/Residents'),
  () => import('@/pages/Announcements'),
  () => import('@/pages/Expenses'),
  () => import('@/pages/Dashboard'),
]

let done = false
export function prefetchCommonScreens() {
  if (done) return
  done = true
  // Respect data-saver and very slow connections.
  const c = navigator.connection
  if (c?.saveData || /2g/.test(c?.effectiveType || '')) return
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500))
  idle(() => {
    COMMON.reduce((p, load) => p.then(() => load().catch(() => {})), Promise.resolve())
  })
}
