import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { sortByUnitNumber } from '@/lib/utils'
import { ResidentPortal } from './ResidentPortal'
import { Eye, X } from 'lucide-react'

import { exitResidentPreview } from '@/lib/residentPreview'

/* ════════════════════════════════════════════════════════════════
   Admin "view as resident": renders the real resident portal with a
   synthetic resident profile for a chosen unit, under a sticky preview
   bar (building + unit pickers, exit). Data access uses the admin's own
   session; actions performed here are REAL — the bar says so.
   ════════════════════════════════════════════════════════════════ */
export function ResidentPreview() {
  const { profile } = useAuth()
  const [buildings, setBuildings] = useState([])
  const [units, setUnits] = useState([])
  const [buildingId, setBuildingId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: blds } = await supabase.from('buildings').select('id, name').order('name')
      setBuildings(blds || [])
      const firstBld = blds?.[0]?.id || ''
      setBuildingId(firstBld)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!buildingId) { setUnits([]); return }
    ;(async () => {
      const { data } = await supabase
        .from('units').select('id, number, unit_number, owner_name, building_id')
        .eq('building_id', buildingId)
      const sorted = (data || []).sort(sortByUnitNumber)
      setUnits(sorted)
      setUnitId(sorted[0]?.id || '')
    })()
  }, [buildingId])

  const previewProfile = useMemo(() => {
    if (!unitId) return null
    return {
      ...profile,
      role: 'resident',
      unit_id: unitId,
      building_id: buildingId,
    }
  }, [profile, unitId, buildingId])

  return (
    <div dir="rtl">
      {/* ── Preview bar ── */}
      <div className="sticky top-0 z-[60] bg-amber-400 text-amber-950 px-4 py-2 shadow-md">
        <div className="max-w-xl mx-auto flex items-center gap-2 flex-wrap text-sm">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-bold shrink-0">תצוגת דייר</span>
          <select
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            className="h-7 rounded-lg border border-amber-500 bg-amber-50 px-2 text-[12px] max-w-[130px]"
          >
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="h-7 rounded-lg border border-amber-500 bg-amber-50 px-2 text-[12px]"
          >
            {units.map((u) => <option key={u.id} value={u.id}>דירה {u.unit_number || u.number}{u.owner_name ? ` — ${u.owner_name}` : ''}</option>)}
          </select>
          <span className="text-[11px] opacity-80 hidden sm:inline">פעולות כאן אמיתיות!</span>
          <button
            onClick={exitResidentPreview}
            className="mr-auto flex items-center gap-1 rounded-lg bg-amber-950 text-amber-50 px-3 py-1 text-[12px] font-semibold hover:bg-amber-900 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            חזרה לניהול
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : !previewProfile ? (
        <p className="text-center py-16 text-slate-500 text-sm">אין דירות בבניין הזה — בחר בניין אחר</p>
      ) : (
        <ResidentPortal key={unitId} profileOverride={previewProfile} />
      )}
    </div>
  )
}
