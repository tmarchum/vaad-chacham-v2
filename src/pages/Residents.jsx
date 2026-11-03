import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool } from '@/components/common/FormField'
import { SearchBar } from '@/components/common/SearchBar'
import { StatCard } from '@/components/common/StatCard'
import { TabGroup } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { Plus, Star, User, Phone, Mail, Home, ChevronDown, Pencil, Trash2, Users, LogOut, KeyRound, CalendarClock, PhoneOff, DoorOpen } from 'lucide-react'
import { toast, toastError } from '@/lib/toast'

const EMPTY_FORM = {
  unitId: '', first_name: '', last_name: '', email: '', phone: '',
  resident_type: 'owner', is_primary: false,
  owner_first_name: '', owner_last_name: '', owner_phone: '', owner_email: '',
  move_in_date: '', move_out_date: '', notes: ''
}

const RESIDENT_TYPE_OPTIONS = [
  { value: 'owner', label: 'בעלים' },
  { value: 'tenant', label: 'שוכר' },
]

function Residents() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allUnits, isLoading } = useCollection('units', scope)
  const { data: allResidents, create, update, remove, refresh } = useCollection('unitResidents')

  const [expandedUnits, setExpandedUnits] = useState({})
  const [searchParams] = useSearchParams()
  const focusUnit = searchParams.get('unit')
  useEffect(() => {
    if (!focusUnit) return
    setExpandedUnits((p) => ({ ...p, [focusUnit]: true }))
    setTimeout(() => document.getElementById(`unit-${focusUnit}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
  }, [focusUnit])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  // Move-out: sets move_out_date; the DB (migration 017) archives the
  // resident on that date, unlinks their login, and promotes the next
  // primary — so names everywhere switch to the remaining/new residents.
  const [moveOutTarget, setMoveOutTarget] = useState(null)
  const [moveOutDate, setMoveOutDate] = useState('')
  const [showFormer, setShowFormer] = useState(false)
  const [expandedOwnerInfo, setExpandedOwnerInfo] = useState({})
  const [primaryWarnOpen, setPrimaryWarnOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | owner | tenant | leaving | vacant
  const [pendingSubmitData, setPendingSubmitData] = useState(null)

  const units = useMemo(() => {
    if (!selectedBuilding) return []
    return allUnits
      .filter((u) => u.buildingId === selectedBuilding.id)
      .sort((a, b) => {
        const numA = parseInt(a.unit_number || a.number || '0', 10)
        const numB = parseInt(b.unit_number || b.number || '0', 10)
        return numA - numB
      })
  }, [allUnits, selectedBuilding])

  const residentsByUnit = useMemo(() => {
    const map = {}
    allResidents.forEach((r) => {
      if (r.archived && !showFormer) return // former residents hidden unless asked
      if (!map[r.unitId]) map[r.unitId] = []
      map[r.unitId].push(r)
    })
    return map
  }, [allResidents, showFormer])

  // `current` = the row's rendered state (rows auto-expand while searching/filtering)
  const toggleUnit = (unitId, current) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !current }))
  }

  const toggleOwnerInfo = (residentId) => {
    setExpandedOwnerInfo((prev) => ({ ...prev, [residentId]: !prev[residentId] }))
  }

  const setField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  const openCreateForUnit = (unit) => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, unitId: unit.id })
    setFormOpen(true)
  }

  const openEdit = (resident) => {
    setEditingId(resident.id)
    setForm({
      unitId: resident.unitId || '',
      first_name: resident.first_name || '',
      last_name: resident.last_name || '',
      email: resident.email || '',
      phone: resident.phone || '',
      resident_type: resident.resident_type || 'owner',
      is_primary: !!resident.is_primary,
      owner_first_name: resident.owner_first_name || '',
      owner_last_name: resident.owner_last_name || '',
      owner_phone: resident.owner_phone || '',
      owner_email: resident.owner_email || '',
      move_in_date: resident.move_in_date || '',
      move_out_date: resident.move_out_date || '',
      notes: resident.notes || '',
    })
    setFormOpen(true)
  }

  const doSubmit = async (data) => {
    try {
      if (editingId) {
        await update(editingId, data)
      } else {
        await create(data)
      }
      setFormOpen(false)
      setPendingSubmitData(null)
    } catch (err) {
      console.error('Failed to save resident:', err)
      toastError('שגיאה בשמירת דייר')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = { ...form }

    // Convert empty date strings to null (Postgres rejects "" for date fields)
    if (data.move_in_date === '') data.move_in_date = null
    if (data.move_out_date === '') data.move_out_date = null

    // If setting as primary, check if another primary exists in this unit
    if (data.is_primary) {
      const unitResidents = residentsByUnit[data.unitId] || []
      const existingPrimary = unitResidents.find(
        (r) => r.is_primary && r.id !== editingId
      )
      if (existingPrimary) {
        setPendingSubmitData(data)
        setPrimaryWarnOpen(true)
        return
      }
    }

    await doSubmit(data)
  }

  const confirmPrimaryOverride = async () => {
    if (!pendingSubmitData) return
    const data = pendingSubmitData
    // Demote the existing primary resident
    const unitResidents = residentsByUnit[data.unitId] || []
    const existingPrimary = unitResidents.find(
      (r) => r.is_primary && r.id !== editingId
    )
    try {
      if (existingPrimary) {
        await update(existingPrimary.id, { ...existingPrimary, is_primary: false })
      }
      await doSubmit(data)
    } catch (err) {
      console.error('Failed to override primary resident:', err)
      toastError('שגיאה בעדכון דייר ראשי')
    }
    setPrimaryWarnOpen(false)
  }

  const openMoveOut = (resident) => {
    setMoveOutTarget(resident)
    setMoveOutDate(new Date().toISOString().slice(0, 10))
  }

  const confirmMoveOut = async () => {
    if (!moveOutTarget || !moveOutDate) return
    const res = await update(moveOutTarget.id, { move_out_date: moveOutDate }, { silent: true })
    setMoveOutTarget(null)
    if (!res) return
    // The DB trigger may have archived this row and promoted another primary.
    await refresh()
    const today = new Date().toISOString().slice(0, 10)
    toast(moveOutDate <= today
      ? `${getResidentFullName(moveOutTarget) || 'הדייר'} סומן/ה כעזב/ה — הדירה עודכנה`
      : `העזיבה תיכנס לתוקף ב-${formatDate(moveOutDate)} באופן אוטומטי`)
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await remove(deleteTarget.id)
      } catch (err) {
        console.error('Failed to delete resident:', err)
        toastError('שגיאה במחיקת דייר')
      }
      setDeleteTarget(null)
    }
  }

  const getUnitNumber = (u) => u.unit_number || u.number || ''
  const getResidentFullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ')

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ספר הדיירים</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  // ── Directory view model (this building only) ──
  const unitIdSet = new Set(units.map((u) => u.id))
  const activeResidents = allResidents.filter((r) => !r.archived && unitIdSet.has(r.unitId))
  const ownersCount = activeResidents.filter((r) => r.resident_type !== 'tenant').length
  const tenantsCount = activeResidents.length - ownersCount
  const leavingResidents = activeResidents.filter((r) => r.move_out_date)
    .sort((a, b) => (a.move_out_date || '').localeCompare(b.move_out_date || ''))
  const noPhone = activeResidents.filter((r) => !r.phone)
  const activeByUnit = {}
  activeResidents.forEach((r) => { (activeByUnit[r.unitId] ||= []).push(r) })
  const occupiedUnits = units.filter((u) => activeByUnit[u.id]?.length)
  const vacantUnits = units.filter((u) => !activeByUnit[u.id]?.length)
  const noPrimaryUnits = occupiedUnits.filter((u) => !activeByUnit[u.id].some((r) => r.is_primary))
  const unitById = Object.fromEntries(units.map((u) => [u.id, u]))

  const q = search.trim().toLowerCase()
  const matchesResident = (r) => {
    if (typeFilter === 'owner' && r.resident_type === 'tenant') return false
    if (typeFilter === 'tenant' && r.resident_type !== 'tenant') return false
    if (typeFilter === 'leaving' && !(r.move_out_date && !r.archived)) return false
    if (!q) return true
    return [getResidentFullName(r), r.phone, r.email, r.owner_first_name, r.owner_last_name]
      .some((v) => v && String(v).toLowerCase().includes(q))
  }
  const narrowing = !!q || typeFilter !== 'all'
  const rows = units.map((unit) => {
    const all = residentsByUnit[unit.id] || []
    const unitHit = q && String(getUnitNumber(unit)).toLowerCase() === q.replace(/^דירה\s*/, '')
    const visible = unitHit && typeFilter === 'all' ? all : all.filter(matchesResident)
    return { unit, residents: narrowing ? visible : all, show: !narrowing || unitHit || visible.length > 0 }
  }).filter(({ unit, show }) => {
    if (typeFilter === 'vacant') return !activeByUnit[unit.id]?.length && (!q || String(getUnitNumber(unit)).includes(q.replace(/^דירה\s*/, '')))
    return show
  })

  const focusOn = (unitId) => {
    setExpandedUnits((p) => ({ ...p, [unitId]: true }))
    setTimeout(() => document.getElementById(`unit-${unitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ספר הדיירים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            בעלים, שוכרים ופרטי קשר לפי דירה — כניסות ועזיבות{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] flex items-center gap-2 text-[13px] font-semibold text-[var(--text-secondary)] cursor-pointer select-none">
            <input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} className="h-4 w-4 rounded accent-[var(--primary)]" />
            הצג דיירים שעזבו
          </label>
        </div>
      </div>

      {!selectedBuilding ? (
        <EmptyState
          icon={Home}
          title="לא נבחר בניין"
          description="בחר בניין כדי לראות דיירים"
        />
      ) : units.length === 0 ? (
        <EmptyState
          icon={Users}
          title="אין דירות בבניין"
          description="הוסף דירות תחילה"
        />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="דיירים פעילים" icon={Users} color="blue"
              value={String(activeResidents.length)}
              sub={`${ownersCount} בעלים • ${tenantsCount} שוכרים`} />
            <StatCard label="דירות מאוכלסות" icon={Home} color="emerald"
              value={String(occupiedUnits.length)}
              note={`מתוך ${units.length}`}
              sub={vacantUnits.length ? `${vacantUnits.length} דירות ללא דיירים רשומים` : 'לכל הדירות רשומים דיירים ✓'}
              progress={units.length ? Math.round((occupiedUnits.length / units.length) * 100) : 0} />
            <StatCard label="עזיבות מתוכננות" icon={CalendarClock} color={leavingResidents.length ? 'amber' : 'slate'}
              value={String(leavingResidents.length)}
              sub={leavingResidents.length ? `הקרובה: ${formatDate(leavingResidents[0].move_out_date)}` : 'אין עזיבות מתוכננות'}
              footer={leavingResidents.length ? <button onClick={() => setTypeFilter('leaving')} className="text-[var(--primary)] font-semibold hover:underline">להצגת העוזבים ←</button> : null} />
            <StatCard label="פרטי קשר חסרים" icon={PhoneOff} color={noPhone.length ? 'amber' : 'emerald'}
              value={String(noPhone.length)}
              sub={noPhone.length ? 'דיירים פעילים ללא מספר טלפון' : 'לכל הדיירים יש טלפון ✓'}
              footer={noPrimaryUnits.length ? <span className="text-[var(--warning)] font-semibold">{noPrimaryUnits.length} דירות ללא דייר ראשי</span> : null} />
          </div>

          {/* Filter card */}
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 min-w-0">
              <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם, טלפון, אימייל או מספר דירה..." />
            </div>
            <TabGroup
              tabs={[
                { key: 'all', label: 'הכל', count: units.length },
                { key: 'owner', label: 'בעלים', count: ownersCount },
                { key: 'tenant', label: 'שוכרים', count: tenantsCount },
                { key: 'leaving', label: 'עוזבים', count: leavingResidents.length },
                { key: 'vacant', label: 'ללא דיירים', count: vacantUnits.length },
              ]}
              activeTab={typeFilter}
              onChange={setTypeFilter}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Directory */}
            <div className="xl:col-span-8">
              {rows.length === 0 ? (
                <EmptyState icon={Users} title="לא נמצאו דיירים" description="נסה לשנות את החיפוש או הסינון" />
              ) : (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_auto] items-center h-10 px-5 bg-[var(--bg)] border-b border-[var(--border)] text-[12px] font-semibold text-[var(--text-secondary)]">
                    <span>דירה ודייר ראשי</span>
                    <span>פעולות</span>
                  </div>
                  <div className="divide-y divide-[var(--border-light)]">
                    {rows.map(({ unit, residents: unitResidents }) => {
                      const isExpanded = unit.id in expandedUnits ? !!expandedUnits[unit.id] : narrowing
                      const active = activeByUnit[unit.id] || []
                      const primary = active.find((r) => r.is_primary)
                      const leaving = active.some((r) => r.move_out_date)
                      const tenants = active.filter((r) => r.resident_type === 'tenant').length

                      return (
                        <div key={unit.id} id={`unit-${unit.id}`} className={`scroll-mt-24 ${focusUnit === unit.id ? 'bg-[var(--surface-container)]/40' : ''}`}>
                          {/* Unit row */}
                          <div
                            className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 cursor-pointer select-none hover:bg-[var(--surface-secondary)] transition-colors"
                            onClick={() => toggleUnit(unit.id, isExpanded)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="h-10 w-10 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[14px] font-bold num-tabular shrink-0">
                                {getUnitNumber(unit)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-[var(--text-primary)] text-[14px]">דירה {getUnitNumber(unit)}</span>
                                  {primary && <span className="text-[13px] text-[var(--text-secondary)] truncate">• {getResidentFullName(primary)}</span>}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {active.length === 0 ? (
                                    <Badge variant="neutral">ללא דיירים</Badge>
                                  ) : (
                                    <span className="text-[11px] text-[var(--text-muted)] num-tabular">
                                      {active.length} דיירים{tenants ? ` • ${tenants} שוכרים` : ''}
                                    </span>
                                  )}
                                  {active.length > 0 && !primary && <Badge variant="warning">אין דייר ראשי</Badge>}
                                  {leaving && <Badge variant="warning">עזיבה מתוכננת</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openCreateForUnit(unit) }}>
                                <Plus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">הוסף דייר</span>
                              </Button>
                              <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          {/* Resident rows */}
                          {isExpanded && (
                            <div className="px-3 sm:px-5 pb-3 pt-1 space-y-2 bg-[var(--bg)] border-t border-[var(--border-light)]">
                              {unitResidents.length === 0 ? (
                                <p className="text-[13px] text-[var(--text-muted)] text-center py-4">
                                  אין דיירים רשומים לדירה זו
                                </p>
                              ) : (
                                unitResidents.map((resident) => {
                                  const isTenant = resident.resident_type === 'tenant'
                                  const ownerInfoExpanded = !!expandedOwnerInfo[resident.id]
                                  const hasOwnerInfo = isTenant && (
                                    resident.owner_first_name || resident.owner_last_name ||
                                    resident.owner_phone || resident.owner_email
                                  )

                                  return (
                                    <div key={resident.id} className={`flex items-start gap-3 p-3 sm:p-4 mt-2 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border-light)] hover:border-[var(--border)] transition-colors group ${resident.archived ? 'opacity-70' : ''}`}>
                                      {/* Avatar */}
                                      <span className={`h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
                                        isTenant ? 'bg-[var(--surface-variant)] text-[var(--primary-dark)]' : 'bg-[var(--success-light)] text-[var(--success)]'
                                      }`}>
                                        {(resident.first_name?.[0] || '?').toUpperCase()}
                                      </span>

                                      {/* Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                          <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                                            {getResidentFullName(resident) || '—'}
                                          </span>
                                          <Badge variant={isTenant ? 'info' : 'success'}>{isTenant ? 'שוכר' : 'בעלים'}</Badge>
                                          {resident.is_primary && (
                                            <Badge variant="warning"><Star className="h-3 w-3" />ראשי</Badge>
                                          )}
                                          {resident.archived ? (
                                            <Badge variant="neutral">
                                              עזב/ה{resident.move_out_date ? ` ${formatDate(resident.move_out_date)}` : ''}
                                            </Badge>
                                          ) : resident.move_out_date ? (
                                            <Badge variant="warning">עוזב/ת ב-{formatDate(resident.move_out_date)}</Badge>
                                          ) : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-secondary)]">
                                          {resident.phone
                                            ? <a href={`tel:${resident.phone}`} className="flex items-center gap-1 num-tabular hover:text-[var(--primary)]" dir="ltr"><Phone className="h-3 w-3" />{resident.phone}</a>
                                            : !resident.archived && <span className="flex items-center gap-1 text-[var(--warning)]"><PhoneOff className="h-3 w-3" />אין טלפון</span>}
                                          {resident.email && <a href={`mailto:${resident.email}`} className="flex items-center gap-1 hover:text-[var(--primary)]"><Mail className="h-3 w-3" />{resident.email}</a>}
                                          {resident.move_in_date && <span className="num-tabular text-[var(--text-muted)]">כניסה: {formatDate(resident.move_in_date)}</span>}
                                        </div>

                                        {/* Owner info (for tenants) */}
                                        {hasOwnerInfo && (
                                          <div className="mt-2">
                                            <button
                                              type="button"
                                              className="flex items-center gap-1 text-[12px] font-semibold text-[var(--primary)] hover:underline"
                                              onClick={() => toggleOwnerInfo(resident.id)}
                                            >
                                              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${ownerInfoExpanded ? 'rotate-180' : ''}`} />
                                              פרטי בעלים
                                            </button>
                                            {ownerInfoExpanded && (
                                              <div className="mt-2 pr-3 border-r-2 border-[var(--border)] space-y-1 text-[13px] text-[var(--text-secondary)]">
                                                {(resident.owner_first_name || resident.owner_last_name) && (
                                                  <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                                    <span>
                                                      {[resident.owner_first_name, resident.owner_last_name].filter(Boolean).join(' ')}
                                                    </span>
                                                  </div>
                                                )}
                                                {resident.owner_phone && (
                                                  <div className="flex items-center gap-2">
                                                    <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                                    <span className="num-tabular" dir="ltr">{resident.owner_phone}</span>
                                                  </div>
                                                )}
                                                {resident.owner_email && (
                                                  <div className="flex items-center gap-2">
                                                    <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                                    <span>{resident.owner_email}</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                                        <button onClick={() => openEdit(resident)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
                                        {!resident.archived && (
                                          <button onClick={() => openMoveOut(resident)} title="עזב/ה את הדירה" className="p-1.5 rounded-[var(--radius)] text-[var(--warning)] hover:bg-[var(--warning-light)]"><LogOut className="h-3.5 w-3.5" /></button>
                                        )}
                                        <button onClick={() => setDeleteTarget(resident)} title="מחיקה (טעות הזנה)" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span className="num-tabular">מציג {rows.length} מתוך {units.length} דירות</span>
                    <span className="num-tabular">{activeResidents.length} דיירים פעילים</span>
                  </div>
                </div>
              )}
            </div>

            {/* Side panel */}
            <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-4">
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-4 space-y-4">
                <div>
                  <h2 className="text-[16px] font-bold text-[var(--text-primary)]">הרכב הדיירים</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">{selectedBuilding.name} • {units.length} דירות</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />בעלים <strong className="num-tabular">{ownersCount}</strong></span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />שוכרים <strong className="num-tabular">{tenantsCount}</strong></span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-container)] overflow-hidden flex">
                    <div className="h-full bg-[var(--success)]" style={{ width: `${activeResidents.length ? (ownersCount / activeResidents.length) * 100 : 0}%` }} />
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${activeResidents.length ? (tenantsCount / activeResidents.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border-light)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">ללא דיירים</span>
                    <span className="text-[18px] font-bold num-tabular text-[var(--text-primary)]">{vacantUnits.length}</span>
                  </div>
                  <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border-light)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">ללא דייר ראשי</span>
                    <span className="text-[18px] font-bold num-tabular text-[var(--text-primary)]">{noPrimaryUnits.length}</span>
                  </div>
                </div>
              </div>

              {leavingResidents.length > 0 && (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
                  <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
                    <span className="p-1.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-[var(--warning)]"><DoorOpen className="h-4 w-4" /></span>
                    <h3 className="text-[14px] font-bold text-[var(--text-primary)]">עזיבות מתוכננות</h3>
                  </div>
                  <div className="p-2">
                    {leavingResidents.slice(0, 6).map((r) => (
                      <button key={r.id} onClick={() => focusOn(r.unitId)} className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-right">
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-[var(--text-primary)] truncate">{getResidentFullName(r) || '—'}</span>
                          <span className="block text-[11px] text-[var(--text-muted)]">דירה {getUnitNumber(unitById[r.unitId] || {})}</span>
                        </span>
                        <Badge variant="warning" className="num-tabular">{formatDate(r.move_out_date)}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {noPrimaryUnits.length > 0 && (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
                  <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
                    <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]"><KeyRound className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-[14px] font-bold text-[var(--text-primary)]">דירות ללא דייר ראשי</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">מומלץ להגדיר דייר ראשי לכל דירה מאוכלסת</p>
                    </div>
                  </div>
                  <div className="p-3 flex flex-wrap gap-1.5">
                    {noPrimaryUnits.map((u) => (
                      <button key={u.id} onClick={() => focusOn(u.id)} className="px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-container)] text-[12px] font-semibold num-tabular">
                        דירה {getUnitNumber(u)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {/* Move-out dialog */}
      <Dialog open={!!moveOutTarget} onOpenChange={(o) => !o && setMoveOutTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עזיבת דירה — {moveOutTarget ? getResidentFullName(moveOutTarget) : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              בתאריך העזיבה הדייר/ת יועבר/ו לארכיון (ההיסטוריה נשמרת), החיבור שלו/ה לפורטל הדירה ינותק,
              ואם היה/ה דייר/ת ראשי/ת — דייר/ת אחר/ת בדירה יקודם/תקודם אוטומטית.
            </p>
            <FormField label="תאריך עזיבה" type="date" value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} />
            <p className="text-xs text-[var(--text-muted)]">תאריך עתידי — העזיבה תתבצע אוטומטית באותו יום.</p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setMoveOutTarget(null)}>ביטול</Button>
            <Button onClick={confirmMoveOut} disabled={!moveOutDate}>אישור עזיבה</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? getResidentFullName(deleteTarget) || 'דייר' : ''}
      />

      {/* Primary resident warning dialog */}
      <Dialog open={primaryWarnOpen} onOpenChange={setPrimaryWarnOpen}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>החלפת דייר ראשי</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            כבר קיים דייר ראשי לדירה זו. האם לשנות אותו לדייר רגיל ולהגדיר את הדייר הנוכחי כדייר ראשי?
          </p>
          <div className="flex gap-3">
            <Button onClick={confirmPrimaryOverride}>אשר</Button>
            <Button variant="outline" onClick={() => setPrimaryWarnOpen(false)}>ביטול</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת דייר' : 'דייר חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="שם פרטי"
                value={form.first_name}
                onChange={setField('first_name')}
                required
              />
              <FormField
                label="שם משפחה"
                value={form.last_name}
                onChange={setField('last_name')}
                required
              />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="אימייל"
                type="email"
                value={form.email}
                onChange={setField('email')}
              />
              <FormField
                label="טלפון"
                value={form.phone}
                onChange={setField('phone')}
              />
            </div>

            {/* Type + Primary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="סוג דייר"
                value={form.resident_type}
                onChange={setField('resident_type')}
                options={RESIDENT_TYPE_OPTIONS}
              />
              <FormBool
                label="דייר ראשי"
                value={form.is_primary}
                onChange={setField('is_primary')}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="תאריך כניסה"
                type="date"
                value={form.move_in_date}
                onChange={setField('move_in_date')}
              />
              <FormField
                label="תאריך יציאה"
                type="date"
                value={form.move_out_date}
                onChange={setField('move_out_date')}
              />
            </div>

            {/* Owner info — only for tenants */}
            {form.resident_type === 'tenant' && (
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">פרטי בעלים</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="שם פרטי בעלים"
                    value={form.owner_first_name}
                    onChange={setField('owner_first_name')}
                  />
                  <FormField
                    label="שם משפחה בעלים"
                    value={form.owner_last_name}
                    onChange={setField('owner_last_name')}
                  />
                  <FormField
                    label="טלפון בעלים"
                    value={form.owner_phone}
                    onChange={setField('owner_phone')}
                  />
                  <FormField
                    label="אימייל בעלים"
                    type="email"
                    value={form.owner_email}
                    onChange={setField('owner_email')}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit">{editingId ? 'שמור שינויים' : 'הוסף דייר'}</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Residents
