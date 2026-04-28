import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { Plus, Star, User, Phone, Mail, Home, ChevronDown, Pencil, Trash2, Users } from 'lucide-react'

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
  const { selectedBuilding, buildings, setSelectedBuilding } = useBuildingContext()
  const { data: allUnits, isLoading } = useCollection('units')
  const { data: allResidents, create, update, remove } = useCollection('unitResidents')

  const [expandedUnits, setExpandedUnits] = useState({})
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [expandedOwnerInfo, setExpandedOwnerInfo] = useState({})
  const [primaryWarnOpen, setPrimaryWarnOpen] = useState(false)
  const [pendingSubmitData, setPendingSubmitData] = useState(null)

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

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
      if (r.archived) return // skip archived residents
      if (!map[r.unitId]) map[r.unitId] = []
      map[r.unitId].push(r)
    })
    return map
  }, [allResidents])

  const toggleUnit = (unitId) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }))
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירת דייר', type: 'error' } }))
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בעדכון דייר ראשי', type: 'error' } }))
    }
    setPrimaryWarnOpen(false)
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await remove(deleteTarget.id)
      } catch (err) {
        console.error('Failed to delete resident:', err)
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה במחיקת דייר', type: 'error' } }))
      }
      setDeleteTarget(null)
    }
  }

  const getUnitNumber = (u) => u.unit_number || u.number || ''
  const getResidentFullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ')

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Users} iconColor="cyan" title="דיירים" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader icon={Users} iconColor="cyan" title="דיירים" subtitle={`${allResidents.length} דיירים`} />

      {/* Building selector */}
      {buildings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {buildings.map((b) => (
            <Button
              key={b.id}
              variant={selectedBuilding?.id === b.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedBuilding(b.id)}
            >
              {b.name}
            </Button>
          ))}
        </div>
      )}

      {/* Units list */}
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
        <div className="space-y-3">
          {units.map((unit) => {
            const unitResidents = residentsByUnit[unit.id] || []
            const isExpanded = !!expandedUnits[unit.id]

            return (
              <Card key={unit.id}>
                {/* Unit header row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-[var(--surface-secondary)] transition-colors rounded-t-xl"
                  onClick={() => toggleUnit(unit.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
                      {getUnitNumber(unit)}
                    </div>
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] text-[14px]">
                        דירה {getUnitNumber(unit)}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[12px] text-[var(--text-muted)]">
                          {unitResidents.length} דיירים
                        </span>
                        {unitResidents.some(r => r.is_primary) && (
                          <span className="text-[11px] text-emerald-600 font-medium">
                            • {getResidentFullName(unitResidents.find(r => r.is_primary))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openCreateForUnit(unit) }}>
                      <Plus className="h-3.5 w-3.5" />
                      הוסף דייר
                    </Button>
                    <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Resident cards */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-[var(--border-light)] pt-3 bg-[var(--surface-secondary)]/50">
                    {unitResidents.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)] text-center py-4">
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
                          <div key={resident.id} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[var(--border-light)] hover:border-[var(--border)] hover:shadow-sm transition-all group">
                            {/* Avatar */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm ${
                              isTenant ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                            }`}>
                              {(resident.first_name?.[0] || '?').toUpperCase()}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                                  {getResidentFullName(resident) || '—'}
                                </span>
                                <Badge variant={isTenant ? 'info' : 'success'}>{isTenant ? 'שוכר' : 'בעלים'}</Badge>
                                {resident.is_primary && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md ring-1 ring-inset ring-amber-600/10">
                                    <Star className="h-3 w-3" />
                                    ראשי
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
                                {resident.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{resident.phone}</span>}
                                {resident.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{resident.email}</span>}
                                {resident.move_in_date && <span>כניסה: {formatDate(resident.move_in_date)}</span>}
                              </div>

                              {/* Owner info (for tenants) */}
                              {hasOwnerInfo && (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                                    onClick={() => toggleOwnerInfo(resident.id)}
                                  >
                                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${ownerInfoExpanded ? 'rotate-180' : ''}`} />
                                    פרטי בעלים
                                  </button>
                                  {ownerInfoExpanded && (
                                    <div className="mt-2 pr-4 border-r-2 border-[var(--border)] space-y-1 text-sm text-[var(--text-secondary)]">
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
                                          <span>{resident.owner_phone}</span>
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
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(resident)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(resident)}><Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" /></Button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

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
