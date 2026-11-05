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
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, calcUnitFee, cn, sanitizePhone, isValidPhone } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { FilterPills } from '@/components/common/FilterPills'
import { Home, Plus, Pencil, Trash2, Phone, Star, X, Users, Archive, History, CalendarDays, CheckCircle2, RotateCcw, Building2, KeyRound, ShieldCheck, Download, MessageCircle, Car, Lock, Maximize2 } from 'lucide-react'
import { StatCard } from '@/components/common/StatCard'
import { TabGroup } from '@/components/ui/tabs'
import { waLink, telHref } from '@/lib/phone'
import { toast, toastError } from '@/lib/toast'

// ─── ListField: Add-item pattern ──────────────────────────────────────────────
function ListField({ label, items, onAdd, onRemove, placeholder, max, phone, allowExceed }) {
  const [val, setVal] = useState('')
  const atMax = !!max && items.length >= max
  const blocked = atMax && !allowExceed   // admins (allowExceed) may go past the limit
  const valid = phone ? isValidPhone(val) : !!val.trim()
  const add = () => {
    if (blocked || !valid) return
    onAdd(phone ? val : val.trim())
    setVal('')
  }
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}{phone ? ' (10 ספרות)' : (max ? ` (עד ${max})` : '')}
        </label>
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
      {blocked ? (
        <p className="text-xs text-[var(--text-muted)]">הגעת למקסימום שהוגדר לבניין ({max})</p>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              value={val}
              onChange={e => setVal(phone ? sanitizePhone(e.target.value) : e.target.value)}
              inputMode={phone ? 'numeric' : undefined}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder={phone ? '0501234567' : (placeholder || 'הקלד ולחץ הוסף...')}
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={add} disabled={!valid}>הוסף</Button>
          </div>
          {atMax && allowExceed && (
            <p className="text-xs text-amber-600">מעבר למגבלת הדיירים ({max}) — הוספה מותרת למנהל בלבד</p>
          )}
        </>
      )}
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
          placeholder="טלפון (10 ספרות)"
          inputMode="numeric"
          value={person.phone}
          onChange={e => onChange('phone', sanitizePhone(e.target.value))}
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
  parking_lot: '',
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

// How a flat is identified across the app: family name only, never a first
// name. fullName stays for the household roster and the edit forms, where the
// individual people are actually managed.
function familyName(p) {
  return (p?.last_name || p?.lastName || '').trim()
}

