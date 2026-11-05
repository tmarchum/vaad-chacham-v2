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
import { CreditCard, Plus, Pencil, Trash2, CalendarPlus, AlertTriangle, Wallet, Download, ChevronRight, ChevronLeft, CalendarDays, CheckCircle2, MessageCircle, PieChart, TrendingUp } from 'lucide-react'
import { TabGroup } from '@/components/ui/tabs'
import { SearchBar } from '@/components/common/SearchBar'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { waLink } from '@/lib/phone'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS, HEBREW_MONTHS as MONTH_NAMES } from '@/lib/constants'
import { toast, toastError } from '@/lib/toast'

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
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allPayments, create, update, remove, bulkCreate, isSaving, isLoading } = useRealtimeCollection('payments', scope)
  const { data: allUnits } = useCollection('units', scope)
  // Active residents of this building only (useUnitDirectory) — the old
  // global unit_residents load also showed residents who had moved out.
  const dir = useUnitDirectory(selectedBuilding?.id)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState('all')
  // Data is scoped to the sidebar's building; the page-level building pills are gone.
  const buildingFilter = 'all'
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailPayment, setDetailPayment] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [viewMode, setViewMode] = useState('monthly') // 'monthly' | 'yearly'
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const unitMap = useMemo(() => {
    const map = {}
    allUnits.forEach((u) => { map[u.id] = u })
    return map
  }, [allUnits])

  const residentMap = useMemo(
    () => Object.fromEntries(dir.units.map((u) => [u.id, u.name])),
    [dir.units]
  )

  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  const allUnitOptions = useMemo(
    () => [...allUnits].sort(sortByUnitNumber).map((u) => ({
      value: u.id,
      label: dir.byId[u.id]?.label || `דירה ${u.number}`,
    })),
    [allUnits, dir.byId]
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

    // Status filter ('__debtors' is applied by the view, not here)
    if (statusFilter !== 'all' && statusFilter !== '__debtors') {
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
    // residentMap already holds the family name — no first names in payments.
    const familyName = residentMap[unitId] || ''
    return `דירה ${unit.unit_number || unit.number}${familyName ? ` — ${familyName}` : ''}`
  }

  const getOwnerName = (unitId) => residentMap[unitId] || ''

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
        toastError('שגיאה במחיקת תשלום')
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
      }))

    if (paymentArray.length === 0) {
      toast('כל הדירות כבר מופיעות בחודש זה', 'info')
      return
    }

    await bulkCreate(paymentArray)
    toast(`נוצרו ${paymentArray.length} תשלומים חדשים`)
  }

  const statusOptions = [
    { value: 'pending', label: 'ממתין' },
    { value: 'paid', label: 'שולם' },
    { value: 'partial', label: 'שולם חלקית' },
    { value: 'overdue', label: 'באיחור' },
  ]

  const handleExport = () => {
    if (viewMode === 'yearly') {
      const headers = ['דירה', 'שם משפחה', 'חיוב חודשי', 'צפי שנתי', 'נגבה', 'פער', 'חודשים ששולמו']
      const rows = yearlySummary.map((r) => [
        `דירה ${r.unit.unit_number || r.unit.number}`,
        getOwnerName(r.unit.id),
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

  // ── Civic Blue view model ──
  const monthIdx = Number(selectedMonth) - 1
  const stepMonth = (delta) => {
    const d = new Date(Number(selectedYear), monthIdx + delta, 1)
    setSelectedMonth(String(d.getMonth() + 1).padStart(2, '0'))
    setSelectedYear(String(d.getFullYear()))
  }
  const expectedMonth = allUnits.reduce((s2, u) => s2 + calcUnitFee(u, buildingMap[u.buildingId || u.building_id]), 0)
  const collectedPct = expectedMonth > 0 ? Math.round((summary.collected / expectedMonth) * 1000) / 10 : 0
  const paidCount = filtered.filter((p) => p.status === 'paid').length
  const debtorRows = allPayments.filter((p) => p.month === monthKey && p.status !== 'paid')
    .concat(filtered.filter((p) => p._virtual))
  const debtSum = debtorRows.reduce((s2, p) => {
    const u = unitMap[p.unitId]
    const fee = calcUnitFee(u, buildingMap[u?.buildingId || u?.building_id])
    return s2 + (p.status === 'partial' ? Math.max(0, fee - (Number(p.amount) || 0)) : (Number(p.amount) || fee))
  }, 0)
  const partialRows = allPayments.filter((p) => p.month === monthKey && p.status === 'partial')
  const partialRemaining = partialRows.reduce((s2, p) => {
    const u = unitMap[p.unitId]
    return s2 + Math.max(0, calcUnitFee(u, buildingMap[u?.buildingId || u?.building_id]) - (Number(p.amount) || 0))
  }, 0)
  const yearPct = yearlyTotals.expected > 0 ? Math.round((yearlyTotals.collected / yearlyTotals.expected) * 1000) / 10 : 0

  // unit → month → status, for the 12-cell yearly strip
  const yearGrid = {}
  allPayments.forEach((p) => {
    if (!p.month?.startsWith(selectedYear + '-')) return
    ;(yearGrid[p.unitId] ||= {})[Number(p.month.slice(5, 7))] = p.status
  })
  const nowY = new Date().getFullYear()
  const nowM = new Date().getMonth() + 1
  const cellColor = (unitId, m) => {
    const st = yearGrid[unitId]?.[m]
    const future = Number(selectedYear) > nowY || (Number(selectedYear) === nowY && m > nowM)
    if (future) return 'bg-[var(--surface-container)]'
    if (st === 'paid') return 'bg-[var(--success)]'
    if (st === 'partial' || st === 'pending') return 'bg-amber-400'
    if (st === 'overdue' || st === 'unpaid') return 'bg-[var(--danger)]'
    return 'bg-[var(--outline-variant)]/50'
  }

  const [tab, setTab] = [viewMode === 'yearly' ? 'yearly' : statusFilter === '__debtors' ? 'debtors' : 'month', (k) => {
    if (k === 'yearly') { setViewMode('yearly') } else { setViewMode('monthly'); setStatusFilter(k === 'debtors' ? '__debtors' : 'all') }
  }]
  const [tableQuery, setTableQuery] = [search, setSearch]
  const rows = (statusFilter === '__debtors'
    ? filtered.filter((p) => p.status !== 'paid')
    : statusFilter === 'all' ? filtered : filtered
  ).filter((p) => {
    if (typeFilter !== 'all' && (dir.byId[p.unitId]?.type || 'owned') !== typeFilter) return false
    if (!tableQuery) return true
    const u = dir.byId[p.unitId]
    return String(u?.number) === tableQuery.trim() || (u?.name || '').includes(tableQuery.trim())
  })

  const markPaid = async (p) => {
    const unit = unitMap[p.unitId]
    const fee = calcUnitFee(unit, buildingMap[unit?.buildingId || unit?.building_id])
    if (p._virtual) {
      await create({ unitId: p.unitId, buildingId: unit?.buildingId || unit?.building_id, month: monthKey, amount: fee, status: 'paid', paidAt: new Date().toISOString() })
    } else {
      await update(p.id, { status: 'paid', amount: p.status === 'partial' ? fee : (Number(p.amount) || fee), paidAt: new Date().toISOString() })
    }
  }
  const statusSel = 'h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text-primary)]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">
            גבייה — {viewMode === 'yearly' ? `שנת ${selectedYear}` : `${MONTH_NAMES[monthIdx]} ${selectedYear}`}
          </h1>
          <div className="flex items-center h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)]">
            <button onClick={() => (viewMode === 'yearly' ? setSelectedYear(String(Number(selectedYear) - 1)) : stepMonth(-1))} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="הקודם"><ChevronRight className="h-4 w-4" /></button>
            <span className="flex items-center gap-1.5 px-2 text-[13px] font-semibold text-[var(--text-primary)] num-tabular">
              <CalendarDays className="h-4 w-4 text-[var(--primary)]" />
              {viewMode === 'yearly' ? selectedYear : `${MONTH_NAMES[monthIdx]} ${selectedYear}`}
            </span>
            <button onClick={() => (viewMode === 'yearly' ? setSelectedYear(String(Number(selectedYear) + 1)) : stepMonth(1))} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="הבא"><ChevronLeft className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" />ייצוא לאקסל</Button>
          {viewMode === 'monthly' && (
            <>
              <Button variant="outline" onClick={openCreate}><Plus className="h-4 w-4" />תשלום ידני</Button>
              <Button onClick={handleCreateMonthly}><CalendarPlus className="h-4 w-4" />הפקת חיוב לחודש</Button>
            </>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="נגבה החודש" icon={Wallet} color="emerald" value={formatCurrency(summary.collected)}
          note={<span className="px-2 py-0.5 rounded-full bg-[var(--success-light)] text-[var(--success)]">{collectedPct}%</span>}
          sub={`מתוך ${formatCurrency(expectedMonth)} • ${paidCount} מתוך ${summary.totalUnits} דירות שילמו`}
          progress={collectedPct} />
        <StatCard label="חייבים וטרם שילמו" icon={AlertTriangle} color={debtSum > 0 ? 'red' : 'emerald'} value={formatCurrency(debtSum)}
          note={debtorRows.length ? <span className="px-2 py-0.5 rounded-full bg-[var(--danger-light)] text-[var(--danger)]">{debtorRows.length} דירות</span> : null}
          sub="חוב חודשי פתוח"
          footer={<button onClick={() => setTab('debtors')} className="text-[var(--primary)] font-semibold hover:underline">להצגת החייבים ושליחת תזכורות ←</button>} />
        <StatCard label="תשלומים חלקיים" icon={PieChart} color="amber" value={formatCurrency(partialRemaining)}
          note={partialRows.length ? <span className="px-2 py-0.5 rounded-full bg-[var(--warning-light)] text-[var(--warning)]">{partialRows.length} בהסדר</span> : null}
          sub="יתרה פתוחה בתשלומים חלקיים" />
        <StatCard label={`גבייה שנתית מצטברת (${selectedYear})`} icon={TrendingUp} color="blue" value={formatCurrency(yearlyTotals.collected)}
          note={<span className="px-2 py-0.5 rounded-full bg-[var(--surface-variant)] text-[var(--primary-dark)]">{yearPct}%</span>}
          sub={`מתוך ${formatCurrency(yearlyTotals.expected)} צפויים`} />
      </div>

      {/* Tabs + filters */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <TabGroup
            tabs={[
              { key: 'month', label: 'חודש נוכחי', count: summary.totalUnits },
              { key: 'yearly', label: `מבט שנתי ומפת חום ${selectedYear}` },
              { key: 'debtors', label: 'חייבים', count: debtorRows.length },
            ]}
            activeTab={tab}
            onChange={setTab}
          />
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] flex-wrap">
            <span className="font-semibold">מקרא:</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--success)]" />שולם</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />חלקי/ממתין</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--danger)]" />באיחור</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--surface-container)] border border-[var(--border)]" />עתידי</span>
          </div>
        </div>
        {viewMode === 'monthly' && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar value={tableQuery} onChange={setTableQuery} placeholder="חיפוש לפי שם דייר או מספר דירה..." className="flex-1 min-w-[220px]" />
            {tab === 'month' && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={statusSel} aria-label="סטטוס תשלום">
                {STATUS_FILTERS.map((f2) => <option key={f2.key} value={f2.key}>{f2.key === 'all' ? 'סטטוס תשלום: הכל' : f2.label}</option>)}
              </select>
            )}
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={statusSel} aria-label="סוג דייר">
              <option value="all">סוג דייר: הכל</option>
              <option value="owned">בעלים</option>
              <option value="rented">שוכרים</option>
            </select>
          </div>
        )}
      </div>

      {viewMode === 'yearly' ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>דירה</th><th>דייר</th><th>חיוב חודשי</th><th>מפת {selectedYear} (12 חודשים)</th><th>צפי ({yearlySummary[0]?.totalMonths || 0} ח׳)</th><th>נגבה</th><th>פער</th>
                </tr>
              </thead>
              <tbody>
                {yearlySummary.map((row) => {
                  const u = dir.byId[row.unit.id]
                  return (
                    <tr key={row.unit.id}>
                      <td className="whitespace-nowrap"><span className="text-[15px] font-bold num-tabular">{row.unit.number}</span>{row.unit.floor != null && <span className="block text-[11px] text-[var(--text-muted)]">קומה {row.unit.floor}</span>}</td>
                      <td className="whitespace-nowrap">{u?.name || <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="whitespace-nowrap num-tabular">{formatCurrency(row.fee)}</td>
                      <td>
                        <div className="flex gap-0.5" dir="rtl">
                          {Array.from({ length: 12 }, (_, i) => (
                            <span key={i} title={`${MONTH_NAMES[i]}`} className={`h-4 w-3 rounded-[2px] ${cellColor(row.unit.id, i + 1)}`} />
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap num-tabular">{formatCurrency(row.expected)}</td>
                      <td className="whitespace-nowrap num-tabular text-[var(--success)] font-semibold">{formatCurrency(row.collected)}</td>
                      <td className="whitespace-nowrap num-tabular">
                        <span className={row.gap > 0 ? 'text-[var(--danger)] font-bold' : 'text-[var(--success)]'}>{row.gap > 0 ? `-${formatCurrency(row.gap)}` : formatCurrency(0)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title={tab === 'debtors' ? 'אין חייבים החודש 🎉' : 'אין תשלומים'} description={tab === 'debtors' ? 'כל הדירות שילמו' : 'לא נמצאו תשלומים לחודש הנבחר'} />
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>דירה וקומה</th><th>שם דייר וסיווג</th><th className="!text-left">סכום חודשי</th><th>סטטוס תשלום</th><th>מועד / אסמכתא</th><th>אמצעי תשלום</th><th>מפת {selectedYear}</th><th className="!text-center">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = STATUS_MAP[p.status] || STATUS_MAP.pending
                  const unit = unitMap[p.unitId]
                  const u = dir.byId[p.unitId]
                  const fee = calcUnitFee(unit, buildingMap[unit?.buildingId || unit?.building_id])
                  const late = p.status === 'overdue' || p.status === 'unpaid'
                  const msg = `שלום${u?.name ? ' ' + u.name : ''}, תזכורת מוועד הבית: דמי הוועד לחודש ${MONTH_NAMES[monthIdx]} (${formatCurrency(fee)}) טרם התקבלו. תודה 🙏`
                  return (
                    <tr key={p.id} className={late ? '!bg-[var(--danger-light)]/25' : ''} onClick={() => !p._virtual && setDetailPayment(p)} style={{ cursor: p._virtual ? 'default' : 'pointer' }}>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`h-7 min-w-7 px-1 rounded-[var(--radius)] flex items-center justify-center text-[13px] font-bold num-tabular ${late ? 'bg-[var(--danger-light)] text-[var(--danger)]' : 'bg-[var(--surface-container)] text-[var(--primary-dark)]'}`}>{unit?.number}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{unit?.floor != null && unit.floor !== '' ? `קומה ${unit.floor}` : ''}{unit?.rooms ? ` • ${unit.rooms} חד׳` : ''}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="text-[13px] font-semibold">{u?.name || <span className="text-[var(--text-muted)] font-normal">ללא דייר רשום</span>}</span>
                        <span className="mr-2 px-1.5 py-0.5 rounded bg-[var(--surface-container)] text-[var(--text-secondary)] text-[11px]">{u?.type === 'rented' ? 'שוכר' : 'בעלים'}</span>
                      </td>
                      <td className="whitespace-nowrap !text-left">
                        <span className={`text-[15px] font-bold num-tabular ${late ? 'text-[var(--danger)]' : ''}`}>{formatCurrency(p._virtual ? fee : (Number(p.amount) || 0))}</span>
                        {p.status === 'partial' && <span className="block text-[11px] text-[var(--warning)]">יתרה: {formatCurrency(Math.max(0, fee - (Number(p.amount) || 0)))}</span>}
                      </td>
                      <td className="whitespace-nowrap"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="whitespace-nowrap text-[12px]">
                        {p.paidAt ? <span className="num-tabular">{formatDate(p.paidAt)}</span> : <span className={late ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-muted)]'}>טרם שולם</span>}
                      </td>
                      <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)]">{p.method || '—'}</td>
                      <td>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 12 }, (_, i) => <span key={i} title={MONTH_NAMES[i]} className={`h-3.5 w-2.5 rounded-[2px] ${cellColor(p.unitId, i + 1)}`} />)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {p.status !== 'paid' && (
                            <button onClick={() => markPaid(p)} title="סמן כשולם" className="h-8 px-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--success-light)] text-[var(--success)] text-[11px] font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />שולם
                            </button>
                          )}
                          {p.status !== 'paid' && u?.phone && (
                            <a href={waLink(u.phone, msg) || '#'} target="_blank" rel="noopener noreferrer" title="תזכורת בוואטסאפ" className="h-8 px-2 rounded-[var(--radius)] bg-[var(--success)] text-white text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-90">
                              <MessageCircle className="h-3.5 w-3.5" />תזכורת
                            </a>
                          )}
                          {!p._virtual && (
                            <>
                              <button onClick={() => openEdit(p)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeleteTarget(p)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
            מציג {rows.length} מתוך {summary.totalUnits} דירות בבניין
          </div>
        </div>
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
