import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sortByUnitNumber } from '@/lib/utils'

// One source of truth for "unit + who lives there". Family names are NOT a
// units column — they live in unit_residents — so any picker that reads
// unit.ownerName silently shows nothing. Use this instead.
//
// A flat's occupants are identified by FLAT NUMBER + FAMILY NAME, never by a
// first name: the committee screens are shared, printed and exported, and a
// household is one payer, one debtor, one booking — not a person. So `name`
// here is the family name, and `label` is the ready "דירה 12 — כהן".
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
          .select('unit_id, last_name, phone, email, is_primary, resident_type')
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
      // Family name only. No first names anywhere in the committee UI.
      const name = (r?.last_name || '').trim()
      return {
        id: u.id,
        number: u.number,
        floor: u.floor,
        type: u.custom_fields?.unit_type === 'rented' ? 'rented' : 'owned',
        name,            // family name — the household's display name
        family: name,     // explicit alias, for call sites that read better
        lastName: name,
        phone: r?.phone || '',
        email: r?.email || '',
        label: `דירה ${u.number}${name ? ` — ${name}` : ''}`,
        household: name ? `משפחת ${name}` : `דירה ${u.number}`,
      }
    })
    const byId = Object.fromEntries(list.map((x) => [x.id, x]))
    return { units: list, byId, loading }
  }, [units, residents, loading])
}
