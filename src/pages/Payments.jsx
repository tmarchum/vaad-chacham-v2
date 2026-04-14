import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { formatCurrency, formatDate, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import { CreditCard, Plus, Pencil, Trash2, CalendarPlus, BarChart3 } from 'lucide-react'

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' },
  { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },
  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },
  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' },
  { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' },
  { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' },
  { value: '12', label: 'דצמבר' },
]

const STATUS_MAP = {
  paid: { label: 'שולם', variant: 'success' },
  partial: { label: 'חלקי', variant: 'warning' },
  pending: { label: 'ממתין', variant: 'warning' },
  overdue: { label: 'באיחור', variant: 'danger' },
  unpaid: { label: 'לא שולם', variant: 'danger' },
}

const STATUS_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'paid', label: 'שולם' },
  { key: 'partial', label: 'חלקי' },
  { key: 'pending', label: 'ממתין' },
  { key: 'overdue', label: 'באיחור' },
  { key: 'unpaid', label: 'לא שולם' },
]

const PAYMENT_METHODS = [
  { value: 'העברה בנקאית', label: 'העברה בנקאית' },
  { value: 'אשראי', label: 'אשראי' },
  { value: 'מזומן', label: 'מזומן' },
  { value: 'צ׳ק', label: 'צ׳ק' },
  { value: 'הוראת קבע', label: 'הוראת קבע' },
]

const EMPTY_FORM = {
  unitId: '',
  amount: '',
  month: '',
  status: 'pending',
  paidAt: '',
  method: '',
}

