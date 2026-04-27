import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import store from '@/data/supabaseStore'

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

  const create = useCallback(async (itemData) => {
    setIsSaving(true)
    try {
      const newItem = await collection.create(itemData)
      await refresh()
      return newItem
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  const update = useCallback(async (id, itemData) => {
    setIsSaving(true)
    try {
      const updated = await collection.update(id, itemData)
      await refresh()
      return updated
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  const remove = useCallback(async (id) => {
    setIsSaving(true)
    try {
      const removed = await collection.remove(id)
      await refresh()
      return removed
    } finally {
      setIsSaving(false)
    }
  }, [collection, refresh])

  return { data, isLoading, isSaving, create, update, remove, refresh }
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
