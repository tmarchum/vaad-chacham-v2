// Keeps an open tab in step with deploys.
//
// Every deploy replaces the hashed page chunks, and the old ones are gone from
// the server. A tab opened before the deploy then fails the first time it
// moves to a screen it had not loaded yet — that was the "error screen when
// moving between screens". Instead: notice the new build in the background,
// and make the next move between screens a full page load, which lands on the
// new version at the destination without any error.

const ENTRY_RE = /\/assets\/index-[^"']+\.js/

function ownEntry() {
  const el = document.querySelector('script[type="module"][src*="/assets/index-"]')
  return el ? (el.getAttribute('src').match(ENTRY_RE) || [])[0] : null
}

let newer = false
export const isNewBuildAvailable = () => newer

export async function checkForNewBuild() {
  const mine = ownEntry()
  if (!mine || newer) return newer
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return newer
    const live = ((await res.text()).match(ENTRY_RE) || [])[0]
    if (live && live !== mine) newer = true
  } catch { /* offline — try again later */ }
  return newer
}

export const isChunkError = (err) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically|Unable to preload CSS/i
    .test(err?.message || String(err || ''))

/** Reload once; a second failure inside 30 seconds is left to the error screen. */
export function reloadForNewBuild(to) {
  try {
    const last = Number(sessionStorage.getItem('chunk-reload-at') || 0)
    if (Date.now() - last < 30000) return false
    sessionStorage.setItem('chunk-reload-at', String(Date.now()))
  } catch { /* storage blocked — reload anyway */ }
  if (to) window.location.assign(to)
  else window.location.reload()
  return true
}

let started = false
export function startVersionWatch() {
  if (started || !ownEntry()) return
  started = true
  setInterval(checkForNewBuild, 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForNewBuild()
  })
  // An in-app link click after a deploy becomes a full page load of the same
  // address — the capture phase runs before React Router's own handler.
  document.addEventListener('click', (e) => {
    if (!newer || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = e.target.closest?.('a[href]')
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || url.pathname.startsWith('/site')) return
    e.preventDefault()
    window.location.assign(url.pathname + url.search + url.hash)
  }, true)
}
