import { supabase } from '@/lib/supabase'

// Writes crashes and failed loads to public.client_errors so a broken screen
// leaves a trace (which screen, what error, which build). Fire-and-forget:
// logging must never throw or slow the page. The same message is logged at
// most 3 times per page load, so a render loop cannot flood the table.
const seen = new Map()
const BUILD = import.meta.env.VITE_BUILD || 'web'

const IGNORE = /ResizeObserver loop|AbortError|The user aborted a request|Load failed$|NetworkError when attempting to fetch|Failed to fetch$/i

export function logError(err, kind = 'error') {
  try {
    const message = String(err?.message || err || 'unknown').slice(0, 2000)
    if (IGNORE.test(message)) return
    const n = (seen.get(message) || 0) + 1
    seen.set(message, n)
    if (n > 3) return
    supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id
      if (!uid) return
      return supabase.from('client_errors').insert({
        user_id: uid,
        kind,
        path: (location.pathname + location.search).slice(0, 500),
        message,
        stack: String(err?.stack || '').slice(0, 8000),
        build: BUILD,
        user_agent: navigator.userAgent.slice(0, 500),
      })
    }).catch(() => {})
  } catch { /* never let logging break the app */ }
}

let installed = false
export function installGlobalErrorLog() {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => logError(e.error || e.message, 'window'))
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'promise'))
}
