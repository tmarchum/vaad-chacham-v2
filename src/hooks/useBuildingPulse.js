import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DONE_ISSUE_STATUSES } from '@/lib/issueStatus'

const DONE_LIST = `(${[...DONE_ISSUE_STATUSES].join(',')})`

// Lightweight building vitals for the app shell (nav badges, header status):
// four HEAD count queries — no rows are downloaded. Refetches when the
// building changes or `refreshKey` changes (e.g. on navigation).
export function useBuildingPulse(buildingId, refreshKey) {
  const [pulse, setPulse] = useState({ openIssues: 0, urgentIssues: 0, units: 0, paid: 0, collectionPct: null })

  useEffect(() => {
    if (!buildingId) return
    let active = true
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
      if (!active) return
      setPulse({
        openIssues, urgentIssues, units, paid,
        collectionPct: units ? Math.round((paid / units) * 100) : null,
      })
    }).catch(() => { /* shell vitals are best-effort */ })
    return () => { active = false }
  }, [buildingId, refreshKey])

  return pulse
}
