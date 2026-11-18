import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Why a building is blocked, in the committee's words.
export const ACCESS_REASON = {
  suspended: 'הגישה לבניין הושהתה על ידי ועד1.',
  mandate_cancelled: 'הוראת הקבע של הבניין לתשלום לוועד1 בוטלה.',
  unpaid: 'יש חשבון של ועד1 שלא שולם במועד.',
}

/** { loading, blocked, reason, period, total } for one building. Never blocks on error. */
export function useBuildingAccess(buildingId) {
  const [state, setState] = useState({ loading: true, blocked: false })
  useEffect(() => {
    let alive = true
    if (!buildingId) { setState({ loading: false, blocked: false }); return () => { alive = false } }
    supabase.rpc('building_access', { p_building: buildingId }).then(({ data, error }) => {
      if (alive) setState({ loading: false, ...(error || !data ? { blocked: false } : data) })
    })
    return () => { alive = false }
  }, [buildingId])
  return state
}
