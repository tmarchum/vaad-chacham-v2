import { useState, useMemo, useRef } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { formatCurrency, calcUnitFee, cn } from '@/lib/utils'
import { Home, Plus, Pencil, Trash2, Phone, Star, X, Users } from 'lucide-react'

// ─── ListField: Add-item pattern ──────────────────────────────────────────────
function ListField({ label, items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState('')
  const add = () => {
    const v = val.trim()
    if (!v) return
    onAdd(v)
    setVal('')
  }
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md px-2 py-0.5 text-sm text-[var(--text-primary)]"
            >
              {item}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-[var(--text-muted)] hover:text-red-500 leading-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder || 'הקלד ולחץ הוסף...'}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>הוסף</Button>
      </div>
    </div>
  )
}

// ─── PersonRow: single resident or owner row ──────────────────────────────────
function PersonRow({ person, isPrimary, showPrimary, onSetPrimary, onChange, onRemove, isOwnerSection }) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-3 space-y-2 bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between">
        <div>
          {showPrimary && !isOwnerSection && (
            <button
              type="button"
              onClick={onSetPrimary}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border transition-colors',
                isPrimary
                  ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-yellow-600 hover:border-yellow-300'
              )}
            >
              <Star className={cn('h-3.5 w-3.5', isPrimary ? 'fill-yellow-400 text-yellow-400' : '')} />
              {isPrimary ? 'דייר ראשי' : 'הגדר ראשי'}
            </button>
          )}
          {isOwnerSection && (
            <span className="text-xs text-[var(--text-muted)] italic">
              בעלים — אינו דייר ראשי
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-red-500"
          title="הסר"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="שם פרטי"
          value={person.first_name}
          onChange={e => onChange('first_name', e.target.value)}
        />
        <Input
          placeholder="שם משפחה"
          value={person.last_name}
          onChange={e => onChange('last_name', e.target.value)}
        />
        <Input
          placeholder="טלפון"
          value={person.phone}
          onChange={e => onChange('phone', e.target.value)}
        />
        <Input
          placeholder="אימייל"
          type="email"
          value={person.email}
          onChange={e => onChange('email', e.target.value)}
        />
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const newPerson = () => ({
  _key: Math.random().toString(36).slice(2),
  id: null,
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  is_primary: false,
})

const EMPTY_FORM = {
  buildingId: '',
  number: '',
  floor: '',
  rooms: '',
  area: '',
  monthlyFee: '',      // empty = inherit from building
  tier_label: '',      // custom tier label (e.g. "דופלקס")
  board_member: false,
  unit_type: 'owned',
  parking_spots: [],
  storage_numbers: [],
  key_numbers: [],
  parking_gate_phones: [],
  notes: '',
  residents: [],
  owners: [],
}

function getUnitType(unit) {
  return unit.custom_fields?.unit_type || unit.customFields?.unit_type || 'owned'
}

function getPrimaryResident(residents) {
  return residents?.find(r => r.is_primary || r.isPrimary) || residents?.[0] || null
}

function fullName(p) {
  return [p?.first_name || p?.firstName, p?.last_name || p?.lastName].filter(Boolean).join(' ')
}

// ─── Main Component ───────────────────────────────────────────────────────────
function Units() {
  const { buildings } = useBuildingContext()
  const { data: allUnits, create, update, remove } = useCollection('units')
  const {
    data: allResidents,
    create: createResident,
    update: updateResident,
    remove: removeResident,
  } = useCollection('unitResidents')

  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [detailUnit, setDetailUnit] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // IDs of residents existing in DB before edit (to detect deletions)
  const originalPersonIds = useRef([])

  // Map buildingId → building object
  const buildingMap = useMemo(() => {
    const m = {}
    buildings.forEach(b => { m[b.id] = b })
    return m
  }, [buildings])

  const buildingOptions = useMemo(
    () => buildings.map(b => ({ value: b.id, label: b.name })),
    [buildings]
  )

  // Map unitId → residents array (from DB)
  const residentsByUnit = useMemo(() => {
    const m = {}
    allResidents.forEach(r => {
      const uid = r.unit_id || r.unitId
      if (!uid) return
      if (!m[uid]) m[uid] = []
      m[uid].push(r)
    })
    return m
  }, [allResidents])

  // Effective monthly fee — uses building fee tiers / flat rate
  const getDisplayFee = unit => {
    const building = buildingMap[unit.buildingId || unit.building_id]
    return calcUnitFee(unit, building)
  }

  // Filtered & sorted units
  const filtered = useMemo(() => {
    let result = allUnits

    if (buildingFilter !== 'all') {
      result = result.filter(u => (u.buildingId || u.building_id) === buildingFilter)
    }
    if (typeFilter === 'owned') {
      result = result.filter(u => getUnitType(u) === 'owned')
    } else if (typeFilter === 'rented') {
      result = result.filter(u => getUnitType(u) === 'rented')
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(u => {
        const unitResidents = residentsByUnit[u.id] || []
        const names = unitResidents.map(r => fullName(r)).join(' ').toLowerCase()
        return (
          (u.number || u.unit_number || '').toLowerCase().includes(q) ||
          names.includes(q)
        )
      })
    }

    return [...result].sort((a, b) => {
      const na = parseInt(a.number || a.unit_number || '0', 10)
      const nb = parseInt(b.number || b.unit_number || '0', 10)
      return na - nb
    })
  }, [allUnits, buildingFilter, typeFilter, search, residentsByUnit])

  // ── Open form ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    originalPersonIds.current = []
    const defaultBuilding = buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || '')
    const p = newPerson()
    p.is_primary = true
    setForm({
      ...EMPTY_FORM,
      buildingId: defaultBuilding,
      residents: [p],
    })
    setFormOpen(true)
  }

  const openEdit = unit => {
    setEditingId(unit.id)
    const unitResidents = residentsByUnit[unit.id] || []
    originalPersonIds.current = unitResidents.map(r => r.id)
    const unitType = getUnitType(unit)

    // Split into residents (tenants/owners depending on type) and owners
    let residents, owners
    if (unitType === 'rented') {
      residents = unitResidents
        .filter(r => (r.resident_type || r.residentType) === 'tenant')
        .map(r => ({
          _key: r.id,
          id: r.id,
          first_name: r.first_name || r.firstName || '',
          last_name: r.last_name || r.lastName || '',
          phone: r.phone || '',
          email: r.email || '',
          is_primary: r.is_primary || r.isPrimary || false,
        }))
      owners = unitResidents
        .filter(r => (r.resident_type || r.residentType) === 'owner')
        .map(r => ({
          _key: r.id,
          id: r.id,
          first_name: r.first_name || r.firstName || '',
          last_name: r.last_name || r.lastName || '',
          phone: r.phone || '',
          email: r.email || '',
          is_primary: false,
        }))
    } else {
      residents = unitResidents.map(r => ({
        _key: r.id,
        id: r.id,
        first_name: r.first_name || r.firstName || '',
        last_name: r.last_name || r.lastName || '',
        phone: r.phone || '',
        email: r.email || '',
        is_primary: r.is_primary || r.isPrimary || false,
      }))
      owners = []
    }

    // If no residents, start with one empty
    if (residents.length === 0) {
      const p = newPerson(); p.is_primary = true
      residents = [p]
    }

    const cf = unit.custom_fields || unit.customFields || {}
    setForm({
      buildingId: unit.buildingId || unit.building_id || '',
      number: unit.number || unit.unit_number || '',
      floor: unit.floor ?? '',
      rooms: unit.rooms ?? '',
      area: unit.area ?? '',
      monthlyFee: (unit.monthlyFee ?? unit.monthly_fee) > 0 ? (unit.monthlyFee ?? unit.monthly_fee) : '',
      tier_label: cf.tier_label || '',
      board_member: !!unit.board_member,
      unit_type: unitType,
      parking_spots: Array.isArray(unit.parkingSpots || unit.parking_spots)
        ? (unit.parkingSpots || unit.parking_spots)
        : [],
      storage_numbers: Array.isArray(cf.storage_numbers)
        ? cf.storage_numbers
        : (unit.storage_number ? [unit.storage_number] : []),
      key_numbers: Array.isArray(unit.keyNumbers || unit.key_numbers)
        ? (unit.keyNumbers || unit.key_numbers)
        : [],
      parking_gate_phones: Array.isArray(cf.parking_gate_phones)
        ? cf.parking_gate_phones
        : (unit.parking_gate_phone || unit.parkingGatePhone
          ? [unit.parking_gate_phone || unit.parkingGatePhone]
          : []),
      notes: unit.notes || '',
      residents,
      owners,
    })
    setFormOpen(true)
    setDetailUnit(null)
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  const setField = field => val => setForm(prev => ({ ...prev, [field]: val }))
  const setFieldEv = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  // List field helpers
  const addToList = field => val =>
    setForm(prev => ({ ...prev, [field]: [...prev[field], val] }))
  const removeFromList = field => idx =>
    setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }))

  // Resident helpers
  const updateResident_ = (section, idx, key, val) =>
    setForm(prev => {
      const list = [...prev[section]]
      list[idx] = { ...list[idx], [key]: val }
      return { ...prev, [section]: list }
    })
  const addPerson = section => () =>
    setForm(prev => ({ ...prev, [section]: [...prev[section], newPerson()] }))
  const removePerson = (section, idx) =>
    setForm(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== idx) }))
  const setPrimary = idx =>
    setForm(prev => ({
      ...prev,
      residents: prev.residents.map((r, i) => ({ ...r, is_primary: i === idx })),
    }))

  // Unit type toggle — when switching, migrate/reset residents
  const handleTypeChange = newType => {
    setForm(prev => {
      if (newType === prev.unit_type) return prev
      if (newType === 'rented') {
        // Move residents to tenants, clear owners
        return { ...prev, unit_type: 'rented', owners: [] }
      } else {
        // Merge tenants + owners → residents (owners section removed)
        return { ...prev, unit_type: 'owned', owners: [] }
      }
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const unitData = {
        buildingId: form.buildingId,
        number: form.number,
        floor: form.floor !== '' ? Number(form.floor) : null,
        rooms: form.rooms !== '' ? Number(form.rooms) : null,
        area: form.area !== '' ? Number(form.area) : null,
        // 0 or empty = inherit from building tiers; only save if positive override
        monthlyFee: form.monthlyFee !== '' && Number(form.monthlyFee) > 0 ? Number(form.monthlyFee) : 0,
        board_member: form.board_member,
        parking_spots: form.parking_spots,
        storage_number: form.storage_numbers[0] || '',
        key_numbers: form.key_numbers,
        parking_gate_phone: form.parking_gate_phones[0] || '',
        custom_fields: {
          unit_type: form.unit_type,
          storage_numbers: form.storage_numbers,
          parking_gate_phones: form.parking_gate_phones,
          tier_label: form.tier_label || '',
        },
        notes: form.notes,
      }

      let unitId = editingId
      if (editingId) {
        await update(editingId, unitData)
      } else {
        const created = await create(unitData)
        unitId = created?.id
      }
      if (!unitId) return

      // Collect all persons to save
      const residentType = form.unit_type === 'rented' ? 'tenant' : 'owner'
      const toSave = [
        ...form.residents.map(r => ({ ...r, resident_type: residentType })),
        ...form.owners.map(r => ({ ...r, resident_type: 'owner', is_primary: false })),
      ]

      // Delete persons removed from form
      const savedIds = toSave.filter(p => p.id).map(p => p.id)
      await Promise.all(
        originalPersonIds.current
          .filter(id => !savedIds.includes(id))
          .map(id => removeResident(id))
      )

      // Upsert persons
      for (const person of toSave) {
        const data = {
          unit_id: unitId,
          first_name: person.first_name,
          last_name: person.last_name,
          phone: person.phone,
          email: person.email,
          is_primary: person.is_primary || false,
          resident_type: person.resident_type,
        }
        if (person.id) {
          await updateResident(person.id, data)
        } else {
          await createResident(data)
        }
      }

      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    // Delete unit residents first
    const unitPersons = residentsByUnit[deleteTarget.id] || []
    await Promise.all(unitPersons.map(r => removeResident(r.id)))
    await remove(deleteTarget.id)
    setDeleteTarget(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">דירות</h1>
          <p className="text-sm text-[var(--text-secondary)]">{allUnits.length} דירות</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          דירה חדשה
        </Button>
      </div>

      {/* Building filter */}
      <div className="flex flex-wrap gap-2">
        {[{ id: 'all', name: 'כל הבניינים' }, ...buildings].map(b => (
          <Button
            key={b.id}
            variant={buildingFilter === b.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBuildingFilter(b.id)}
          >
            {b.name}
          </Button>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'הכל' },
          { key: 'owned', label: 'בעלים' },
          { key: 'rented', label: 'שוכרים' },
        ].map(f => (
          <Button
            key={f.key}
            variant={typeFilter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי שם דייר או מספר דירה..."
      />

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Home}
          title="אין דירות"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'הוסף דירה ראשונה כדי להתחיל'}
          actionLabel={!search ? 'הוסף דירה' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(u => {
            const unitResidents = residentsByUnit[u.id] || []
            const primary = getPrimaryResident(unitResidents)
            const unitType = getUnitType(u)
            const tenants = unitType === 'rented'
              ? unitResidents.filter(r => (r.resident_type || r.residentType) === 'tenant')
              : unitResidents
            const owners = unitType === 'rented'
              ? unitResidents.filter(r => (r.resident_type || r.residentType) === 'owner')
              : []
            return (
              <Card key={u.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailUnit(u)}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                          דירה {u.number || u.unit_number}
                        </h3>
                        <Badge variant={unitType === 'rented' ? 'info' : 'default'}>
                          {unitType === 'rented' ? 'שכירות' : 'בעלים'}
                        </Badge>
                        {u.board_member && <Badge variant="success">חבר ועד</Badge>}
                      </div>
                      {primary && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <p className="text-sm text-[var(--text-secondary)]">{fullName(primary)}</p>
                        </div>
                      )}
                      {tenants.length > 1 && (
                        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />
                          {tenants.length} דיירים
                        </p>
                      )}
                    </div>
                    <Home className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] mt-2">
                    {u.floor != null && <span>קומה {u.floor}</span>}
                    {u.rooms != null && <span>{u.rooms} חד׳</span>}
                    {(u.area) && <span>{u.area} מ"ר</span>}
                    {Array.isArray(u.parkingSpots || u.parking_spots) && (u.parkingSpots || u.parking_spots).length > 0 && (
                      <span>חניות: {(u.parkingSpots || u.parking_spots).join(', ')}</span>
                    )}
                    {(u.storage_number || u.storageNumber) && (
                      <span>מחסן: {u.storage_number || u.storageNumber}</span>
                    )}
                    {owners.length > 0 && (
                      <span className="text-[var(--text-muted)]">
                        בעלים: {owners.map(fullName).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--primary)]">
                      {formatCurrency(getDisplayFee(u))}
                    </span>
                  </div>
                  {buildingMap[u.buildingId || u.building_id] && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {buildingMap[u.buildingId || u.building_id].name}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {detailUnit && (() => {
        const unitResidents = residentsByUnit[detailUnit.id] || []
        const unitType = getUnitType(detailUnit)
        const tenants = unitType === 'rented'
          ? unitResidents.filter(r => (r.resident_type || r.residentType) === 'tenant')
          : unitResidents
        const owners = unitType === 'rented'
          ? unitResidents.filter(r => (r.resident_type || r.residentType) === 'owner')
          : []
        const cf = detailUnit.custom_fields || detailUnit.customFields || {}
        const storageNums = cf.storage_numbers?.length
          ? cf.storage_numbers
          : (detailUnit.storage_number ? [detailUnit.storage_number] : [])
        const pgPhones = cf.parking_gate_phones?.length
          ? cf.parking_gate_phones
          : (detailUnit.parking_gate_phone ? [detailUnit.parking_gate_phone] : [])

        return (
          <DetailModal
            open
            onOpenChange={() => setDetailUnit(null)}
            title={`דירה ${detailUnit.number || detailUnit.unit_number}`}
            onEdit={() => openEdit(detailUnit)}
          >
            <DetailRow label="בניין" value={buildingMap[detailUnit.buildingId || detailUnit.building_id]?.name} />
            <DetailRow label="מספר דירה" value={detailUnit.number || detailUnit.unit_number} />
            <DetailRow label="קומה" value={detailUnit.floor} />
            <DetailRow label="חדרים" value={detailUnit.rooms} />
            <DetailRow label="שטח (מ״ר)" value={detailUnit.area} />
            <DetailRow label="סוג" value={unitType === 'rented' ? 'שכירות' : 'בבעלות'} />
            <DetailRow label="ועד חודשי" value={formatCurrency(getDisplayFee(detailUnit))} />
            <DetailRow label="חבר ועד" value={detailUnit.board_member ? 'כן' : 'לא'} />

            {/* Residents */}
            {tenants.length > 0 && (
              <div className="pt-3 pb-1">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  {unitType === 'rented' ? 'שוכרים' : 'בעלים / דיירים'}
                </p>
                {tenants.map(r => (
                  <div key={r.id} className="mb-2 p-2 rounded bg-[var(--bg-secondary)] text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fullName(r)}</span>
                      {(r.is_primary || r.isPrimary) && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600">
                          <Star className="h-3 w-3 fill-yellow-400" /> ראשי
                        </span>
                      )}
                    </div>
                    {r.phone && <div className="text-[var(--text-secondary)] flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</div>}
                    {r.email && <div className="text-[var(--text-secondary)]">{r.email}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Owners (rental only) */}
            {owners.length > 0 && (
              <div className="pt-1 pb-1">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">בעלים</p>
                {owners.map(r => (
                  <div key={r.id} className="mb-2 p-2 rounded bg-[var(--bg-secondary)] text-sm">
                    <div className="font-medium">{fullName(r)}</div>
                    {r.phone && <div className="text-[var(--text-secondary)] flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</div>}
                    {r.email && <div className="text-[var(--text-secondary)]">{r.email}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Property details */}
            <DetailRow
              label="חניות"
              value={
                Array.isArray(detailUnit.parkingSpots || detailUnit.parking_spots) &&
                (detailUnit.parkingSpots || detailUnit.parking_spots).length > 0
                  ? (detailUnit.parkingSpots || detailUnit.parking_spots).join(', ')
                  : undefined
              }
            />
            <DetailRow label="מחסנים" value={storageNums.length ? storageNums.join(', ') : undefined} />
            <DetailRow
              label="מפתחות / טאגים"
              value={
                Array.isArray(detailUnit.keyNumbers || detailUnit.key_numbers) &&
                (detailUnit.keyNumbers || detailUnit.key_numbers).length > 0
                  ? (detailUnit.keyNumbers || detailUnit.key_numbers).join(', ')
                  : undefined
              }
            />
            <DetailRow label="טלפון לחניה" value={pgPhones.length ? pgPhones.join(', ') : undefined} />
            <DetailRow label="הערות" value={detailUnit.notes} />

            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailUnit)}>
                <Pencil className="h-3.5 w-3.5" /> עריכה
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setDetailUnit(null); setDeleteTarget(detailUnit) }}
              >
                <Trash2 className="h-3.5 w-3.5" /> מחיקה
              </Button>
            </div>
          </DetailModal>
        )
      })()}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? `דירה ${deleteTarget.number || deleteTarget.unit_number}` : ''}
      />

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת דירה' : 'דירה חדשה'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Basic info ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="בניין"
                value={form.buildingId}
                onChange={e => setForm(p => ({ ...p, buildingId: e.target.value }))}
                options={buildingOptions}
                placeholder="בחר בניין"
                required
              />
              <FormField
                label="מספר דירה"
                value={form.number}
                onChange={setFieldEv('number')}
                required
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField label="קומה" type="number" value={form.floor} onChange={setFieldEv('floor')} />
              <FormField label="חדרים" type="number" step="0.5" value={form.rooms} onChange={setFieldEv('rooms')} />
              <FormField label='שטח מ"ר' type="number" value={form.area} onChange={setFieldEv('area')} />
              <FormField
                label="ועד חודשי ₪ (עקיפה)"
                type="number"
                value={form.monthlyFee}
                onChange={setFieldEv('monthlyFee')}
                placeholder={(() => {
                  const b = buildingMap[form.buildingId]
                  if (!b) return 'ריק = מהבניין'
                  const preview = calcUnitFee(
                    { rooms: Number(form.rooms) || 0, area: Number(form.area) || 0, monthly_fee: 0, board_member: form.board_member, custom_fields: { tier_label: form.tier_label } },
                    b
                  )
                  return preview ? `מהבניין: ₪${preview}` : 'ריק = מהבניין'
                })()}
              />
            </div>

            {/* ── Tier label (shown when building uses tiers with labels) ── */}
            {(() => {
              const b = buildingMap[form.buildingId]
              const labeledTiers = (b?.fee_tiers || []).filter(t => t.label)
              if (!labeledTiers.length) return null
              return (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    סוג יחידה / תעריף מיוחד
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-2">
                    בחר אם הדירה שייכת לתעריף מיוחד (דופלקס, פנטהאוז וכו')
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, tier_label: '' }))}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-sm transition-colors',
                        !form.tier_label
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)]'
                      )}
                    >
                      רגיל (לפי {b.fee_mode === 'by_rooms' ? 'חדרים' : 'מ"ר'})
                    </button>
                    {labeledTiers.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, tier_label: t.label }))}
                        className={cn(
                          'px-3 py-1.5 rounded-md border text-sm transition-colors',
                          form.tier_label === t.label
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)]'
                        )}
                      >
                        {t.label}
                        {t.fee ? ` — ₪${t.fee}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* ── Unit type toggle ───────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                סוג הדירה
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'owned', label: 'בבעלות (לא מושכר)' },
                  { value: 'rented', label: 'שכירות' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTypeChange(opt.value)}
                    className={cn(
                      'px-4 py-1.5 rounded-md border text-sm font-medium transition-colors',
                      form.unit_type === opt.value
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Residents ─────────────────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {form.unit_type === 'rented' ? 'שוכרים' : 'בעלים / דיירים'}
              </h4>
              <div className="space-y-3">
                {form.residents.map((person, idx) => (
                  <PersonRow
                    key={person._key || idx}
                    person={person}
                    isPrimary={person.is_primary}
                    showPrimary
                    onSetPrimary={() => setPrimary(idx)}
                    onChange={(key, val) => updateResident_('residents', idx, key, val)}
                    onRemove={() => removePerson('residents', idx)}
                    isOwnerSection={false}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={addPerson('residents')}
              >
                <Plus className="h-3.5 w-3.5" />
                הוסף {form.unit_type === 'rented' ? 'שוכר' : 'דייר'}
              </Button>
              {form.residents.length > 0 && !form.residents.some(r => r.is_primary) && (
                <p className="text-xs text-amber-600 mt-2">⚠ לא נבחר דייר ראשי — ייקבע אוטומטית הראשון</p>
              )}
            </div>

            {/* ── Owners section (rental only) ───────────────────────────── */}
            {form.unit_type === 'rented' && (
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">בעלים</h4>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  הבעלים אינם נחשבים דיירים ראשיים ולא יקבלו הודעות שוטפות
                </p>
                <div className="space-y-3">
                  {form.owners.map((person, idx) => (
                    <PersonRow
                      key={person._key || idx}
                      person={person}
                      isPrimary={false}
                      showPrimary={false}
                      onChange={(key, val) => updateResident_('owners', idx, key, val)}
                      onRemove={() => removePerson('owners', idx)}
                      isOwnerSection
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={addPerson('owners')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  הוסף בעלים
                </Button>
              </div>
            )}

            {/* ── Property details ───────────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">פרטי נכס</h4>
              <div className="space-y-4">
                <ListField
                  label="מספרי חניה"
                  items={form.parking_spots}
                  onAdd={addToList('parking_spots')}
                  onRemove={removeFromList('parking_spots')}
                  placeholder="למשל: 12"
                />
                <ListField
                  label="מספרי מחסן"
                  items={form.storage_numbers}
                  onAdd={addToList('storage_numbers')}
                  onRemove={removeFromList('storage_numbers')}
                  placeholder="למשל: B4"
                />
                <ListField
                  label="מפתחות / טאגים"
                  items={form.key_numbers}
                  onAdd={addToList('key_numbers')}
                  onRemove={removeFromList('key_numbers')}
                  placeholder="למשל: A1"
                />
                <ListField
                  label="טלפון לפתיחת שער חניה"
                  items={form.parking_gate_phones}
                  onAdd={addToList('parking_gate_phones')}
                  onRemove={removeFromList('parking_gate_phones')}
                  placeholder="למשל: *3456"
                />
              </div>
            </div>

            {/* ── Board member ───────────────────────────────────────────── */}
            <FormBool
              label="חבר ועד"
              value={form.board_member}
              onChange={e => setForm(p => ({ ...p, board_member: e.target.value }))}
            />

            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setFieldEv('notes')}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'שומר...' : editingId ? 'שמור שינויים' : 'צור דירה'}
              </Button>
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

export default Units
