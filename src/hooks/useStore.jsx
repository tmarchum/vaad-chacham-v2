import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import store from '@/data/supabaseStore'
import { supabase } from '@/lib/supabase'
import { TABLE_MAP } from '@/data/supabaseStore'

export function useCollection(collectionName, filters = {}) {
  const collection = store[collectionName]
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!collection) { setIsLoading(false); return }
    setIsLoading(true)
    try {
      const items = await collection.list(filters)
      setData(items)
    } catch(e) {
      console.error('useCollection error:', e)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [collection, JSON.stringify(filters)])

  useEffect(() => { refresh() }, [refresh])

  // Mutations merge the returned row into local state instead of re-downloading
  // the entire table (the store already returns the normalized row). A null
  // result (store error) falls back to a full refresh to stay consistent.
  const create = useCallback(async (itemData) => {
    setIsSaving(true)
    try {
      const newItem = await collection.create(itemData)
      if (newItem) setData((prev) => [newItem, ...prev])
      else await refresh()
      return newItem
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  const update = useCallback(async (id, itemData) => {
    setIsSaving(true)
    try {
      const updated = await collection.update(id, itemData)
      if (updated) setData((prev) => prev.map((it) => (it.id === id ? updated : it)))
      else await refresh()
      return updated
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  const remove = useCallback(async (id) => {
    setIsSaving(true)
    try {
      const removed = await collection.remove(id)
      if (removed) setData((prev) => prev.filter((it) => it.id !== id))
      else await refresh()
      return removed
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  const bulkCreate = useCallback(async (items) => {
    if (!items?.length) return []
    setIsSaving(true)
    try {
      const result = await collection.bulkCreate(items)
      await refresh()
      return result
    } catch (e) {
      console.error('bulkCreate error:', e)
      return []
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  return { data, isLoading, isSaving, create, update, remove, refresh, bulkCreate }
}

export function useRealtimeCollection(collectionName, filters = {}) {
  const result = useCollection(collectionName, filters)
  const { refresh } = result
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    const tableName = TABLE_MAP[collectionName] || collectionName
    const channelName = `rt-${tableName}-${filtersKey}`
    // Scope the realtime subscription to the building when one is given —
    // otherwise every change in any building re-fetches the table for every
    // connected client.
    const sub = { event: '*', schema: 'public', table: tableName }
    if (filters.building_id) sub.filter = `building_id=eq.${filters.building_id}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', sub, () => {
        refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, filtersKey, refresh])

  return result
}

// BuildingContext — selected building persists
const BuildingContext = createContext(null)
const SELECTED_BUILDING_KEY = 'vc_selectedBuilding'

export function BuildingProvider({ children }) {
  const { data: buildings, isLoading, refresh: refreshBuildings } = useCollection('buildings')
  const [selectedBuildingId, setSelectedBuildingId] = useState(() => {
    return localStorage.getItem(SELECTED_BUILDING_KEY) || null
  })

  useEffect(() => {
    if (!isLoading && buildings.length > 0 && !selectedBuildingId) {
      setSelectedBuildingId(buildings[0].id)
    }
  }, [buildings, isLoading, selectedBuildingId])

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId) ?? null

  const setSelectedBuilding = useCallback((idOrBuilding) => {
    const id = typeof idOrBuilding === 'string' ? idOrBuilding : idOrBuilding?.id
    setSelectedBuildingId(id)
    if (id) localStorage.setItem(SELECTED_BUILDING_KEY, id)
    else localStorage.removeItem(SELECTED_BUILDING_KEY)
  }, [])

  return (
    <BuildingContext.Provider value={{ selectedBuilding, setSelectedBuilding, buildings, isLoading, refreshBuildings }}>
      {children}
    </BuildingContext.Provider>
  )
}

export function useBuildingContext() {
  const context = useContext(BuildingContext)
  if (!context) throw new Error('useBuildingContext must be used within a BuildingProvider')
  return context
}
