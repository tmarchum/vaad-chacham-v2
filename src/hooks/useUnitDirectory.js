import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sortByUnitNumber } from '@/lib/utils'
import { listCacheGet, listCachePut } from '@/lib/listCache'

// One source of truth for "unit + who lives there". Family names are NOT a
// units column — they live in unit_residents — so any picker that reads
// unit.ownerName silently shows nothing. Use this instead.
//
// A flat's occupants are identified by FLAT NUMBER + FAMILY NAME, never by a
// first name: the committee screens are shared, printed and exported, and a
// household is one payer, one debtor, one booking — not a person. So `name`
// here is the family name, and `label` is the ready "דירה 12 — כהן".
//
// Almost every screen needs this, so it is loaded in ONE round trip (units
// with their residents embedded — it used to be two, one after the other),
// shared between everything on screen that asks at the same moment, and
// remembered between screens (lib/listCache, cleared on sign-out).
const inFlight = new Map()
const cacheKey = (buildingId) => `unitDirectory|${buildingId}`

function fetchDirectory(buildingId) {
  if (inFlight.has(buildingId)) return inFlight.get(buildingId)
  const p = (async () => {
    const { data, error } = await supabase
      .from('units')
      .select('id, number, floor, building_id, custom_fields, unit_residents(unit_id, last_name, phone, email, is_primary, resident_type)')
      .eq('building_id', buildingId)
      .eq('unit_residents.archived', false)
    if (error) throw error
    const units = []
    const residents = []
    for (const { unit_residents: rs, ...u } of data || []) {
      units.push(u)
      for (const r of rs || []) residents.push(r)
    }
    const value = { units, residents }
    const prev = listCacheGet(cacheKey(buildingId))
    // Unchanged: keep the same object so screens do not re-render for nothing.
    const out = prev && JSON.stringify(prev) === JSON.stringify(value) ? prev : value
    listCachePut(cacheKey(buildingId), out)
    return out
  })().finally(() => inFlight.delete(buildingId))
  inFlight.set(buildingId, p)
  return p
}

const EMPTY = { units: [], residents: [] }

export function useUnitDirectory(buildingId) {
  const [state, setState] = useState(() => ({
    buildingId,
    value: (buildingId && listCacheGet(cacheKey(buildingId))) || null,
    failed: false,
  }))

  useEffect(() => {
    if (!buildingId) return
    let active = true
    const cached = listCacheGet(cacheKey(buildingId)) || null
    setState((s) => (s.buildingId === buildingId && s.value === cached ? s : { buildingId, value: cached, failed: false }))
    fetchDirectory(buildingId).then(
      (value) => { if (active) setState((s) => (s.buildingId === buildingId && s.value === value ? s : { buildingId, value, failed: false })) },
      () => { if (active) setState((s) => ({ ...s, buildingId, failed: true })) },
    )
    return () => { active = false }
  }, [buildingId])

  // Rows that belong to another building must never show, even for one render.
  const current = buildingId && state.buildingId === buildingId ? state.value : null
  const loading = !!buildingId && !current && !(state.buildingId === buildingId && state.failed)
  const { units, residents } = current || EMPTY

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
