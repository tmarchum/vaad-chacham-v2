import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { Building2, Plus, Pencil, Trash2, X } from 'lucide-react'

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
        <div key={idx} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 space-y-2">
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
            <button type="button" onClick={() => removeTier(idx)} className="text-[var(--text-muted)] hover:text-red-500 mt-4 shrink-0">
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

// ── Component ─────────────────────────────────────────────────────────────────
function Buildings() {
  const { data: buildings, create, update, remove, isSaving, isLoading } = useCollection('buildings')
  const { refreshBuildings } = useBuildingContext()
  const { data: allUnits } = useCollection('units')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailBuilding, setDetailBuilding] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const filtered = useMemo(() => {
    if (!search) return buildings
    const q = search.toLowerCase()
    return buildings.filter(b =>
      b.name?.toLowerCase().includes(q) ||
      b.street?.toLowerCase().includes(q) ||
      b.city?.toLowerCase().includes(q)
    )
  }, [buildings, search])

  const unitCountMap = useMemo(() => {
    const m = {}
    allUnits.forEach(u => { m[u.buildingId || u.building_id] = (m[u.buildingId || u.building_id] || 0) + 1 })
    return m
  }, [allUnits])

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

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
      await refreshBuildings()
      setDeleteTarget(null)
    }
  }

  const FEE_MODES = [
    { value: 'flat', label: 'סכום קבוע לכל דירה' },
    { value: 'by_rooms', label: 'לפי מספר חדרים' },
    { value: 'by_sqm', label: 'לפי מ"ר' },
  ]

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Building2} iconColor="slate" title="בניינים" />
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
      <PageHeader
        icon={Building2}
        iconColor="slate"
        title="בניינים"
        subtitle={`${buildings.length} בניינים`}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" />בניין חדש</Button>}
      />

      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם או כתובת..." />

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="אין בניינים"
          description={search ? 'לא נמצאו תוצאות' : 'הוסף בניין ראשון כדי להתחיל'}
          actionLabel={!search ? 'הוסף בניין' : undefined} onAction={!search ? openCreate : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(b => {
            const unitCount = unitCountMap[b.id] || b.total_units || b.totalUnits || 0
            const address = buildAddress(b)
            const fee = feeSummary(b)
            const initial = (b.name || '?').charAt(0)

            return (
              <div
                key={b.id}
                className="group relative rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer overflow-hidden"
                onClick={() => setDetailBuilding(b)}
              >
                {/* Top gradient accent bar */}
                <div className="h-1 w-full bg-gradient-to-l from-blue-500 to-indigo-600" />

                <div className="p-5">
                  <div className="flex items-start gap-4 mb-4">
                    {/* Building gradient circle */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm">
                      {initial}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{b.name}</h3>
                      {b.alias && <p className="text-xs text-[var(--text-muted)]">{b.alias}</p>}
                      {address && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{address}</p>}
                    </div>

                    {/* Hover-reveal actions */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeleteTarget(b) }}>
                        <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                      </Button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[var(--text-secondary)]">{unitCount} דירות</span>
                    </div>
                    {b.floors && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-[var(--text-secondary)]">{b.floors} קומות</span>
                      </div>
                    )}
                    {fee && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[var(--text-secondary)]">ועד: {fee}</span>
                      </div>
                    )}
                    {b.elevators > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-[var(--text-secondary)]">{b.elevators} מעליות</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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
