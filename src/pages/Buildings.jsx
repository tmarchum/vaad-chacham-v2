import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { StatCard } from '@/components/common/StatCard'
import { TabGroup } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatCurrency, calcUnitFee } from '@/lib/utils'
import { Building2, Plus, Pencil, Trash2, X, Home, Wallet, AlertTriangle, MapPin, Landmark, Info, CheckCircle2 } from 'lucide-react'

const ELEVATOR_OPTIONS = [0,1,2,3,4,5].map(n => ({ value: String(n), label: String(n) }))

// ── Fee Tiers Editor ──────────────────────────────────────────────────────────
function FeeTiersEditor({ mode, tiers, onChange }) {
  const addTier = () => {
    if (mode === 'by_rooms') {
      onChange([...tiers, { label: '', rooms: '', fee: '' }])
    } else {
      onChange([...tiers, { label: '', min_sqm: '', max_sqm: '', fee: '' }])
    }
  }
  const removeTier = idx => onChange(tiers.filter((_, i) => i !== idx))
  const updateTier = (idx, key, val) => {
    const next = tiers.map((t, i) => i === idx ? { ...t, [key]: val } : t)
    onChange(next)
  }

  if (mode === 'flat') return null

  return (
    <div className="mt-3 space-y-2">
      {tiers.map((tier, idx) => (
        <div key={idx} className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 space-y-2">
          {/* Label row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-0.5">
              <label className="text-xs text-[var(--text-muted)]">תווית (אופציונלי — למשל: דופלקס, פנטהאוז)</label>
              <Input
                value={tier.label || ''}
                onChange={e => updateTier(idx, 'label', e.target.value)}
                className="h-8 text-sm"
                placeholder="3 חדרים / דופלקס / פנטהאוז..."
              />
            </div>
            <button type="button" onClick={() => removeTier(idx)} className="text-[var(--text-muted)] hover:text-[var(--danger)] mt-4 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Values row */}
          <div className="flex gap-2">
            {mode === 'by_rooms' ? (
              <>
                <div className="flex-1 space-y-0.5">
                  <label className="text-xs text-[var(--text-muted)]">חדרים (ריק = לפי תווית בלבד)</label>
                  <Input type="number" step="0.5" value={tier.rooms} onChange={e => updateTier(idx, 'rooms', e.target.value)} className="h-8 text-sm" placeholder="3" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <label className="text-xs text-[var(--text-muted)]">תעריף ₪</label>
                  <Input type="number" value={tier.fee} onChange={e => updateTier(idx, 'fee', e.target.value)} className="h-8 text-sm" placeholder="400" />
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 space-y-0.5">
                  <label className="text-xs text-[var(--text-muted)]">מ"ר מינ׳</label>
                  <Input type="number" value={tier.min_sqm} onChange={e => updateTier(idx, 'min_sqm', e.target.value)} className="h-8 text-sm" placeholder="0" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <label className="text-xs text-[var(--text-muted)]">מ"ר מקס׳</label>
                  <Input type="number" value={tier.max_sqm} onChange={e => updateTier(idx, 'max_sqm', e.target.value)} className="h-8 text-sm" placeholder="80" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <label className="text-xs text-[var(--text-muted)]">תעריף ₪</label>
                  <Input type="number" value={tier.fee} onChange={e => updateTier(idx, 'fee', e.target.value)} className="h-8 text-sm" placeholder="400" />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addTier}>
        <Plus className="h-3.5 w-3.5" />
        הוסף תעריף
      </Button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: '', alias: '', street: '', house_number: '', city: '',
  total_units: '', floors: '', year_built: '',
  parking: '', storage: '', elevators: '0',
  max_gate_phones: '', parking_lots: [], dues_payment_url: '',
  generator: false, water_pump: false, fire_suppression: false,
  intercom: false, shared_roof: false, gym: false, pool: false,
  residents_room: false, management_company: false,
  bank_name: '', branch: '', account_number: '', holder: '', authorized_signer: '',
  board_member_discount: '',
  fee_mode: 'flat',
  monthly_fee: '',
  fee_tiers: [],
  balance: '', notes: '',
}

function buildAddress(b) {
  return [b.street, b.house_number, b.city].filter(Boolean).join(' ') || b.address || ''
}

function feeSummary(b) {
  if (b.fee_mode === 'by_rooms' && Array.isArray(b.fee_tiers) && b.fee_tiers.length) {
    return `לפי חדרים (${b.fee_tiers.length} תעריפים)`
  }
  if (b.fee_mode === 'by_sqm' && Array.isArray(b.fee_tiers) && b.fee_tiers.length) {
    return `לפי מ"ר (${b.fee_tiers.length} מדרגות)`
  }
  return b.monthly_fee || b.monthlyFee ? formatCurrency(b.monthly_fee ?? b.monthlyFee) : null
}

// Facility flags shown as chips in the side panel
const FACILITIES = [
  ['generator', 'גנרטור'], ['water_pump', 'משאבת מים'], ['fire_suppression', 'כיבוי אש'],
  ['intercom', 'אינטרקום'], ['shared_roof', 'גג משותף'], ['gym', 'חדר כושר'],
  ['pool', 'בריכה'], ['residents_room', 'חדר דיירים'], ['management_company', 'חברת ניהול'],
]

// What's missing for a building to be "operational" (fee + bank details)
function missingInfo(b) {
  const out = []
  const hasFee = b.fee_mode && b.fee_mode !== 'flat'
    ? Array.isArray(b.fee_tiers) && b.fee_tiers.length > 0
    : Number(b.monthly_fee ?? b.monthlyFee) > 0
  if (!hasFee) out.push('תעריף ועד')
  if (!b.bank_name || !b.account_number) out.push('פרטי בנק')
  if (!buildAddress(b)) out.push('כתובת')
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────
function Buildings() {
  const { data: buildings, create, update, remove, isSaving, isLoading } = useCollection('buildings')
  const { refreshBuildings, selectedBuilding: activeBuilding, setSelectedBuilding } = useBuildingContext()
  const { data: allUnits } = useCollection('units')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | complete | incomplete
  const [selectedId, setSelectedId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailBuilding, setDetailBuilding] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const unitCountMap = useMemo(() => {
    const m = {}
    allUnits.forEach(u => { m[u.buildingId || u.building_id] = (m[u.buildingId || u.building_id] || 0) + 1 })
    return m
  }, [allUnits])

  // Expected monthly dues per building = Σ calcUnitFee over its registered units
  const expectedMap = useMemo(() => {
    const byId = Object.fromEntries(buildings.map(b => [b.id, b]))
    const m = {}
    allUnits.forEach(u => {
      const bid = u.buildingId || u.building_id
      if (!byId[bid]) return
      m[bid] = (m[bid] || 0) + (calcUnitFee(u, byId[bid]) || 0)
    })
    return m
  }, [allUnits, buildings])

  const searched = useMemo(() => {
    if (!search) return buildings
    const q = search.toLowerCase()
    return buildings.filter(b =>
      b.name?.toLowerCase().includes(q) ||
      b.alias?.toLowerCase().includes(q) ||
      b.street?.toLowerCase().includes(q) ||
      b.city?.toLowerCase().includes(q)
    )
  }, [buildings, search])

  const filtered = useMemo(() => {
    if (statusFilter === 'complete') return searched.filter(b => missingInfo(b).length === 0)
    if (statusFilter === 'incomplete') return searched.filter(b => missingInfo(b).length > 0)
    return searched
  }, [searched, statusFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setFormOpen(true)
  }

  const openEdit = b => {
    setEditingId(b.id)
    setForm({
      name: b.name || '',
      alias: b.alias || '',
      street: b.street || '',
      house_number: b.house_number || '',
      city: b.city || '',
      total_units: b.total_units ?? b.totalUnits ?? '',
      floors: b.floors ?? '',
      year_built: b.year_built ?? '',
      parking: b.parking ?? '',
      storage: b.storage ?? '',
      elevators: String(b.elevators ?? 0),
      max_gate_phones: b.max_gate_phones ?? '',
      parking_lots: Array.isArray(b.parking_lots) ? b.parking_lots : [],

      dues_payment_url: b.dues_payment_url ?? '',
      generator: !!b.generator,
      water_pump: !!b.water_pump,
      fire_suppression: !!b.fire_suppression,
      intercom: !!b.intercom,
      shared_roof: !!b.shared_roof,
      gym: !!b.gym,
      pool: !!b.pool,
      residents_room: !!b.residents_room,
      management_company: !!b.management_company,
      bank_name: b.bank_name || '',
      branch: b.branch || '',
      account_number: b.account_number || '',
      holder: b.holder || '',
      authorized_signer: b.authorized_signer || '',
      board_member_discount: b.board_member_discount ?? '',
      fee_mode: b.fee_mode || 'flat',
      monthly_fee: b.monthly_fee ?? b.monthlyFee ?? '',
      fee_tiers: Array.isArray(b.fee_tiers) ? b.fee_tiers : [],
      balance: b.balance ?? '',
      notes: b.notes || '',
    })
    setFormOpen(true)
    setDetailBuilding(null)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const data = {
      name: form.name,
      alias: form.alias,
      street: form.street,
      house_number: form.house_number,
      city: form.city,
      total_units: form.total_units ? Number(form.total_units) : 0,
      floors: form.floors ? Number(form.floors) : 0,
      year_built: form.year_built ? Number(form.year_built) : null,
      parking: form.parking ? Number(form.parking) : 0,
      storage: form.storage ? Number(form.storage) : 0,
      elevators: Number(form.elevators),
      max_gate_phones: form.max_gate_phones ? Number(form.max_gate_phones) : 2,
      parking_lots: (form.parking_lots || []).map(s => (s || '').trim()).filter(Boolean),

      dues_payment_url: (form.dues_payment_url || '').trim(),
      generator: !!form.generator,
      water_pump: !!form.water_pump,
      fire_suppression: !!form.fire_suppression,
      intercom: !!form.intercom,
      shared_roof: !!form.shared_roof,
      gym: !!form.gym,
      pool: !!form.pool,
      residents_room: !!form.residents_room,
      management_company: !!form.management_company,
      bank_name: form.bank_name,
      branch: form.branch,
      account_number: form.account_number,
      holder: form.holder,
      authorized_signer: form.authorized_signer,
      board_member_discount: form.board_member_discount ? Number(form.board_member_discount) : 0,
      fee_mode: form.fee_mode,
      monthly_fee: form.fee_mode === 'flat' && form.monthly_fee ? Number(form.monthly_fee) : 0,
      fee_tiers: form.fee_mode !== 'flat'
        ? form.fee_tiers.map(t => ({
            ...t,
            ...(t.rooms !== undefined ? { rooms: Number(t.rooms) } : {}),
            ...(t.min_sqm !== undefined ? { min_sqm: Number(t.min_sqm) } : {}),
            ...(t.max_sqm !== undefined ? { max_sqm: Number(t.max_sqm) } : {}),
            fee: Number(t.fee),
          }))
        : [],
      balance: form.balance ? Number(form.balance) : 0,
      notes: form.notes,
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    await refreshBuildings()
    setFormOpen(false)
  }

  const setField = field => e => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setForm(prev => ({ ...prev, [field]: val }))
  }

  // Parking-lot (garage) name list helpers
  const addLot = () => setForm(p => ({ ...p, parking_lots: [...(p.parking_lots || []), ''] }))
  const removeLot = idx => setForm(p => ({ ...p, parking_lots: p.parking_lots.filter((_, i) => i !== idx) }))
  const updateLot = (idx, val) => setForm(p => ({ ...p, parking_lots: p.parking_lots.map((l, i) => i === idx ? val : l) }))

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
      await refreshBuildings()
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
    }
  }

  const FEE_MODES = [
    { value: 'flat', label: 'סכום קבוע לכל דירה' },
    { value: 'by_rooms', label: 'לפי מספר חדרים' },
    { value: 'by_sqm', label: 'לפי מ"ר' },
  ]

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תיק הבניינים</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  // ── Portfolio KPIs (across all buildings — this page is not building-scoped) ──
  const registeredUnits = allUnits.length
  const declaredUnits = buildings.reduce((a, b) => a + (Number(b.total_units ?? b.totalUnits) || 0), 0)
  const expectedTotal = buildings.reduce((a, b) => a + (expectedMap[b.id] || 0), 0)
  const balanceTotal = buildings.reduce((a, b) => a + (Number(b.balance) || 0), 0)
  const cities = new Set(buildings.map(b => b.city).filter(Boolean))
  const incomplete = buildings.filter(b => missingInfo(b).length > 0)
  const selected = buildings.find(b => b.id === selectedId) || filtered[0] || null
  const unitsOf = b => unitCountMap[b.id] || 0
  const declaredOf = b => Number(b.total_units ?? b.totalUnits) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תיק הבניינים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">כל הבניינים בניהולך — נתוני בסיס, תעריפי ועד, פרטי בנק וגבייה צפויה</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />בניין חדש</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="בניינים בניהול" icon={Building2} color="blue"
          value={String(buildings.length)}
          sub={cities.size ? `ב-${cities.size} ${cities.size === 1 ? 'עיר' : 'ערים'}` : 'לא הוזנו ערים'} />
        <StatCard label="דירות רשומות" icon={Home} color="purple"
          value={String(registeredUnits)}
          note={declaredUnits ? `מתוך ${declaredUnits} מוצהרות` : null}
          sub={declaredUnits ? `${Math.round((registeredUnits / declaredUnits) * 100)}% מהדירות הוזנו למערכת` : 'לא הוזן מספר דירות לבניינים'}
          progress={declaredUnits ? Math.min(100, Math.round((registeredUnits / declaredUnits) * 100)) : undefined} />
        <StatCard label="גבייה חודשית צפויה" icon={Wallet} color="emerald"
          value={formatCurrency(Math.round(expectedTotal))}
          sub="סך דמי הוועד לפי תעריפי הבניינים והדירות"
          footer={balanceTotal ? <span>יתרות קופה מוצהרות: <strong className="num-tabular text-[var(--text-primary)]">{formatCurrency(balanceTotal)}</strong></span> : null} />
        <StatCard label="בניינים הדורשים השלמה" icon={AlertTriangle} color={incomplete.length ? 'amber' : 'emerald'}
          value={String(incomplete.length)}
          sub={incomplete.length ? 'חסר תעריף ועד, פרטי בנק או כתובת' : 'כל הבניינים מוגדרים במלואם ✓'}
          footer={incomplete.length ? <button onClick={() => setStatusFilter('incomplete')} className="text-[var(--primary)] font-semibold hover:underline">להצגת הבניינים ←</button> : null} />
      </div>

      {/* Filter card */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם, כינוי, רחוב או עיר..." />
        </div>
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל', count: searched.length },
            { key: 'complete', label: 'מוגדרים', count: searched.filter(b => missingInfo(b).length === 0).length },
            { key: 'incomplete', label: '⚠ דורשים השלמה', count: searched.filter(b => missingInfo(b).length > 0).length },
          ]}
          activeTab={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="אין בניינים"
          description={search || statusFilter !== 'all' ? 'לא נמצאו תוצאות' : 'הוסף בניין ראשון כדי להתחיל'}
          actionLabel={!search && statusFilter === 'all' ? 'הוסף בניין' : undefined} onAction={!search && statusFilter === 'all' ? openCreate : undefined} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Ledger */}
          <div className="xl:col-span-8 space-y-4">
            {/* Desktop table */}
            <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    <tr><th>בניין</th><th>דירות</th><th>תעריף ועד</th><th className="!text-left">גבייה צפויה / חודש</th><th className="!text-left">יתרה</th><th>סטטוס</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(b => {
                      const missing = missingInfo(b)
                      const isSel = selected?.id === b.id
                      return (
                        <tr key={b.id} onClick={() => setSelectedId(b.id)} className={`cursor-pointer ${isSel ? '!bg-[var(--surface-container)]' : ''}`}>
                          <td className="min-w-[200px]">
                            <div className="flex items-center gap-3">
                              <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Building2 className="h-4 w-4" /></span>
                              <div className="min-w-0">
                                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
                                  <span className="truncate">{b.name}</span>
                                  {activeBuilding?.id === b.id && <Badge variant="info">פעיל</Badge>}
                                </span>
                                <span className="block text-[11px] text-[var(--text-muted)] truncate">{[b.alias, buildAddress(b)].filter(Boolean).join(' • ') || '—'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-[12px] num-tabular">
                            <strong className="text-[13px]">{unitsOf(b)}</strong>
                            {declaredOf(b) > 0 && declaredOf(b) !== unitsOf(b) && <span className="text-[var(--text-muted)]"> / {declaredOf(b)}</span>}
                          </td>
                          <td className="whitespace-nowrap text-[12px]">{feeSummary(b) || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap !text-left"><span className="text-[14px] font-bold num-tabular">{expectedMap[b.id] ? formatCurrency(Math.round(expectedMap[b.id])) : '—'}</span></td>
                          <td className="whitespace-nowrap !text-left text-[12px] num-tabular">{b.balance ? formatCurrency(b.balance) : <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap">
                            {missing.length === 0
                              ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" />מוגדר</Badge>
                              : <Badge variant="warning" title={`חסר: ${missing.join(', ')}`}>חסר {missing[0]}{missing.length > 1 ? ` +${missing.length - 1}` : ''}</Badge>}
                          </td>
                          <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-0.5">
                              <button onClick={() => setDetailBuilding(b)} title="פרטים מלאים" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Info className="h-3.5 w-3.5" /></button>
                              <button onClick={() => openEdit(b)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeleteTarget(b)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>מציג {filtered.length} מתוך {buildings.length} בניינים</span>
                <span>גבייה צפויה במוצג: <strong className="text-[var(--primary)] num-tabular">{formatCurrency(Math.round(filtered.reduce((a, b) => a + (expectedMap[b.id] || 0), 0)))}</strong></span>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden grid grid-cols-1 gap-3">
              {filtered.map(b => {
                const missing = missingInfo(b)
                return (
                  <div key={b.id} onClick={() => setDetailBuilding(b)}
                    className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] cursor-pointer">
                    <div className="flex items-start gap-3">
                      <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Building2 className="h-4 w-4" /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-semibold text-[var(--text-primary)]">{b.name}</span>
                          {activeBuilding?.id === b.id && <Badge variant="info">פעיל</Badge>}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">{[b.alias, buildAddress(b)].filter(Boolean).join(' • ') || '—'}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEdit(b)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(b)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)]"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--border-light)] grid grid-cols-3 gap-2 text-[11px] text-[var(--text-secondary)]">
                      <div><span className="block text-[var(--text-muted)]">דירות</span><strong className="num-tabular text-[13px] text-[var(--text-primary)]">{unitsOf(b)}</strong></div>
                      <div><span className="block text-[var(--text-muted)]">גבייה צפויה</span><strong className="num-tabular text-[13px] text-[var(--text-primary)]">{expectedMap[b.id] ? formatCurrency(Math.round(expectedMap[b.id])) : '—'}</strong></div>
                      <div><span className="block text-[var(--text-muted)]">סטטוס</span>
                        {missing.length === 0 ? <Badge variant="success">מוגדר</Badge> : <Badge variant="warning">חסר {missing[0]}</Badge>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Side panel — selected building */}
          {selected && (
            <aside className="hidden md:block xl:col-span-4 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[16px] font-bold text-[var(--text-primary)] truncate">{selected.name}</h2>
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{buildAddress(selected) || 'לא הוזנה כתובת'}</p>
                </div>
                {activeBuilding?.id === selected.id
                  ? <Badge variant="info">הבניין הפעיל</Badge>
                  : <Button size="sm" variant="outline" onClick={() => setSelectedBuilding(selected.id)}>הגדר כפעיל</Button>}
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['דירות רשומות', unitsOf(selected) + (declaredOf(selected) ? ` / ${declaredOf(selected)}` : '')],
                    ['קומות', selected.floors || '—'],
                    ['גבייה צפויה', expectedMap[selected.id] ? formatCurrency(Math.round(expectedMap[selected.id])) : '—'],
                    ['יתרה', selected.balance ? formatCurrency(selected.balance) : '—'],
                  ].map(([label, val]) => (
                    <div key={label} className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border-light)]">
                      <span className="block text-[11px] text-[var(--text-muted)]">{label}</span>
                      <span className="text-[15px] font-bold num-tabular text-[var(--text-primary)]">{val}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-secondary)]">תעריף ועד</span><span className="font-semibold num-tabular">{feeSummary(selected) || '—'}</span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-secondary)]">מעליות</span><span className="font-semibold num-tabular">{selected.elevators || 0}</span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-secondary)]">חניות / מחסנים</span><span className="font-semibold num-tabular">{selected.parking || 0} / {selected.storage || 0}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1"><Landmark className="h-3.5 w-3.5" />חשבון בנק</span>
                    <span className="font-semibold num-tabular">{selected.bank_name ? [selected.bank_name, selected.branch, selected.account_number].filter(Boolean).join(' / ') : '—'}</span>
                  </div>
                </div>

                {FACILITIES.some(([k]) => selected[k]) && (
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">מתקנים ושירותים</span>
                    <div className="flex flex-wrap gap-1.5">
                      {FACILITIES.filter(([k]) => selected[k]).map(([k, label]) => <Badge key={k} variant="neutral">{label}</Badge>)}
                    </div>
                  </div>
                )}

                {missingInfo(selected).length > 0 && (
                  <div className="p-3 rounded-[var(--radius)] bg-[var(--warning-light)] text-[var(--warning)] text-[12px] flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>חסר להשלמה: {missingInfo(selected).join(', ')}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => openEdit(selected)}><Pencil className="h-3.5 w-3.5" />עריכה</Button>
                  <Button size="sm" variant="outline" onClick={() => setDetailBuilding(selected)}><Info className="h-3.5 w-3.5" />פרטים מלאים</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteTarget(selected)} className="text-[var(--danger)]"><Trash2 className="h-3.5 w-3.5" />מחיקה</Button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal open={!!detailBuilding} onOpenChange={() => setDetailBuilding(null)}
        title={detailBuilding?.name || ''} onEdit={() => openEdit(detailBuilding)}>
        {detailBuilding && (
          <>
            <DetailRow label="שם" value={detailBuilding.name} />
            <DetailRow label="כינוי" value={detailBuilding.alias} />
            <DetailRow label="כתובת" value={buildAddress(detailBuilding)} />
            <DetailRow label="דירות" value={detailBuilding.total_units ?? detailBuilding.totalUnits} />
            <DetailRow label="קומות" value={detailBuilding.floors} />
            <DetailRow label="שנת בנייה" value={detailBuilding.year_built} />
            <DetailRow label="חניות" value={detailBuilding.parking} />
            <DetailRow label="מחסנים" value={detailBuilding.storage} />
            <DetailRow label="מקס׳ טלפוני שער חניה" value={detailBuilding.max_gate_phones} />
            <DetailRow label="חניונים" value={Array.isArray(detailBuilding.parking_lots) && detailBuilding.parking_lots.length ? detailBuilding.parking_lots.join(', ') : null} />
            <DetailRow label="מעליות" value={detailBuilding.elevators} />
            <DetailRow label="גנרטור" value={detailBuilding.generator ? 'כן' : null} />
            <DetailRow label="משאבת מים" value={detailBuilding.water_pump ? 'כן' : null} />
            <DetailRow label="כיבוי אש" value={detailBuilding.fire_suppression ? 'כן' : null} />
            <DetailRow label="אינטרקום" value={detailBuilding.intercom ? 'כן' : null} />
            <DetailRow label="גג משותף" value={detailBuilding.shared_roof ? 'כן' : null} />
            <DetailRow label="חדר כושר" value={detailBuilding.gym ? 'כן' : null} />
            <DetailRow label="בריכה" value={detailBuilding.pool ? 'כן' : null} />
            <DetailRow label="חדר דיירים" value={detailBuilding.residents_room ? 'כן' : null} />
            <DetailRow label="חברת ניהול" value={detailBuilding.management_company ? 'כן' : null} />
            <DetailRow label="בנק" value={detailBuilding.bank_name} />
            <DetailRow label="סניף" value={detailBuilding.branch} />
            <DetailRow label="מספר חשבון" value={detailBuilding.account_number} />
            <DetailRow label="בעל חשבון" value={detailBuilding.holder} />
            <DetailRow label="מורשה חתימה" value={detailBuilding.authorized_signer} />
            <DetailRow label="תעריף ועד" value={feeSummary(detailBuilding)} />
            {detailBuilding.fee_mode !== 'flat' && Array.isArray(detailBuilding.fee_tiers) && detailBuilding.fee_tiers.length > 0 && (
              <div className="py-2 border-b border-[var(--border)]">
                <span className="text-sm font-medium text-[var(--text-secondary)] block mb-1">מדרגות תעריף</span>
                {detailBuilding.fee_tiers.map((t, i) => (
                  <div key={i} className="text-sm text-[var(--text-primary)]">
                    {detailBuilding.fee_mode === 'by_rooms'
                      ? `${t.rooms} חדרים → ${formatCurrency(t.fee)}`
                      : `${t.min_sqm}–${t.max_sqm} מ"ר → ${formatCurrency(t.fee)}`
                    }
                  </div>
                ))}
              </div>
            )}
            <DetailRow label="יתרה" value={detailBuilding.balance ? formatCurrency(detailBuilding.balance) : null} />
            <DetailRow label="הנחת חבר ועד" value={detailBuilding.board_member_discount ? `${detailBuilding.board_member_discount}%` : null} />
            <DetailRow label="הערות" value={detailBuilding.notes} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailBuilding)}><Pencil className="h-3.5 w-3.5" />עריכה</Button>
              <Button variant="destructive" size="sm" onClick={() => { setDetailBuilding(null); setDeleteTarget(detailBuilding) }}>
                <Trash2 className="h-3.5 w-3.5" />מחיקה
              </Button>
            </div>
          </>
        )}
      </DetailModal>

      <DeleteConfirm open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete} itemName={deleteTarget?.name || ''} />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת בניין' : 'בניין חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Basic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="שם בניין" value={form.name} onChange={setField('name')} required />
              <FormField label="כינוי / שם קצר" value={form.alias} onChange={setField('alias')} placeholder="למשל: רמב״א" />
            </div>

            {/* Address */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">כתובת</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="רחוב" value={form.street} onChange={setField('street')} />
                <FormField label="מספר בית" value={form.house_number} onChange={setField('house_number')} />
                <FormField label="עיר" value={form.city} onChange={setField('city')} />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <FormField label="דירות" type="number" value={form.total_units} onChange={setField('total_units')} />
              <FormField label="קומות" type="number" value={form.floors} onChange={setField('floors')} />
              <FormField label="שנת בנייה" type="number" value={form.year_built} onChange={setField('year_built')} />
              <FormField label="חניות" type="number" value={form.parking} onChange={setField('parking')} />
              <FormField label="מחסנים" type="number" value={form.storage} onChange={setField('storage')} />
            </div>

            {/* Parking */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">חניה</h4>
              <FormField
                label="קישור לתשלום דמי ועד (PayBox / ביט)"
                value={form.dues_payment_url}
                onChange={setField('dues_payment_url')}
                placeholder="https://payboxapp.page.link/..."
              />
              <p className="text-xs text-[var(--text-muted)] -mt-2 mb-3">
                כפתור "שלם דמי ועד" בפורטל הדייר יפתח את הקישור הזה.
              </p>
              <FormField
                label="מספר טלפונים מקסימלי לשער חניה (לכל דירה)"
                type="number"
                value={form.max_gate_phones}
                onChange={setField('max_gate_phones')}
                placeholder="למשל: 2"
              />
              <div className="mt-3">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  חניונים בבניין
                </label>
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  שמות החניונים (למשל: חניון תחתון, חניון עליון). יוצגו לבחירה בכל דירה.
                </p>
                <div className="space-y-2">
                  {(form.parking_lots || []).map((lot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={lot}
                        onChange={e => updateLot(idx, e.target.value)}
                        placeholder="למשל: חניון תחתון"
                        className="flex-1"
                      />
                      <button type="button" onClick={() => removeLot(idx)} className="text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLot}>
                  <Plus className="h-3.5 w-3.5" />
                  הוסף חניון
                </Button>
              </div>
            </div>

            {/* Facilities */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">מתקנים ושירותים</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <FormSelect label="מעליות" value={form.elevators} onChange={setField('elevators')} options={ELEVATOR_OPTIONS} />
                <FormBool label="גנרטור" value={form.generator} onChange={setField('generator')} />
                <FormBool label="משאבת מים" value={form.water_pump} onChange={setField('water_pump')} />
                <FormBool label="כיבוי אש" value={form.fire_suppression} onChange={setField('fire_suppression')} />
                <FormBool label="אינטרקום" value={form.intercom} onChange={setField('intercom')} />
                <FormBool label="גג משותף" value={form.shared_roof} onChange={setField('shared_roof')} />
                <FormBool label="חדר כושר" value={form.gym} onChange={setField('gym')} />
                <FormBool label="בריכה" value={form.pool} onChange={setField('pool')} />
                <FormBool label="חדר דיירים" value={form.residents_room} onChange={setField('residents_room')} />
                <FormBool label="חברת ניהול" value={form.management_company} onChange={setField('management_company')} />
              </div>
            </div>

            {/* Fee */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">תעריף ועד בית</h4>
              <FormSelect
                label="שיטת חישוב"
                value={form.fee_mode}
                onChange={setField('fee_mode')}
                options={FEE_MODES}
              />
              {form.fee_mode === 'flat' && (
                <div className="mt-3">
                  <FormField label="תעריף קבוע (₪)" type="number" value={form.monthly_fee} onChange={setField('monthly_fee')} />
                </div>
              )}
              <FeeTiersEditor
                mode={form.fee_mode}
                tiers={form.fee_tiers}
                onChange={tiers => setForm(p => ({ ...p, fee_tiers: tiers }))}
              />
            </div>

            {/* Bank */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">פרטי בנק</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="שם בנק" value={form.bank_name} onChange={setField('bank_name')} />
                <FormField label="סניף" value={form.branch} onChange={setField('branch')} />
                <FormField label="מספר חשבון" value={form.account_number} onChange={setField('account_number')} />
                <FormField label="בעל חשבון" value={form.holder} onChange={setField('holder')} />
                <FormField label="מורשה חתימה" value={form.authorized_signer} onChange={setField('authorized_signer')} />
              </div>
            </div>

            {/* Other */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="הנחת חבר ועד (%)" type="number" value={form.board_member_discount} onChange={setField('board_member_discount')} />
              <FormField label="יתרה (₪)" type="number" value={form.balance} onChange={setField('balance')} />
            </div>

            <FormTextarea label="הערות" value={form.notes} onChange={setField('notes')} />

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'צור בניין'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Buildings
