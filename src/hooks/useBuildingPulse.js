import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DONE_ISSUE_STATUSES } from '@/lib/issueStatus'

const DONE_LIST = `(${[...DONE_ISSUE_STATUSES].join(',')})`

// Lightweight building vitals for the app shell (nav badges, header status):
// four HEAD count queries — no rows are downloaded. Refetches when the
// building changes, and on `refreshKey` changes (navigation) at most once a
// minute — each round trip to the database is slow, and four of them on every
// move between screens was the shell's biggest share of the wait.
const MIN_GAP_MS = 60 * 1000
export function useBuildingPulse(buildingId, refreshKey) {
  const [pulse, setPulse] = useState({ openIssues: 0, urgentIssues: 0, units: 0, paid: 0, collectionPct: null })
  const last = useRef({ building: null, at: 0 })

  useEffect(() => {
    if (!buildingId) return
    if (last.current.building === buildingId && Date.now() - last.current.at < MIN_GAP_MS) return
    last.current = { building: buildingId, at: Date.now() }
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const count = (q) => q.then(({ count: c }) => c || 0)
    Promise.all([
      count(supabase.from('issues').select('id', { count: 'exact', head: true })
        .eq('building_id', buildingId).not('status', 'in', DONE_LIST)),
      count(supabase.from('issues').select('id', { count: 'exact', head: true })
        .eq('building_id', buildingId).not('status', 'in', DONE_LIST).in('priority', ['high', 'urgent'])),
      count(supabase.from('units').select('id', { count: 'exact', head: true })
        .eq('building_id', buildingId)),
      count(supabase.from('payments').select('id', { count: 'exact', head: true })
        .eq('building_id', buildingId).eq('month', month).eq('status', 'paid')),
    ]).then(([openIssues, urgentIssues, units, paid]) => {
      // A move between screens must not throw the answer away (the next one is
      // throttled); only a change of building makes it stale.
      if (last.current.building !== buildingId) return
      setPulse({
        openIssues, urgentIssues, units, paid,
        collectionPct: units ? Math.round((paid / units) * 100) : null,
      })
    }).catch(() => { /* shell vitals are best-effort */ })
  }, [buildingId, refreshKey])

  return pulse
}
