import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { Plus, Star, User, Phone, Mail, Home, ChevronDown, ChevronUp, Pencil, Trash2, Users } from 'lucide-react'

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
  const { data: allUnits } = useCollection('units')
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

  const doSubmit = (data) => {
    if (editingId) {
      update(editingId, data)
    } else {
      create(data)
    }
    setFormOpen(false)
    setPendingSubmitData(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...form }

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

    doSubmit(data)
  }

  const confirmPrimaryOverride = () => {
    if (!pendingSubmitData) return
    const data = pendingSubmitData
    // Demote the existing primary resident
    const unitResidents = residentsByUnit[data.unitId] || []
    const existingPrimary = unitResidents.find(
      (r) => r.is_primary && r.id !== editingId
    )
    if (existingPrimary) {
      update(existingPrimary.id, { ...existingPrimary, is_primary: false })
    }
    doSubmit(data)
    setPrimaryWarnOpen(false)
  }

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const getUnitNumber = (u) => u.unit_number || u.number || ''
  const getResidentFullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">דיירים</h1>
          <p className="text-sm text-[var(--text-secondary)]">{allResidents.length} דיירים</p>
        </div>
      </div>

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
                  className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
                  onClick={() => toggleUnit(unit.id)}
                >
                  <div className="flex items-center gap-3">
                    <Home className="h-4 w-4 text-[var(--text-muted)]" />
                    <span className="font-semibold text-[var(--text-primary)]">
                      דירה {getUnitNumber(unit)}
                    </span>
                    <Badge variant="default" className="text-xs">
                      {unitResidents.length} דיירים
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        openCreateForUnit(unit)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      הוסף דייר
                    </Button>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                      : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    }
                  </div>
                </div>

                {/* Resident cards */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-3 border-t border-[var(--border)] pt-4">
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
                          <Card key={resident.id} className="bg-[var(--surface-hover)]">
                            <CardContent className="pt-4">
                              {/* Resident header */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <User className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                                  <span className="font-semibold text-[var(--text-primary)]">
                                    {getResidentFullName(resident) || '—'}
                                  </span>
                                  <Badge variant={isTenant ? 'info' : 'success'}>
                                    {isTenant ? 'שוכר' : 'בעלים'}
                                  </Badge>
                                  {resident.is_primary && (
                                    <Badge variant="warning" className="flex items-center gap-1">
                                      <Star className="h-3 w-3" />
                                      דייר ראשי
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openEdit(resident)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(resident)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                                  </Button>
                                </div>
                              </div>

                              {/* Contact info */}
                              <div className="space-y-1 text-sm text-[var(--text-secondary)] mt-2">
                                {resident.email && (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                    <span>{resident.email}</span>
                                  </div>
                                )}
                                {resident.phone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                    <span>{resident.phone}</span>
                                  </div>
                                )}
                                {resident.move_in_date && (
                                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                    <span>כניסה: {formatDate(resident.move_in_date)}</span>
                                    {resident.move_out_date && (
                                      <span>• יציאה: {formatDate(resident.move_out_date)}</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Owner info (for tenants) */}
                              {hasOwnerInfo && (
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                                    onClick={() => toggleOwnerInfo(resident.id)}
                                  >
                                    {ownerInfoExpanded
                                      ? <ChevronUp className="h-3 w-3" />
                                      : <ChevronDown className="h-3 w-3" />
                                    }
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
                            </CardContent>
                          </Card>
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
        <DialogContent className="max-w-sm">
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
