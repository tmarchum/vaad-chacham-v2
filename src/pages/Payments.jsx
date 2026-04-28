import { useState, useMemo } from 'react'
import { useCollection, useRealtimeCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { FilterPills } from '@/components/common/FilterPills'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { formatCurrency, formatDate, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import { CreditCard, Plus, Pencil, Trash2, CalendarPlus, BarChart3, Users, AlertTriangle, Wallet, Download } from 'lucide-react'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'

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
  amount_paid: '',
}

function exportToCSV(filename, headers, rows) {
  const BOM = '﻿'
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))]
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename + '.csv'; a.click()
  URL.revokeObjectURL(url)
}

function Payments() {
  const { buildings, selectedBuilding } = useBuildingContext()
  const { data: allPayments, create, update, remove, bulkCreate, refresh, isSaving, isLoading } = useRealtimeCollection('payments',
    selectedBuilding ? { building_id: selectedBuilding.id } : {}
  )
  const { data: allUnits } = useCollection('units',
    selectedBuilding ? { building_id: selectedBuilding.id } : {}
  )
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

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await remove(deleteTarget.id)
      } catch (err) {
        console.error('Failed to delete payment:', err)
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה במחיקת תשלום', type: 'error' } }))
      }
      setDeleteTarget(null)
    }
  }

  // Auto-create monthly payments for all units without a payment this month
  const handleCreateMonthly = async () => {
    const targetUnits = buildingFilter === 'all'
      ? allUnits
      : allUnits.filter((u) => u.buildingId === buildingFilter)

    const existingUnitIds = new Set(
      allPayments.filter((p) => p.month === monthKey).map((p) => p.unitId)
    )

    const paymentArray = targetUnits
      .filter((unit) => !existingUnitIds.has(unit.id))
      .map((unit) => ({
        unit_id: unit.id,
        building_id: unit.buildingId || unit.building_id,
        month: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`,
        amount: calcUnitFee(unit, buildingMap[unit.buildingId || unit.building_id]),
        status: 'unpaid',
        owner_name: getOwnerName(unit.id),
      }))

    if (paymentArray.length === 0) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'כל הדירות כבר מופיעות בחודש זה', type: 'info' } }))
      return
    }

    await bulkCreate(paymentArray)
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `נוצרו ${paymentArray.length} תשלומים חדשים`, type: 'success' } }))
  }

  const statusOptions = [
    { value: 'pending', label: 'ממתין' },
    { value: 'paid', label: 'שולם' },
    { value: 'partial', label: 'שולם חלקית' },
    { value: 'overdue', label: 'באיחור' },
  ]

  const handleExport = () => {
    if (viewMode === 'yearly') {
      const headers = ['דירה', 'בעלים', 'חיוב חודשי', 'צפי שנתי', 'נגבה', 'פער', 'חודשים ששולמו']
      const rows = yearlySummary.map((r) => [
        `דירה ${r.unit.unit_number || r.unit.number}`,
        r.unit.ownerName || '',
        r.fee,
        r.expected,
        r.collected,
        r.gap,
        `${r.paidMonths}/${r.totalMonths}`,
      ])
      exportToCSV(`תשלומים-שנתי-${selectedYear}`, headers, rows)
    } else {
      const headers = ['דירה', 'בעלים', 'בניין', 'סכום', 'חיוב חודשי', 'סטטוס', 'תאריך תשלום', 'אמצעי תשלום']
      const rows = filtered.filter((p) => !p._virtual).map((p) => [
        `דירה ${unitMap[p.unitId]?.unit_number || unitMap[p.unitId]?.number || ''}`,
        getOwnerName(p.unitId),
        getBuildingName(p.unitId),
        p.amount ?? 0,
        calcUnitFee(unitMap[p.unitId], buildingMap[unitMap[p.unitId]?.buildingId || unitMap[p.unitId]?.building_id]),
        STATUS_MAP[p.status]?.label || p.status,
        p.paidAt ? p.paidAt.slice(0, 10) : '',
        p.method || '',
      ])
      exportToCSV(`תשלומים-${monthKey}`, headers, rows)
    }
  }

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={CreditCard} iconColor="blue" title="תשלומים" />
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
      <PageHeader
        icon={CreditCard}
        iconColor="blue"
        title="תשלומים"
        subtitle={`${filtered.length} תשלומים`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              ייצוא CSV
            </Button>
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
        }
      />

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
              <table className="premium-table w-full text-sm">
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
          <FilterPills
            options={STATUS_FILTERS.map(f => ({ key: f.key, label: f.label }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="סה״כ נגבה" value={formatCurrency(summary.collected)} icon={CreditCard} color="emerald" />
            <StatCard label="לא שולם" value={String(summary.unpaid)} icon={AlertTriangle} color="red" />
            <StatCard label="ממתינים" value={String(summary.pending)} icon={Wallet} color="amber" />
            <StatCard label="סה״כ דירות" value={String(summary.totalUnits)} icon={Users} color="blue" />
          </div>

          {/* Payment Cards */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="אין תשלומים"
              description="לא נמצאו תשלומים לחודש הנבחר"
              actionLabel="תשלום חדש"
              onAction={openCreate}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const st = STATUS_MAP[p.status] || STATUS_MAP.pending
                const isVirtual = p._virtual
                const unit = unitMap[p.unitId]
                const building = buildingMap[unit?.buildingId || unit?.building_id]
                const fee = calcUnitFee(unit, building)
                const paid = Number(p.amount) || 0
                const pctPaid = fee > 0 ? Math.min(100, Math.round((paid / fee) * 100)) : 0
                const unitNumber = unit?.unit_number || unit?.number || ''
                const ownerName = getOwnerName(p.unitId)
                const buildingName = buildingFilter === 'all' ? getBuildingName(p.unitId) : ''

                // Gradient colors based on status
                const gradientMap = {
                  paid: 'from-emerald-500 to-emerald-600',
                  partial: 'from-amber-400 to-amber-500',
                  pending: 'from-amber-400 to-amber-500',
                  overdue: 'from-red-500 to-red-600',
                  unpaid: 'from-slate-400 to-slate-500',
                }
                const circleGradient = gradientMap[p.status] || gradientMap.pending

                // Status dot colors
                const dotColorMap = {
                  paid: 'bg-emerald-500',
                  partial: 'bg-amber-500',
                  pending: 'bg-amber-500',
                  overdue: 'bg-red-500',
                  unpaid: 'bg-red-500',
                }
                const dotColor = dotColorMap[p.status] || dotColorMap.pending

                // Status text colors
                const textColorMap = {
                  paid: 'text-emerald-700',
                  partial: 'text-amber-700',
                  pending: 'text-amber-700',
                  overdue: 'text-red-700',
                  unpaid: 'text-red-700',
                }
                const statusTextColor = textColorMap[p.status] || textColorMap.pending

                // Progress bar color
                const barColorMap = {
                  paid: 'bg-emerald-500',
                  partial: 'bg-amber-500',
                  pending: 'bg-amber-400',
                  overdue: 'bg-red-500',
                  unpaid: 'bg-slate-300',
                }
                const barColor = barColorMap[p.status] || barColorMap.pending

                return (
                  <div
                    key={p.id}
                    className={`group flex items-center gap-4 p-4 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all ${
                      isVirtual ? 'opacity-60 border-dashed border-[var(--border)]' : 'border-[var(--border)] cursor-pointer'
                    }`}
                    onClick={() => !isVirtual && setDetailPayment(p)}
                  >
                    {/* Unit number circle */}
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${circleGradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                      {unitNumber}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                          דירה {unitNumber}
                        </span>
                        {buildingName && (
                          <span className="text-xs text-[var(--text-muted)]">{buildingName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)]">{ownerName}</span>
                      </div>
                    </div>

                    {/* Amount section */}
                    <div className="text-left min-w-[120px]">
                      <div className="text-[15px] font-bold text-[var(--text-primary)]">
                        {isVirtual ? formatCurrency(0) : formatCurrency(paid)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">מתוך {formatCurrency(fee)}</div>
                      <div className="h-1 w-full rounded-full bg-slate-100 mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: (isVirtual ? 0 : pctPaid) + '%' }}
                        />
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className={`text-[12px] font-medium ${statusTextColor}`}>{st.label}</span>
                    </div>

                    {/* Actions (visible on hover) */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      {!isVirtual ? (
                        <>
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
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(null)
                            setForm({ ...EMPTY_FORM, unitId: p.unitId, month: monthKey })
                            setFormOpen(true)
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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
        <DialogContent className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
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
            {form.status === 'partial' && (
              <FormField
                label="סכום ששולם (₪)"
                type="number"
                value={form.amount_paid || ''}
                onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))}
                placeholder="סכום שהתקבל בפועל"
              />
            )}
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