function Payments() {
  const { buildings } = useBuildingContext()
  const { data: allPayments, create, update, remove, refresh, isSaving } = useCollection('payments')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailPayment, setDetailPayment] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [viewMode, setViewMode] = useState('monthly') // 'monthly' | 'yearly'

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  const unitMap = useMemo(() => {
    const map = {}
    allUnits.forEach((u) => { map[u.id] = u })
    return map
  }, [allUnits])

  // Resident name map: unit_id -> full name (primary resident)
  const residentMap = useMemo(() => {
    const map = {}
    allResidents.forEach(r => {
      if (r.is_primary || !map[r.unit_id]) {
        map[r.unit_id] = `${r.first_name || ''} ${r.last_name || ''}`.trim()
      }
    })
    return map
  }, [allResidents])

  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  // Units filtered by building for form select
  const filteredUnitsForForm = useMemo(() => {
    if (buildingFilter === 'all') return [...allUnits].sort(sortByUnitNumber)
    return allUnits.filter((u) => u.buildingId === buildingFilter).sort(sortByUnitNumber)
  }, [allUnits, buildingFilter])

  const unitOptions = useMemo(
    () => [...filteredUnitsForForm].sort(sortByUnitNumber).map((u) => ({
      value: u.id,
      label: `דירה ${u.unit_number || u.number} - ${u.ownerName || ''}`,
    })),
    [filteredUnitsForForm]
  )

  const allUnitOptions = useMemo(
    () => [...allUnits].sort(sortByUnitNumber).map((u) => ({
      value: u.id,
      label: `דירה ${u.unit_number || u.number} - ${u.ownerName || ''} (${buildingMap[u.buildingId]?.name || ''})`,
    })),
    [allUnits, buildingMap]
  )

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

  const monthKey = `${selectedYear}-${selectedMonth}`

  // Filtered units by building
  const buildingUnitIds = useMemo(() => {
    if (buildingFilter === 'all') return null
    return new Set(allUnits.filter((u) => u.buildingId === buildingFilter).map((u) => u.id))
  }, [allUnits, buildingFilter])

  const filtered = useMemo(() => {
    // Get payments for this month
    let monthPayments = allPayments.filter((p) => p.month === monthKey)
    if (buildingUnitIds) {
      monthPayments = monthPayments.filter((p) => buildingUnitIds.has(p.unitId))
    }

    // Build set of unit IDs that have payments
    const paidUnitIds = new Set(monthPayments.map((p) => p.unitId))

    // Get target units (filtered by building)
    const targetUnits = buildingUnitIds
      ? allUnits.filter((u) => buildingUnitIds.has(u.id))
      : allUnits

    // Create virtual "unpaid" entries for units without payments
    const unpaidEntries = targetUnits
      .filter((u) => !paidUnitIds.has(u.id))
      .map((u) => ({
        id: `unpaid-${u.id}`,
        unitId: u.id,
        buildingId: u.buildingId || u.building_id,
        amount: 0,
        month: monthKey,
        status: 'unpaid',
        paidAt: null,
        method: null,
        _virtual: true,
      }))

    let result = [...monthPayments, ...unpaidEntries]

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter)
    }

    // Sort by unit number
    result.sort((a, b) => {
      const ua = unitMap[a.unitId]
      const ub = unitMap[b.unitId]
      return parseInt(ua?.number || ua?.unit_number || '0', 10) - parseInt(ub?.number || ub?.unit_number || '0', 10)
    })

    return result
  }, [allPayments, allUnits, monthKey, buildingUnitIds, statusFilter, unitMap])

  // Summary
  const summary = useMemo(() => {
    const monthPayments = allPayments.filter((p) => {
      if (p.month !== monthKey) return false
      if (buildingUnitIds && !buildingUnitIds.has(p.unitId)) return false
      return true
    })
    const targetUnits = buildingUnitIds
      ? allUnits.filter((u) => buildingUnitIds.has(u.id))
      : allUnits
    const paidUnitIds = new Set(monthPayments.map((p) => p.unitId))
    const unpaid = targetUnits.filter((u) => !paidUnitIds.has(u.id)).length
    const collected = monthPayments.filter((p) => p.status === 'paid' || p.status === 'partial').reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const partial = monthPayments.filter((p) => p.status === 'partial').length
    const pending = monthPayments.filter((p) => p.status === 'pending').length
    const overdue = monthPayments.filter((p) => p.status === 'overdue').length
    return { collected, partial, pending, overdue, unpaid, total: monthPayments.length, totalUnits: targetUnits.length }
  }, [allPayments, allUnits, monthKey, buildingUnitIds])

  // Yearly cumulative gap per unit
  const yearlySummary = useMemo(() => {
    const targetUnits = buildingFilter === 'all'
      ? allUnits
      : allUnits.filter((u) => u.buildingId === buildingFilter)

    const yearPayments = allPayments.filter((p) => p.month && p.month.startsWith(selectedYear + '-'))

    // Count how many months have passed this year (for expected calculation)
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const totalMonths = String(currentYear) === selectedYear
      ? currentMonth
      : 12

    return [...targetUnits].sort(sortByUnitNumber).map((unit) => {
      const building = buildingMap[unit.buildingId || unit.building_id]
      const fee = calcUnitFee(unit, building)
      const expected = fee * totalMonths
      const unitPayments = yearPayments.filter((p) => p.unit_id === unit.id || p.unitId === unit.id)
      const collected = unitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const gap = expected - collected
      const paidMonths = unitPayments.filter((p) => p.status === 'paid').length
      const partialMonths = unitPayments.filter((p) => p.status === 'partial').length
      return { unit, fee, expected, collected, gap, totalMonths, paidMonths, partialMonths }
    })
  }, [allUnits, allPayments, selectedYear, buildingFilter, buildingMap, unitMap])

  const yearlyTotals = useMemo(() => {
    const expected = yearlySummary.reduce((s, r) => s + r.expected, 0)
    const collected = yearlySummary.reduce((s, r) => s + r.collected, 0)
    return { expected, collected, gap: expected - collected }
  }, [yearlySummary])

  const getUnitDisplay = (unitId) => {
    const unit = unitMap[unitId]
    if (!unit) return ''
    const name = residentMap[unitId] || unit.ownerName || ''
    const familyName = name.split(' ').slice(-1)[0] || ''
    return `דירה ${unit.unit_number || unit.number}${familyName ? ` - ${familyName}` : ''}`
  }

  const getOwnerName = (unitId) => {
    return residentMap[unitId] || unitMap[unitId]?.ownerName || ''
  }

  const getBuildingName = (unitId) => {
    const unit = unitMap[unitId]
    if (!unit) return ''
    return buildingMap[unit.buildingId]?.name || ''
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, month: monthKey })
    setFormOpen(true)
  }

  const openEdit = (p) => {
    setEditingId(p.id)
    setForm({
      unitId: p.unitId || '',
      amount: p.amount ?? '',
      month: p.month || monthKey,
      status: p.status || 'pending',
      paidAt: p.paidAt ? p.paidAt.slice(0, 10) : '',
      method: p.method || '',
    })
    setFormOpen(true)
    setDetailPayment(null)
  }

  const [formErrors, setFormErrors] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.unitId) errs.unitId = 'חובה לבחור דירה'
    if (!form.amount || isNaN(Number(form.amount))) errs.amount = 'חובה להזין סכום'
    if (!form.month) errs.month = 'חובה לבחור חודש'
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setFormErrors({})
    const unit = unitMap[form.unitId]
    const data = {
      ...form,
      amount: form.amount !== '' ? Number(form.amount) : null,
      paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : null,
      buildingId: unit?.buildingId || '',
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    setFormOpen(false)
  }

  const setField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setForm((prev) => {
      const next = { ...prev, [field]: val }
      // Auto-fill amount using building fee tiers when selecting unit
      if (field === 'unitId' && val) {
        const unit = unitMap[val]
        if (unit) {
          const building = buildingMap[unit.buildingId || unit.building_id]
          const fee = calcUnitFee(unit, building)
          next.amount = fee || ''
        }
      }
      return next
    })
  }

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  // Auto-create monthly payments for all units without a payment this month
  const handleCreateMonthly = () => {
    const targetUnits = buildingFilter === 'all'
      ? allUnits
      : allUnits.filter((u) => u.buildingId === buildingFilter)

    const existingUnitIds = new Set(
      allPayments.filter((p) => p.month === monthKey).map((p) => p.unitId)
    )

    let created = 0
    targetUnits.forEach((unit) => {
      if (!existingUnitIds.has(unit.id)) {
        const building = buildingMap[unit.buildingId || unit.building_id]
        const fee = calcUnitFee(unit, building)
        create({
          unitId: unit.id,
          buildingId: unit.buildingId || unit.building_id,
          amount: fee,
          month: monthKey,
          status: 'pending',
          paidAt: null,
          method: null,
        })
        created++
      }
    })
    if (created === 0) {
      alert('כל הדירות כבר מופיעות בחודש זה')
    }
  }

  const statusOptions = [
    { value: 'pending', label: 'ממתין' },
    { value: 'paid', label: 'שולם' },
    { value: 'overdue', label: 'באיחור' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">תשלומים</h1>
          <p className="text-sm text-[var(--text-secondary)]">{filtered.length} תשלומים</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'yearly' ? 'default' : 'outline'}
            onClick={() => setViewMode(viewMode === 'yearly' ? 'monthly' : 'yearly')}
          >
            <BarChart3 className="h-4 w-4" />
            סיכום שנתי
          </Button>
          {viewMode === 'monthly' && (
            <>
              <Button variant="outline" onClick={handleCreateMonthly}>
                <CalendarPlus className="h-4 w-4" />
                צור תשלומים חודשיים
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                תשלום חדש
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Month/Year selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        {viewMode === 'monthly' && (
          <FormSelect
            label="חודש"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={HEBREW_MONTHS}
            className="w-36"
          />
        )}
        <FormSelect
          label="שנה"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={yearOptions}
          className="w-28"
        />
      </div>

      {/* Building filter pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={buildingFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBuildingFilter('all')}
        >
          כל הבניינים
        </Button>
        {buildings.map((b) => (
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

      {viewMode === 'yearly' ? (
        <>
          {/* Yearly summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">צפי שנתי</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(yearlyTotals.expected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">נגבה בפועל</p>
                <p className="text-2xl font-bold text-[var(--success)]">{formatCurrency(yearlyTotals.collected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">פער מצטבר</p>
                <p className={`text-2xl font-bold ${yearlyTotals.gap > 0 ? 'text-red-500' : 'text-[var(--success)]'}`}>
                  {formatCurrency(yearlyTotals.gap)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Yearly per-unit table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">דירה</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">בעלים</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">חיוב חודשי</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">צפי ({yearlySummary[0]?.totalMonths || 0} חודשים)</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">נגבה</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">פער</th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">חודשים ששולמו</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlySummary.map((row) => (
                    <tr key={row.unit.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="p-3">דירה {row.unit.unit_number || row.unit.number}</td>
                      <td className="p-3">{row.unit.ownerName || ''}</td>
                      <td className="p-3">{formatCurrency(row.fee)}</td>
                      <td className="p-3">{formatCurrency(row.expected)}</td>
                      <td className="p-3">{formatCurrency(row.collected)}</td>
                      <td className="p-3">
                        <span className={row.gap > 0 ? 'text-red-500 font-medium' : 'text-[var(--success)]'}>
                          {row.gap > 0 ? `-${formatCurrency(row.gap)}` : formatCurrency(0)}
                        </span>
                      </td>
                      <td className="p-3">
                        {row.paidMonths}/{row.totalMonths}
                        {row.partialMonths > 0 && <span className="text-xs text-[var(--warning)] mr-1">({row.partialMonths} חלקי)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((sf) => (
              <Button
                key={sf.key}
                variant={statusFilter === sf.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(sf.key)}
              >
                {sf.label}
              </Button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">סה״כ נגבה</p>
                <p className="text-2xl font-bold text-[var(--success)]">{formatCurrency(summary.collected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">לא שולם</p>
                <p className="text-2xl font-bold text-red-500">{summary.unpaid}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">ממתינים לתשלום</p>
                <p className="text-2xl font-bold text-[var(--warning)]">{summary.pending}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-[var(--text-secondary)]">סה״כ דירות</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.totalUnits}</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="אין תשלומים"
              description="לא נמצאו תשלומים לחודש הנבחר"
              actionLabel="תשלום חדש"
              onAction={openCreate}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">דירה</th>
                      {buildingFilter === 'all' && <th className="text-right p-3 font-medium text-[var(--text-secondary)]">בניין</th>}
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">בעלים</th>
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">נדרש | בפועל</th>
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">תאריך תשלום</th>
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">אמצעי תשלום</th>
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">סטטוס</th>
                      <th className="text-right p-3 font-medium text-[var(--text-secondary)]">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const st = STATUS_MAP[p.status] || STATUS_MAP.pending
                      const isVirtual = p._virtual
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors ${isVirtual ? 'opacity-60' : 'cursor-pointer'}`}
                          onClick={() => !isVirtual && setDetailPayment(p)}
                        >
                          <td className="p-3">{getUnitDisplay(p.unitId)}</td>
                          {buildingFilter === 'all' && <td className="p-3 text-xs">{getBuildingName(p.unitId)}</td>}
                          <td className="p-3">{getOwnerName(p.unitId)}</td>
                          <td className="p-3">
                            {(() => {
                              const unit = unitMap[p.unitId]
                              const building = buildingMap[unit?.buildingId || unit?.building_id]
                              const fee = calcUnitFee(unit, building)
                              const paid = Number(p.amount) || 0
                              return (
                                <>
                                  <span className="font-medium">{formatCurrency(fee)}</span>
                                  <span className="text-xs text-[var(--text-secondary)] mr-1">נדרש</span>
                                  {!isVirtual && (
                                    <>
                                      <span className="mr-2">| {formatCurrency(paid)}</span>
                                      <span className="text-xs text-[var(--text-secondary)]">בפועל</span>
                                      {fee - paid > 0 && <span className="text-xs text-red-500 mr-1">(פער: {formatCurrency(fee - paid)})</span>}
                                    </>
                                  )}
                                </>
                              )
                            })()}
                          </td>
                          <td className="p-3">{p.paidAt ? formatDate(p.paidAt) : '-'}</td>
                          <td className="p-3">{p.method || '-'}</td>
                          <td className="p-3">
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </td>
                          <td className="p-3">
                            {!isVirtual ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingId(null)
                                  setForm({ ...EMPTY_FORM, unitId: p.unitId, month: monthKey })
                                  setFormOpen(true)
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={!!detailPayment}
        onOpenChange={() => setDetailPayment(null)}
        title={detailPayment ? `תשלום - ${getUnitDisplay(detailPayment.unitId)}` : ''}
        onEdit={() => openEdit(detailPayment)}
      >
        {detailPayment && (
          <>
            <DetailRow label="דירה" value={getUnitDisplay(detailPayment.unitId)} />
            <DetailRow label="בניין" value={getBuildingName(detailPayment.unitId)} />
            <DetailRow label="בעלים" value={getOwnerName(detailPayment.unitId)} />
            <DetailRow label="סכום" value={formatCurrency(detailPayment.amount || 0)} />
            <DetailRow label="חודש" value={detailPayment.month} />
            <DetailRow label="סטטוס" value={STATUS_MAP[detailPayment.status]?.label} />
            <DetailRow label="תאריך תשלום" value={detailPayment.paidAt ? formatDate(detailPayment.paidAt) : '-'} />
            <DetailRow label="אמצעי תשלום" value={detailPayment.method || '-'} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailPayment)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDetailPayment(null)
                  setDeleteTarget(detailPayment)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                מחיקה
              </Button>
            </div>
          </>
        )}
      </DetailModal>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? `תשלום של ${getOwnerName(deleteTarget.unitId)}` : ''}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת תשלום' : 'תשלום חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormSelect
              label="דירה *"
              value={form.unitId}
              onChange={setField('unitId')}
              options={allUnitOptions}
              placeholder="בחר דירה"
              error={formErrors.unitId}
            />
            <FormField
              label="סכום *"
              type="number"
              value={form.amount}
              onChange={setField('amount')}
              error={formErrors.amount}
            />
            <FormField
              label="חודש (YYYY-MM) *"
              value={form.month}
              onChange={setField('month')}
              placeholder="2026-03"
              error={formErrors.month}
            />
            <FormSelect
              label="סטטוס"
              value={form.status}
              onChange={setField('status')}
              options={statusOptions}
            />
            <FormField
              label="תאריך תשלום"
              type="date"
              value={form.paidAt}
              onChange={setField('paidAt')}
            />
            <FormSelect
              label="אמצעי תשלום"
              value={form.method}
              onChange={setField('method')}
              options={PAYMENT_METHODS}
              placeholder="בחר אמצעי"
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'צור תשלום'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={isSaving}>
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Payments