// ─── Main Component ───────────────────────────────────────────────────────────
function Units() {
  const { buildings, selectedBuilding } = useBuildingContext()
  const { isCommittee } = useAuth()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allUnits, create, update, remove, isLoading } = useCollection('units', scope)
  const {
    data: allResidents,
    create: createResident,
    update: updateResident,
    remove: removeResident,
  } = useCollection('unitResidents')

  const [search, setSearch] = useState('')
  // Data is already scoped to the sidebar's building.
  const buildingFilter = 'all'
  const [typeFilter, setTypeFilter] = useState('all')
  const [confirmFilter, setConfirmFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [detailUnit, setDetailUnit] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [archiveDialog, setArchiveDialog] = useState(null)
  const [archiveDate, setArchiveDate] = useState('')
  const [archiveSelection, setArchiveSelection] = useState({})
  const [archiving, setArchiving] = useState(false)
  const [floorFilter, setFloorFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

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

  // Map unitId → active residents (not archived)
  const residentsByUnit = useMemo(() => {
    const m = {}
    allResidents.forEach(r => {
      if (r.archived) return
      const uid = r.unit_id || r.unitId
      if (!uid) return
      if (!m[uid]) m[uid] = []
      m[uid].push(r)
    })
    return m
  }, [allResidents])

  // Map unitId → archived residents (history)
  const archivedByUnit = useMemo(() => {
    const m = {}
    allResidents.forEach(r => {
      if (!r.archived) return
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
    if (confirmFilter === 'confirmed') {
      result = result.filter(u => u.details_confirmed_at || u.detailsConfirmedAt)
    } else if (confirmFilter === 'pending') {
      result = result.filter(u => !(u.details_confirmed_at || u.detailsConfirmedAt))
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
  }, [allUnits, buildingFilter, typeFilter, confirmFilter, search, residentsByUnit])

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
      // Owner of a rented unit is stored on the unit itself (custom_fields.owner),
      // not as a resident row — single source of truth shared with the resident portal.
      const cfo = (unit.custom_fields || unit.customFields || {}).owner
      owners = cfo && (cfo.first_name || cfo.last_name || cfo.phone || cfo.email)
        ? [{
            _key: 'cf-owner', id: null,
            first_name: cfo.first_name || '', last_name: cfo.last_name || '',
            phone: cfo.phone || '', email: cfo.email || '', is_primary: false,
          }]
        : []
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
      parking_lot: cf.parking_lot || '',
      notes: unit.notes || '',
      residents,
      owners,
    })
    setFormOpen(true)
    setDetailUnit(null)
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
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
      // Landlord owner (rented units only) is persisted on the unit, not as a resident row
      const ownerObj = form.unit_type === 'rented' && form.owners[0] &&
        (form.owners[0].first_name || form.owners[0].last_name || form.owners[0].phone || form.owners[0].email)
        ? {
            first_name: form.owners[0].first_name || '',
            last_name: form.owners[0].last_name || '',
            phone: form.owners[0].phone || '',
            email: form.owners[0].email || '',
          }
        : null

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
          parking_lot: form.parking_lot || '',
          tier_label: form.tier_label || '',
          ...(ownerObj ? { owner: ownerObj } : {}),
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

      // Collect resident rows to save (owners of rented units are NOT resident rows)
      const residentType = form.unit_type === 'rented' ? 'tenant' : 'owner'
      const toSave = form.residents.map(r => ({ ...r, resident_type: residentType }))

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

  // ── Admin: confirm / un-confirm a unit's details on the resident's behalf ──
  const [confirmingUnit, setConfirmingUnit] = useState(false)
  const toggleDetailsConfirmed = async (unit) => {
    const already = !!(unit.details_confirmed_at || unit.detailsConfirmedAt)
    const newVal = already ? null : new Date().toISOString()
    setConfirmingUnit(true)
    try {
      await update(unit.id, { details_confirmed_at: newVal })
      setDetailUnit(u => u ? { ...u, details_confirmed_at: newVal, detailsConfirmedAt: newVal } : u)
      toast(newVal ? 'הפרטים סומנו כמאושרים' : 'אישור הפרטים בוטל')
    } catch (err) {
      console.error('toggle details_confirmed failed', err)
      toastError(`שגיאה: ${err.message}`)
    } finally {
      setConfirmingUnit(false)
    }
  }

  // ── Archive residents ────────────────────────────────────────────────────
  const openArchiveDialog = (unit) => {
    const residents = residentsByUnit[unit.id] || []
    if (residents.length === 0) {
      toastError('אין דיירים פעילים לארכיון')
      return
    }
    const unitType = getUnitType(unit)
    const selection = {}
    residents.forEach(r => {
      // For rented units, pre-select tenants only (owners stay)
      if (unitType === 'rented' && (r.resident_type || r.residentType) === 'owner') {
        selection[r.id] = false
      } else {
        selection[r.id] = true
      }
    })
    setArchiveSelection(selection)
    setArchiveDate(new Date().toISOString().split('T')[0])
    setArchiveDialog(unit)
  }

  const handleArchiveResidents = async () => {
    const selectedIds = Object.entries(archiveSelection)
      .filter(([, selected]) => selected)
      .map(([id]) => id)
    if (selectedIds.length === 0) {
      toastError('לא נבחרו דיירים')
      return
    }
    setArchiving(true)
    try {
      for (const id of selectedIds) {
        await updateResident(id, {
          archived: true,
          move_out_date: archiveDate || new Date().toISOString().split('T')[0],
          is_primary: false,
        })
      }
      setArchiveDialog(null)
      setArchiveDate('')
      setArchiveSelection({})
      toast('הדיירים הועברו לארכיון בהצלחה')
    } catch (err) {
      console.error('Archive failed:', err)
      toastError(`שגיאה בארכיון: ${err.message}`)
    } finally {
      setArchiving(false)
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
  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Home} iconColor="indigo" title="דירות" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  const scopeUnits = buildingFilter === 'all' ? allUnits : allUnits.filter(u => (u.buildingId || u.building_id) === buildingFilter)
  const confirmedCount = scopeUnits.filter(u => u.details_confirmed_at || u.detailsConfirmedAt).length

  // ── Civic Blue directory view model ──
  const floors = [...new Set(scopeUnits.map((u) => u.floor).filter((x) => x != null && x !== ''))].sort((a, b) => Number(a) - Number(b))
  const activeResidents = scopeUnits.reduce((n, u) => n + (residentsByUnit[u.id]?.length || 0), 0)
  const rentedCount = scopeUnits.filter((u) => getUnitType(u) === 'rented').length
  const occupied = scopeUnits.filter((u) => (residentsByUnit[u.id] || []).length > 0).length
  const missingCount = scopeUnits.length - confirmedCount
  const confirmedPct = scopeUnits.length ? Math.round((confirmedCount / scopeUnits.length) * 1000) / 10 : 0
  const rows = floorFilter === 'all' ? filtered : filtered.filter((u) => String(u.floor) === floorFilter)
  const selectedUnit = rows.find((u) => u.id === selectedId) || rows[0] || null
  const unitFacts = (u) => {
    const cf = u.custom_fields || u.customFields || {}
    const parking = Array.isArray(u.parkingSpots || u.parking_spots) ? (u.parkingSpots || u.parking_spots) : []
    const storage = cf.storage_numbers?.length ? cf.storage_numbers : (u.storage_number ? [u.storage_number] : [])
    const gate = cf.parking_gate_phones?.length ? cf.parking_gate_phones : (u.parking_gate_phone ? [u.parking_gate_phone] : [])
    return { cf, parking, storage, gate }
  }
  const exportCsv = () => {
    const out = [['דירה', 'קומה', 'דייר ראשי', 'טלפון', 'סוג', 'נפשות', 'חניות', 'מחסנים', 'טלפוני שער', 'פרטים']]
    rows.forEach((u) => {
      const res = residentsByUnit[u.id] || []
      const p = getPrimaryResident(res)
      const { parking, storage, gate } = unitFacts(u)
      out.push([u.number, u.floor, p ? fullName(p) : '', p?.phone || '', getUnitType(u) === 'rented' ? 'שכירות' : 'בעלות', res.length, parking.join(' '), storage.join(' '), gate.join(' '), (u.details_confirmed_at || u.detailsConfirmedAt) ? 'מאושר' : 'חסר'])
    })
    const csv = '﻿' + out.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: 'dirot-vedayarim.csv' }).click()
    URL.revokeObjectURL(url)
  }
  const pickUnit = (u) => {
    setSelectedId(u.id)
    // Below xl there is no side panel — open the full detail instead.
    if (typeof window !== 'undefined' && window.innerWidth < 1280) setDetailUnit(u)
  }
  const selCls = 'h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text-primary)]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ספר דירות ודיירים</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--surface-container)] text-[var(--primary)] text-[12px] font-semibold num-tabular">
              {scopeUnits.length} דירות{floors.length ? ` • ${floors.length} קומות` : ''}
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">ניהול פרטי בעלי נכסים ושוכרים, אמצעי קשר, חניות ומחסנים והרשאות שער</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />ייצוא נתונים</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4" />הוספת דירה</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="סך כל הדירות" icon={Building2} color="blue" value={String(scopeUnits.length)}
          note={<span className="px-2 py-0.5 rounded-full bg-[var(--success-light)] text-[var(--success)]">{scopeUnits.length ? Math.round((occupied / scopeUnits.length) * 100) : 0}% מאוכלסות</span>}
          sub={`${occupied} דירות עם דיירים רשומים`} />
        <StatCard label="דיירים פעילים רשומים" icon={Users} color="purple" value={String(activeResidents)}
          sub={`${scopeUnits.length - rentedCount} בבעלות • ${rentedCount} בשכירות`} />
        <StatCard label="דירות בשכירות" icon={KeyRound} color="cyan" value={String(rentedCount)}
          note={<span className="px-2 py-0.5 rounded-full bg-[var(--surface-variant)] text-[var(--primary-dark)]">{scopeUnits.length ? Math.round((rentedCount / scopeUnits.length) * 1000) / 10 : 0}%</span>}
          sub="מסך הבניין" />
        <StatCard label="פרטים מאושרים ומעודכנים" icon={ShieldCheck} color="emerald" value={`${confirmedPct}%`}
          sub={`${confirmedCount} מתוך ${scopeUnits.length} דירות`}
          progress={confirmedPct}
          footer={null} />
      </div>

      {/* Filter bar */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם דייר או מספר דירה..." className="flex-1 min-w-[220px]" />
        <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} className={selCls} aria-label="קומה">
          <option value="all">כל הקומות</option>
          {floors.map((fl) => <option key={fl} value={String(fl)}>קומה {fl}</option>)}
        </select>
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל', count: scopeUnits.length },
            { key: 'owned', label: 'בעלות', count: scopeUnits.length - rentedCount },
            { key: 'rented', label: 'שכירות', count: rentedCount },
          ]}
          activeTab={typeFilter}
          onChange={setTypeFilter}
        />
        <button
          onClick={() => setConfirmFilter(confirmFilter === 'pending' ? 'all' : 'pending')}
          className={`h-[38px] px-3 rounded-[var(--radius)] border text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${confirmFilter === 'pending' ? 'border-amber-400 bg-[var(--warning-light)] text-[var(--warning)]' : 'border-amber-200 text-[var(--warning)] hover:bg-[var(--warning-light)]'}`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />חסר פרטים ({missingCount})
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Home} title="אין דירות" description={search ? 'לא נמצאו תוצאות לחיפוש' : 'הוסף דירה ראשונה כדי להתחיל'}
          actionLabel={!search ? 'הוסף דירה' : undefined} onAction={!search ? openCreate : undefined} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Directory table */}
          <div className="xl:col-span-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[var(--text-primary)]">רשימת דירות מלאה <span className="font-medium text-[var(--text-muted)]">({rows.length} יחידות)</span></h2>
              <span className="text-[11px] text-[var(--text-muted)]">ממוין לפי מספר דירה</span>
            </div>
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>דירה וקומה</th><th>דייר ראשי וקשר</th><th>סוג</th><th>נפשות</th><th>חניה ומחסן</th><th>שער</th><th>סטטוס</th></tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const res = residentsByUnit[u.id] || []
                    const p = getPrimaryResident(res)
                    const rented = getUnitType(u) === 'rented'
                    const { parking, storage, gate } = unitFacts(u)
                    const ok = !!(u.details_confirmed_at || u.detailsConfirmedAt)
                    const isSel = selectedUnit?.id === u.id
                    const initials = p ? (familyName(p)[0] || '') : ''
                    return (
                      <tr key={u.id} onClick={() => pickUnit(u)} className={`cursor-pointer ${isSel ? '!bg-[var(--surface-secondary)] shadow-[inset_-3px_0_0_var(--primary)]' : ''}`}>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="h-7 min-w-7 px-1 rounded-[var(--radius)] bg-[var(--surface-container)] text-[var(--primary-dark)] flex items-center justify-center text-[13px] font-bold num-tabular">{u.number}</span>
                            <div>
                              <span className="text-[13px] font-semibold">דירה {u.number}</span>
                              {u.board_member && <span className="mr-1.5 px-1.5 rounded bg-[var(--primary)] text-white text-[10px] font-bold">ועד</span>}
                              <span className="block text-[11px] text-[var(--text-muted)]">{u.floor != null && u.floor !== '' ? `קומה ${u.floor}` : ''}{u.rooms ? ` • ${u.rooms} חד׳` : ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {p ? (
                            <div className="flex items-center gap-2">
                              <span className="h-8 w-8 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center text-[11px] font-bold text-[var(--text-secondary)]">{initials}</span>
                              <div>
                                <span className="text-[13px] font-semibold">{familyName(p) || 'ללא שם משפחה'}</span>
                                {p.phone && <span className="block text-[11px] text-[var(--text-muted)] num-tabular" dir="ltr">{p.phone}</span>}
                              </div>
                            </div>
                          ) : <span className="text-[12px] text-[var(--text-muted)]">ללא דייר רשום</span>}
                        </td>
                        <td className="whitespace-nowrap"><Badge variant={rented ? 'info' : 'default'}>{rented ? 'שוכר/ת' : 'בעלים'}</Badge></td>
                        <td className="whitespace-nowrap text-[12px] num-tabular">{res.length || '—'}</td>
                        <td className="text-[12px] text-[var(--text-secondary)]">
                          {parking.length ? <span className="block">חניה {parking.join(', ')}</span> : null}
                          {storage.length ? <span className="block">מחסן {storage.join(', ')}</span> : null}
                          {!parking.length && !storage.length && '—'}
                        </td>
                        <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)]">
                          {gate.length ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-[var(--primary)]" />{gate.length} טלפונים</span> : '—'}
                        </td>
                        <td className="whitespace-nowrap">
                          {ok ? <Badge variant="success">● מאושר ומעודכן</Badge> : <Badge variant="warning">● חסר / לא אושר</Badge>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected-unit panel (xl+) */}
          {selectedUnit && (() => {
            const u = selectedUnit
            const res = residentsByUnit[u.id] || []
            const rented = getUnitType(u) === 'rented'
            const { cf, parking, storage, gate } = unitFacts(u)
            const owner = rented && cf.owner && (cf.owner.first_name || cf.owner.last_name || cf.owner.phone) ? cf.owner : null
            const primary = getPrimaryResident(res)
            const ok = !!(u.details_confirmed_at || u.detailsConfirmedAt)
            return (
              <aside className="hidden xl:block xl:col-span-4 sticky top-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                <div className="p-4 bg-[var(--surface-secondary)]/60 border-b border-[var(--border)] space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-8 min-w-8 px-1.5 rounded-[var(--radius)] bg-[var(--primary)] text-white flex items-center justify-center text-[15px] font-bold num-tabular">{u.number}</span>
                        <h3 className="text-[18px] font-bold text-[var(--text-primary)]">דירה {u.number}{u.rooms ? ` • ${u.rooms} חדרים` : ''}</h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant={rented ? 'info' : 'default'}>{rented ? 'דירה בשכירות' : 'דירה בבעלות'}</Badge>
                        <span className="text-[12px] text-[var(--text-muted)]">{[u.floor != null && u.floor !== '' ? `קומה ${u.floor}` : '', u.area > 0 ? `${u.area} מ״ר` : ''].filter(Boolean).join(' • ')}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setDetailUnit(u)} title="פירוט מלא" className="p-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-container)] text-[var(--text-secondary)]"><Maximize2 className="h-4 w-4" /></button>
                      <button onClick={() => openEdit(u)} title="עריכה" className="p-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-container)] text-[var(--text-secondary)]"><Pencil className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {primary?.phone && (
                    <a href={waLink(primary.phone, familyName(primary) ? `שלום משפחת ${familyName(primary)}, ` : 'שלום, ') || '#'} target="_blank" rel="noopener noreferrer"
                      className="w-full h-10 rounded-[var(--radius)] bg-[var(--success)] hover:opacity-90 text-white text-[13px] font-semibold flex items-center justify-center gap-2">
                      <MessageCircle className="h-4 w-4" />פתיחת צ׳אט וואטסאפ עם דירה {u.number}
                    </a>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-1.5"><Users className="h-4 w-4 text-[var(--primary)]" />דיירים נוכחים ({res.length})</p>
                      {isCommittee && res.length > 0 && (
                        <button onClick={() => openArchiveDialog(u)} className="text-[11px] font-semibold text-[var(--warning)] hover:underline flex items-center gap-1"><Archive className="h-3.5 w-3.5" />עזיבה</button>
                      )}
                    </div>
                    {res.length === 0 ? <p className="text-[12px] text-[var(--text-muted)]">אין דיירים רשומים</p> : (
                      <div className="space-y-2">
                        {res.map((r) => (
                          <div key={r.id} className="p-2.5 rounded-[var(--radius)] border border-[var(--border)] text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[13px] text-[var(--text-primary)]">{fullName(r)}</span>
                              {(r.is_primary || r.isPrimary) && <span className="px-1.5 rounded bg-[var(--primary-dark)] text-white text-[10px] font-bold flex items-center gap-0.5"><Star className="h-2.5 w-2.5 fill-white" />דייר ראשי</span>}
                            </div>
                            <div className="text-[var(--text-secondary)] mt-0.5 flex items-center gap-2 flex-wrap">
                              {r.phone && <a href={telHref(r.phone)} className="num-tabular hover:text-[var(--primary)]" dir="ltr">{r.phone}</a>}
                              {r.email && <span className="truncate">{r.email}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {owner && (
                    <div className="p-3 rounded-[var(--radius)] border border-[var(--primary)]/20 bg-[var(--surface-secondary)]/60 text-[12px]">
                      <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">בעל הנכס (משכיר)</p>
                      <p className="font-semibold">{fullName(owner)}</p>
                      <p className="text-[var(--text-secondary)] num-tabular" dir="ltr">{owner.phone}</p>
                      {owner.email && <p className="text-[var(--text-secondary)]">{owner.email}</p>}
                    </div>
                  )}

                  <div>
                    <p className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-1.5 mb-2"><Car className="h-4 w-4 text-[var(--primary)]" />חניה, מחסן ושער כניסה</p>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="p-2.5 rounded-[var(--radius)] border border-[var(--border)]"><span className="block text-[11px] text-[var(--text-muted)]">חניה</span><strong className="text-[13px]">{parking.length ? parking.join(', ') : '—'}</strong></div>
                      <div className="p-2.5 rounded-[var(--radius)] border border-[var(--border)]"><span className="block text-[11px] text-[var(--text-muted)]">מחסן</span><strong className="text-[13px]">{storage.length ? storage.join(', ') : '—'}</strong></div>
                    </div>
                    {gate.length > 0 && (
                      <div className="mt-2 p-2.5 rounded-[var(--radius)] border border-[var(--border)] text-[12px]">
                        <span className="block text-[11px] text-[var(--text-muted)] mb-0.5">טלפונים מורשים לשער ({gate.length})</span>
                        <span className="font-semibold num-tabular" dir="ltr">{gate.join(' • ')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border)]">
                    <span className="text-[12px] text-[var(--text-secondary)]">ועד חודשי: <strong className="text-[var(--text-primary)] num-tabular">{formatCurrency(getDisplayFee(u))}</strong></span>
                    {isCommittee && (
                      <button disabled={confirmingUnit} onClick={() => toggleDetailsConfirmed(u)}
                        className={`text-[11px] font-semibold flex items-center gap-1 ${ok ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                        {ok ? <><RotateCcw className="h-3.5 w-3.5" />בטל אישור</> : <><CheckCircle2 className="h-3.5 w-3.5" />אשר פרטים</>}
                      </button>
                    )}
                  </div>
                </div>
              </aside>
            )
          })()}
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {detailUnit && (() => {
        const unitResidents = residentsByUnit[detailUnit.id] || []
        const unitType = getUnitType(detailUnit)
        const tenants = unitType === 'rented'
          ? unitResidents.filter(r => (r.resident_type || r.residentType) === 'tenant')
          : unitResidents
        const cfOwner = (detailUnit.custom_fields || detailUnit.customFields || {}).owner
        const owners = unitType === 'rented' && cfOwner &&
          (cfOwner.first_name || cfOwner.last_name || cfOwner.phone || cfOwner.email)
          ? [cfOwner]
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
            <DetailRow
              label="אישור פרטים ע״י הדייר"
              value={(detailUnit.details_confirmed_at || detailUnit.detailsConfirmedAt)
                ? `אושר ${new Date(detailUnit.details_confirmed_at || detailUnit.detailsConfirmedAt).toLocaleDateString('he-IL')}`
                : 'טרם אושר'}
            />
            {isCommittee && (
              <div className="pt-1 pb-1">
                {(detailUnit.details_confirmed_at || detailUnit.detailsConfirmedAt) ? (
                  <Button variant="outline" size="sm" disabled={confirmingUnit}
                    onClick={() => toggleDetailsConfirmed(detailUnit)}
                    className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50">
                    <RotateCcw className="h-3.5 w-3.5" />
                    בטל אישור פרטים
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={confirmingUnit}
                    onClick={() => toggleDetailsConfirmed(detailUnit)}
                    className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    אשר פרטים עבור הדירה
                  </Button>
                )}
              </div>
            )}

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
                {owners.map((r, i) => (
                  <div key={i} className="mb-2 p-2 rounded bg-[var(--bg-secondary)] text-sm">
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
            <DetailRow label="חניון" value={cf.parking_lot || undefined} />
            <DetailRow label="הערות" value={detailUnit.notes} />

            {/* ── Archived residents history ─────────────────────────── */}
            {(() => {
              const archived = archivedByUnit[detailUnit.id] || []
              if (archived.length === 0) return null
              return (
                <div className="pt-3 pb-1">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    ארכיון דיירים ({archived.length})
                  </p>
                  <div className="space-y-1.5">
                    {archived
                      .sort((a, b) => (b.move_out_date || '').localeCompare(a.move_out_date || ''))
                      .map(r => (
                      <div key={r.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">{fullName(r)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            {(r.resident_type || r.residentType) === 'tenant' ? 'שוכר' : 'בעלים'}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-slate-500">
                          {r.move_in_date && <span>כניסה: {new Date(r.move_in_date).toLocaleDateString('he-IL')}</span>}
                          {r.move_out_date && <span>יציאה: {new Date(r.move_out_date).toLocaleDateString('he-IL')}</span>}
                        </div>
                        {r.phone && <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</div>}
                        {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailUnit)}>
                <Pencil className="h-3.5 w-3.5" /> עריכה
              </Button>
              {isCommittee && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                  onClick={() => { setDetailUnit(null); openArchiveDialog(detailUnit) }}
                >
                  <Archive className="h-3.5 w-3.5" /> העבר דיירים לארכיון
                </Button>
              )}
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

      {/* ── Archive Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!archiveDialog} onOpenChange={() => setArchiveDialog(null)}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" />
              העברת דיירים לארכיון — דירה {archiveDialog?.number || archiveDialog?.unit_number}
            </DialogTitle>
          </DialogHeader>
          {archiveDialog && (() => {
            const residents = residentsByUnit[archiveDialog.id] || []
            const unitType = getUnitType(archiveDialog)
            const hasOwners = unitType === 'rented' && residents.some(r => (r.resident_type || r.residentType) === 'owner')
            const selectedCount = Object.values(archiveSelection).filter(Boolean).length

            return (
              <div className="space-y-4 mt-1">
                <p className="text-sm text-[var(--text-secondary)]">
                  הדיירים שייבחרו יועברו לארכיון הדירה. כל הנתונים המקושרים (חובות, תקלות, שריונים) יישמרו בהיסטוריה.
                </p>

                {/* Move-out date */}
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    תאריך יציאה
                  </label>
                  <input
                    type="date"
                    value={archiveDate}
                    onChange={e => setArchiveDate(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>

                {/* Resident checkboxes */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">בחר דיירים להעברה:</label>
                  {residents.map(r => {
                    const isOwner = unitType === 'rented' && (r.resident_type || r.residentType) === 'owner'
                    return (
                      <label key={r.id} className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                        archiveSelection[r.id]
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-white border-[var(--border)] hover:border-slate-300'
                      )}>
                        <input
                          type="checkbox"
                          checked={!!archiveSelection[r.id]}
                          onChange={e => setArchiveSelection(prev => ({ ...prev, [r.id]: e.target.checked }))}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{fullName(r)}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border',
                              isOwner ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                            )}>
                              {isOwner ? 'בעלים' : (unitType === 'rented' ? 'שוכר' : 'דייר')}
                            </span>
                            {(r.is_primary || r.isPrimary) && (
                              <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400" />ראשי
                              </span>
                            )}
                          </div>
                          {r.phone && <span className="text-xs text-slate-500">{r.phone}</span>}
                        </div>
                      </label>
                    )
                  })}
                </div>

                {hasOwners && !Object.entries(archiveSelection).some(([id, sel]) => {
                  const r = residents.find(res => res.id === id)
                  return sel && (r?.resident_type || r?.residentType) === 'owner'
                }) && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                    הבעלים לא נבחרו — הם יישארו משויכים לדירה. בתקופת הפער עד כניסת שוכר חדש, הדירה תהיה תחת אחריות הבעלים.
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={handleArchiveResidents}
                    disabled={archiving || selectedCount === 0 || !archiveDate}
                    className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700"
                  >
                    <Archive className="h-4 w-4" />
                    {archiving ? 'מעביר...' : `העבר ${selectedCount} דיירים לארכיון`}
                  </Button>
                  <Button variant="outline" onClick={() => setArchiveDialog(null)}>ביטול</Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  פרטי הבעלים נשמרים על הדירה (גלויים גם לדייר בפורטל). הבעלים אינם נחשבים דיירים ולא יקבלו הודעות שוטפות.
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
                {form.owners.length === 0 && (
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
                )}
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
                  max={buildingMap[form.buildingId]?.max_gate_phones || 2}
                  phone
                  allowExceed
                />
                {/* Garage selection — only when the building defines parking lots */}
                {(() => {
                  const lots = buildingMap[form.buildingId]?.parking_lots
                  if (!Array.isArray(lots) || lots.length === 0) return null
                  return (
                    <FormSelect
                      label="חניון"
                      value={form.parking_lot}
                      onChange={setFieldEv('parking_lot')}
                      options={[{ value: '', label: 'ללא / לא נבחר' }, ...lots.map(l => ({ value: l, label: l }))]}
                    />
                  )
                })()}
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
