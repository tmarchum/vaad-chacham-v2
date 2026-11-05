import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sortByUnitNumber } from '@/lib/utils'

// One source of truth for "unit + who lives there". Family names are NOT a
// units column — they live in unit_residents — so any picker that reads
// unit.ownerName silently shows nothing. Use this instead.
//
// Returns units sorted by running number, each with the primary resident's
// name/phone, plus a byId map and a ready "דירה 12 — כהן" label.
export function useUnitDirectory(buildingId) {
  const [units, setUnits] = useState([])
  const [residents, setResidents] = useState([])
  const [loading, setLoading] = useState(!!buildingId)

  useEffect(() => {
    if (!buildingId) { setUnits([]); setResidents([]); setLoading(false); return }
    let active = true
    setLoading(true)
    ;(async () => {
      const { data: u } = await supabase
        .from('units').select('id, number, floor, building_id, custom_fields')
        .eq('building_id', buildingId)
      const ids = (u || []).map((x) => x.id)
      const { data: r } = ids.length
        ? await supabase
          .from('unit_residents')
          .select('unit_id, first_name, last_name, phone, email, is_primary, resident_type')
          .in('unit_id', ids)
          .eq('archived', false)
        : { data: [] }
      if (!active) return
      setUnits(u || [])
      setResidents(r || [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [buildingId])

  return useMemo(() => {
    const primary = {}
    for (const r of residents) {
      if (r.is_primary || !primary[r.unit_id]) primary[r.unit_id] = r
    }
    const list = [...units].sort(sortByUnitNumber).map((u) => {
      const r = primary[u.id]
      const name = r ? `${r.first_name || ''} ${r.last_name || ''}`.trim() : ''
      return {
        id: u.id,
        number: u.number,
        floor: u.floor,
        type: u.custom_fields?.unit_type === 'rented' ? 'rented' : 'owned',
        name,
        lastName: r?.last_name || '',
        phone: r?.phone || '',
        email: r?.email || '',
        label: `דירה ${u.number}${name ? ` — ${name}` : ''}`,
      }
    })
    const byId = Object.fromEntries(list.map((x) => [x.id, x]))
    // Everyone registered to each flat, primary first — for the places that
    // must offer a choice of person rather than assume the primary resident.
    const membersByUnit = {}
    for (const r of residents) {
      const name = `${r.first_name || ''} ${r.last_name || ''}`.trim()
      if (!name) continue
      ;(membersByUnit[r.unit_id] ||= []).push({
        name, phone: r.phone || '', email: r.email || '', isPrimary: !!r.is_primary,
      })
    }
    for (const members of Object.values(membersByUnit)) {
      members.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    }
    return { units: list, byId, membersByUnit, loading }
  }, [units, residents, loading])
}
