import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { SearchBar } from '@/components/common/SearchBar'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { HEBREW_MONTHS } from '@/lib/constants'
import { TrendingUp, TrendingDown, BarChart2, Users, Wrench, PiggyBank, Download, Printer, Scale, CalendarDays, Wallet, Timer, CheckCircle2, Building2, Gauge } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'financial', label: 'כספי', icon: BarChart2 },
  { key: 'residents', label: 'דיירים', icon: Users },
  { key: 'maintenance', label: 'תחזוקה', icon: Wrench },
  { key: 'budget', label: 'תקציב', icon: PiggyBank },
]

const PERIODS = [
  { key: 'this_month', label: 'החודש' },
  { key: 'last_3', label: '3 חודשים' },
  { key: 'this_year', label: 'השנה' },
  { key: 'all', label: 'הכל' },
  { key: 'custom', label: 'טווח מותאם' },
]

// Same categorical palette the Expenses page uses for its breakdown.
const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b', '#ec4899']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inPeriod(dateStr, period, customFrom = '', customTo = '') {
  if (!dateStr || period === 'all') return true
  const d = new Date(dateStr)
  const now = new Date()
  if (period === 'custom') {
    if (!customFrom && !customTo) return true
    const from = customFrom ? new Date(customFrom) : null
    const to = customTo ? new Date(customTo + 'T23:59:59') : null
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  if (period === 'this_month')
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'last_3') {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    return d >= cutoff
  }
  if (period === 'this_year') return d.getFullYear() === now.getFullYear()
  return true
}

function getMonthKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthLabel(key) {
  const [year, month] = key.split('-')
  return `${HEBREW_MONTHS[parseInt(month, 10) - 1]} ${year}`
}

function getLast6MonthKeys() {
  const keys = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    keys.push(`${y}-${m}`)
  }
  return keys
}

function sumBy(arr, key) {
  return arr.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
}

function diffDays(start, end) {
  if (!start || !end) return null
  const a = new Date(start)
  const b = new Date(end)
  if (isNaN(a) || isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 86400000))
}

function exportToCSV(filename, headers, rows) {
  const escape = (val) => {
    const str = String(val ?? '')
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }
  const lines = [headers.map(escape).join(',')]
  rows.forEach((row) => lines.push(row.map(escape).join(',')))
  const bom = '﻿'
  const csv = bom + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const tone = (n) => (n >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')

function RateChip({ rate }) {
  const cls = rate >= 80
    ? 'bg-[var(--success-light)] text-[var(--success)]'
    : rate >= 50
      ? 'bg-[var(--warning-light)] text-[var(--warning)]'
      : 'bg-[var(--danger-light)] text-[var(--danger)]'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold num-tabular ${cls}`}>{rate}%</span>
}

function BarRow({ label, valueText, pct, color }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="truncate font-medium text-[var(--text-primary)]">{label}</span>
        </span>
        <span className="shrink-0 num-tabular">{valueText}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  )
}

function TableShell({ children }) {
  return <div className="overflow-x-auto">{children}</div>
}

// ---------------------------------------------------------------------------
// Tab: Financial
// ---------------------------------------------------------------------------

function FinancialTab({ payments, expenses, buildingId, filteredExpenses, periodLabel }) {
  // Monthly breakdown (last 6 months)
  const monthlyRows = useMemo(() => {
    return getLast6MonthKeys().map((key) => {
      const monthPayments = payments.filter((p) => {
        const matchBuilding = !buildingId || buildingId === 'all' || p.buildingId === buildingId
        return matchBuilding && getMonthKey(p.status === 'paid' ? p.paidAt : p.month) === key
      })
      const monthPaid = monthPayments.filter((p) => p.status === 'paid')
      const income = sumBy(monthPaid, 'amount')
      const expected = sumBy(monthPayments, 'amount')
      const rate = expected > 0 ? Math.round((income / expected) * 100) : 0

      const monthExpenses = expenses.filter((e) => {
        const matchBuilding = !buildingId || buildingId === 'all' || e.buildingId === buildingId
        return matchBuilding && getMonthKey(e.date) === key
      })
      const expenseSum = sumBy(monthExpenses, 'amount')
      const net = income - expenseSum

      return { key, income, expenses: expenseSum, net, rate }
    })
  }, [payments, expenses, buildingId])

  // Expense by category
  const expenseByCategory = useMemo(() => {
    const map = {}
    filteredExpenses.forEach((e) => {
      const cat = e.category || 'אחר'
      map[cat] = (map[cat] || 0) + (Number(e.amount) || 0)
    })
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, v]) => s + v, 0)
    return entries.map(([cat, amt]) => ({
      cat,
      amt,
      pct: total > 0 ? (amt / total) * 100 : 0,
    }))
  }, [filteredExpenses])

  // SVG chart data
  const chartData = monthlyRows.map((row) => ({
    label: monthLabel(row.key).slice(0, 3),
    income: row.income,
    expenses: row.expenses,
  }))
  const chartMax = Math.max(...chartData.flatMap((d) => [d.income, d.expenses]), 1)
  const svgW = 480
  const svgH = 200
  const padL = 48
  const padR = 16
  const padT = 16
  const padB = 32
  const innerW = svgW - padL - padR
  const innerH = svgH - padT - padB
  const barGroupW = innerW / chartData.length
  const barW = Math.min(28, barGroupW * 0.35)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ pct: t, value: Math.round(chartMax * t) }))

  const totals = monthlyRows.reduce((a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses }), { income: 0, expenses: 0 })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Chart */}
        <SectionCard
          className="xl:col-span-8"
          icon={BarChart2}
          title="הכנסות מול הוצאות"
          subtitle="6 חודשים אחרונים"
          actions={
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--success)]" />הכנסות</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--danger)]" />הוצאות</span>
            </div>
          }
          bodyClassName="p-4"
        >
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              width="100%"
              style={{ display: 'block', minWidth: '300px', maxHeight: 260 }}
            >
              {ticks.map(({ pct, value }) => {
                const y = padT + innerH * (1 - pct)
                return (
                  <g key={pct}>
                    <line x1={padL} y1={y} x2={svgW - padR} y2={y} style={{ stroke: 'var(--border)' }} strokeWidth="1" />
                    <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" style={{ fill: 'var(--text-muted)' }}>
                      {value >= 1000 ? `${Math.round(value / 1000)}k` : value}
                    </text>
                  </g>
                )
              })}
              <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} style={{ stroke: 'var(--outline-variant)' }} strokeWidth="1" />
              {chartData.map((d, i) => {
                const groupX = padL + i * barGroupW + barGroupW / 2
                const incomeH = chartMax > 0 ? (d.income / chartMax) * innerH : 0
                const expensesH = chartMax > 0 ? (d.expenses / chartMax) * innerH : 0
                const incomeX = groupX - barW - 1
                const expensesX = groupX + 1
                const labelY = padT + innerH + 14
                return (
                  <g key={d.label + i}>
                    <rect x={incomeX} y={padT + innerH - incomeH} width={barW} height={incomeH} style={{ fill: 'var(--success)' }} rx="2" />
                    <rect x={expensesX} y={padT + innerH - expensesH} width={barW} height={expensesH} style={{ fill: 'var(--danger)' }} rx="2" />
                    <text x={groupX} y={labelY} textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-secondary)' }}>
                      {d.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </SectionCard>

        {/* Expense by category */}
        <SectionCard
          className="xl:col-span-4 xl:sticky xl:top-20"
          icon={PiggyBank}
          title="הוצאות לפי קטגוריה"
          subtitle={periodLabel}
          bodyClassName="p-4"
        >
          {expenseByCategory.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">אין הוצאות בתקופה</p>
          ) : (
            <div className="space-y-3">
              {expenseByCategory.map(({ cat, amt, pct }, i) => (
                <BarRow
                  key={cat}
                  label={cat}
                  pct={pct}
                  color={PALETTE[i % PALETTE.length]}
                  valueText={<><strong>{formatCurrency(amt)}</strong> <span className="text-[var(--text-muted)]">({Math.round(pct)}%)</span></>}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Monthly breakdown ledger */}
      <SectionCard
        icon={CalendarDays}
        title="פירוט חודשי"
        subtitle="6 חודשים אחרונים"
        footer={<span className="num-tabular">סה״כ הכנסות {formatCurrency(totals.income)} • סה״כ הוצאות {formatCurrency(totals.expenses)}</span>}
      >
        <TableShell>
          <table className="ds-table">
            <thead>
              <tr><th>חודש</th><th className="!text-left">הכנסות</th><th className="!text-left">הוצאות</th><th className="!text-left">נטו</th><th>% גבייה</th></tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap text-[13px] font-semibold">{monthLabel(row.key)}</td>
                  <td className="!text-left whitespace-nowrap num-tabular text-[13px] text-[var(--success)] font-medium">{formatCurrency(row.income)}</td>
                  <td className="!text-left whitespace-nowrap num-tabular text-[13px] text-[var(--danger)] font-medium">{formatCurrency(row.expenses)}</td>
                  <td className={cn('!text-left whitespace-nowrap num-tabular text-[13px] font-bold', tone(row.net))}>{formatCurrency(row.net)}</td>
                  <td className="whitespace-nowrap"><RateChip rate={row.rate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Residents
// ---------------------------------------------------------------------------

function ResidentsTab({ units, payments, buildingId, directory }) {
  const [search, setSearch] = useState('')

  const filteredUnits = useMemo(() => {
    return units.filter(
      (u) => !buildingId || buildingId === 'all' || u.buildingId === buildingId
    )
  }, [units, buildingId])

  const rows = useMemo(() => {
    return filteredUnits.map((unit) => {
      const unitPayments = payments.filter((p) => p.unitId === unit.id)
      const paid = unitPayments.filter((p) => p.status === 'paid')
      const pending = unitPayments.filter((p) => p.status === 'pending')
      const overdue = unitPayments.filter((p) => p.status === 'overdue')
      const totalPaid = sumBy(paid, 'amount')
      const totalDebt = sumBy([...pending, ...overdue], 'amount')
      return {
        unit,
        name: directory.byId[unit.id]?.name || '',
        paidCount: paid.length,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        totalPaid,
        totalDebt,
      }
    }).sort((a, b) => String(a.unit.number || '').localeCompare(String(b.unit.number || ''), 'he', { numeric: true }))
  }, [filteredUnits, payments, directory])

  const searched = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const name = r.name.toLowerCase()
      const num = String(r.unit.number || '').toLowerCase()
      return name.includes(q) || num.includes(q)
    })
  }, [rows, search])

  const totalPaidAll = rows.reduce((s, r) => s + r.totalPaid, 0)
  const totalDebtAll = rows.reduce((s, r) => s + r.totalDebt, 0)
  const debtors = rows.filter((r) => r.totalDebt > 0).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="סה״כ שולם (כל הזמנים)" icon={Wallet} color="emerald" value={formatCurrency(totalPaidAll)} sub={`${rows.length} דירות`} />
        <StatCard label="חוב פתוח" icon={TrendingDown} color={totalDebtAll > 0 ? 'red' : 'emerald'} value={formatCurrency(totalDebtAll)} sub="ממתין + באיחור" />
        <StatCard label="דירות עם חוב" icon={Users} color={debtors ? 'amber' : 'emerald'} value={String(debtors)} sub={rows.length ? `${Math.round((debtors / rows.length) * 100)}% מהדירות` : '—'} />
      </div>

      <SectionCard
        icon={Users}
        title="מצב תשלומים לפי דירה"
        subtitle={`${searched.length} מתוך ${rows.length} דירות`}
        actions={<SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם או מספר דירה..." className="w-full sm:w-64" />}
        footer={rows.length ? (
          <span className="num-tabular">שולם: <strong className="text-[var(--success)]">{formatCurrency(totalPaidAll)}</strong> • חוב: <strong className={totalDebtAll > 0 ? 'text-[var(--danger)]' : ''}>{formatCurrency(totalDebtAll)}</strong></span>
        ) : null}
      >
        {searched.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">אין נתונים</p>
        ) : (
          <>
            <div className="hidden md:block">
              <TableShell>
                <table className="ds-table">
                  <thead>
                    <tr><th>דירה</th><th>דייר/ת</th><th>תשלומים</th><th className="!text-left">שולם</th><th className="!text-left">חוב</th></tr>
                  </thead>
                  <tbody>
                    {searched.map(({ unit, name, paidCount, pendingCount, overdueCount, totalPaid, totalDebt }) => {
                      const debtCount = pendingCount + overdueCount
                      return (
                        <tr key={unit.id} className={totalDebt > 0 ? '!bg-[var(--danger-light)]/30' : ''}>
                          <td className="whitespace-nowrap text-[13px] font-semibold num-tabular">דירה {unit.number}</td>
                          <td className="text-[13px]">{name || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {paidCount > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-light)] text-[var(--success)] num-tabular">{paidCount} שולם</span>}
                              {debtCount > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--danger-light)] text-[var(--danger)] num-tabular">{debtCount} חוב</span>}
                              {paidCount === 0 && debtCount === 0 && <span className="text-[11px] text-[var(--text-muted)]">—</span>}
                            </div>
                          </td>
                          <td className="!text-left whitespace-nowrap num-tabular text-[13px] font-bold text-[var(--success)]">{formatCurrency(totalPaid)}</td>
                          <td className={cn('!text-left whitespace-nowrap num-tabular text-[13px] font-bold', totalDebt > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]')}>{formatCurrency(totalDebt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>
            <div className="md:hidden divide-y divide-[var(--border-light)]">
              {searched.map(({ unit, name, totalPaid, totalDebt }) => (
                <div key={unit.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('shrink-0 h-10 w-10 rounded-[var(--radius)] flex items-center justify-center text-[13px] font-bold num-tabular',
                    totalDebt > 0 ? 'bg-[var(--danger-light)] text-[var(--danger)]' : 'bg-[var(--surface-secondary)] text-[var(--primary)]')}>
                    {unit.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[var(--text-primary)] truncate">דירה {unit.number}</span>
                    <span className="block text-[11px] text-[var(--text-muted)] truncate">{name || '—'}</span>
                  </div>
                  <div className="text-left">
                    <div className="text-[13px] font-bold num-tabular text-[var(--success)]">{formatCurrency(totalPaid)}</div>
                    {totalDebt > 0 && <div className="text-[11px] font-semibold num-tabular text-[var(--danger)]">חוב: {formatCurrency(totalDebt)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Maintenance
// ---------------------------------------------------------------------------

function MaintenanceTab({ issues, period, buildingId, customFrom, customTo, periodLabel }) {
  const filtered = useMemo(() => {
    return issues.filter((i) => {
      const matchBuilding = !buildingId || buildingId === 'all' || i.buildingId === buildingId
      return matchBuilding && inPeriod(i.reportedAt, period, customFrom, customTo)
    })
  }, [issues, buildingId, period, customFrom, customTo])

  const openIssues = filtered.filter(
    (i) => !['completed', 'closed'].includes(i.status)
  )
  const resolvedIssues = filtered.filter(
    (i) => ['completed', 'closed'].includes(i.status)
  )
  const totalCost = sumBy(
    filtered.filter((i) => i.cost != null),
    'cost'
  )

  // Avg repair time
  const avgRepairDays = useMemo(() => {
    const withDays = resolvedIssues
      .map((i) => diffDays(i.reportedAt, i.resolvedAt))
      .filter((d) => d !== null)
    if (withDays.length === 0) return null
    return Math.round(withDays.reduce((s, d) => s + d, 0) / withDays.length)
  }, [resolvedIssues])

  // Top categories (by priority or category field)
  const byCategory = useMemo(() => {
    const map = {}
    filtered.forEach((i) => {
      const cat = i.category || i.priority || 'אחר'
      if (!map[cat]) map[cat] = { count: 0, cost: 0 }
      map[cat].count++
      map[cat].cost += Number(i.cost) || 0
    })
    const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count)
    const maxCount = entries[0]?.[1].count || 1
    return entries.map(([cat, v]) => ({ cat, ...v, pct: (v.count / maxCount) * 100 }))
  }, [filtered])

  // Top 5 most expensive
  const top5 = useMemo(() => {
    return [...filtered]
      .filter((i) => i.cost > 0)
      .sort((a, b) => (b.cost || 0) - (a.cost || 0))
      .slice(0, 5)
  }, [filtered])

  // Vendor utilization
  const byVendor = useMemo(() => {
    const map = {}
    filtered.forEach((i) => {
      const v = i.vendor_name || i.vendorName || 'לא ידוע'
      if (!map[v]) map[v] = { count: 0, cost: 0 }
      map[v].count++
      map[v].cost += Number(i.cost) || 0
    })
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, v]) => ({ name, ...v }))
  }, [filtered])

  function statusBadge(status) {
    // Collapsed to the same five committee-facing buckets used on the Issues board.
    const BUCKET = {
      reported: 'new', open: 'new', pending_committee: 'new', acknowledged: 'new', new: 'new',
      approved_for_quotes: 'in_progress', quoted: 'in_progress', approved: 'in_progress',
      scheduled: 'in_progress', in_progress: 'in_progress',
      completed: 'awaiting_payment', awaiting_payment: 'awaiting_payment',
      closed: 'closed', resolved: 'closed', rejected: 'rejected', declined: 'rejected',
    }
    const MAP = {
      new:              { label: 'חדשה',          variant: 'default' },
      in_progress:      { label: 'בטיפול',         variant: 'info'    },
      awaiting_payment: { label: 'לתשלום וסגירה',  variant: 'warning' },
      closed:           { label: 'סגורה',          variant: 'success' },
      rejected:         { label: 'נדחתה',          variant: 'default' },
    }
    const s = MAP[BUCKET[status] || 'new']
    return <Badge variant={s.variant}>{s.label}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Wrench} label="תקלות פתוחות" value={String(openIssues.length)} color={openIssues.length ? 'red' : 'emerald'} sub={periodLabel} />
        <StatCard icon={CheckCircle2} label="תקלות שנסגרו" value={String(resolvedIssues.length)} color="emerald"
          sub={filtered.length ? `${Math.round((resolvedIssues.length / filtered.length) * 100)}% מהתקלות בתקופה` : 'אין תקלות בתקופה'} />
        <StatCard icon={PiggyBank} label="עלות כוללת" value={formatCurrency(totalCost)} color="amber" sub={`${filtered.length} תקלות`} />
        <StatCard icon={Timer} label="זמן תיקון ממוצע" value={avgRepairDays != null ? `${avgRepairDays} ימים` : '—'} color="blue" sub="מדיווח ועד סגירה" />
      </div>

      {filtered.length === 0 && (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)] rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)]">אין תקלות בתקופה הנבחרת</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          {/* Top 5 most expensive */}
          {top5.length > 0 && (
            <SectionCard icon={TrendingDown} title="5 התקלות היקרות ביותר" subtitle={periodLabel}>
              <TableShell>
                <table className="ds-table">
                  <thead>
                    <tr><th>#</th><th>תקלה</th><th>קטגוריה</th><th>סטטוס</th><th className="!text-left">עלות</th></tr>
                  </thead>
                  <tbody>
                    {top5.map((issue, idx) => (
                      <tr key={issue.id}>
                        <td className="text-[12px] font-bold text-[var(--text-muted)] num-tabular">{idx + 1}</td>
                        <td className="min-w-[180px] text-[13px] font-semibold">{issue.title || issue.description || '—'}</td>
                        <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)]">{issue.category || issue.priority || '—'}</td>
                        <td className="whitespace-nowrap">{statusBadge(issue.status)}</td>
                        <td className="!text-left whitespace-nowrap num-tabular text-[13px] font-bold">{formatCurrency(issue.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            </SectionCard>
          )}

          {/* Vendor utilization */}
          {byVendor.length > 0 && (
            <SectionCard icon={Users} title="ספקים ונותני שירות" subtitle={`${byVendor.length} ספקים`}>
              <TableShell>
                <table className="ds-table">
                  <thead>
                    <tr><th>ספק</th><th>תקלות</th><th className="!text-left">עלות מצטברת</th></tr>
                  </thead>
                  <tbody>
                    {byVendor.map(({ name, count, cost }) => (
                      <tr key={name}>
                        <td className="text-[13px] font-semibold">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-7 w-7 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[12px] font-bold">{name.charAt(0)}</span>
                            {name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-[12px] num-tabular">{count}</td>
                        <td className="!text-left whitespace-nowrap num-tabular text-[13px] font-bold">{formatCurrency(cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            </SectionCard>
          )}
        </div>

        {/* Top categories */}
        {byCategory.length > 0 && (
          <SectionCard className="xl:col-span-4 xl:sticky xl:top-20" icon={Wrench} title="תקלות לפי קטגוריה" subtitle={periodLabel} bodyClassName="p-4">
            <div className="space-y-3">
              {byCategory.map(({ cat, count, pct }, i) => (
                <BarRow
                  key={cat}
                  label={cat}
                  pct={pct}
                  color={PALETTE[i % PALETTE.length]}
                  valueText={<><strong>{count}</strong> <span className="text-[var(--text-muted)]">תקלות</span></>}
                />
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Budget
// ---------------------------------------------------------------------------

function BudgetTab({ units, expenses, buildingId }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIdx = now.getMonth() // 0-based

  const filteredUnits = useMemo(() => {
    return units.filter(
      (u) => !buildingId || buildingId === 'all' || u.buildingId === buildingId
    )
  }, [units, buildingId])

  const monthlyRevenue = sumBy(filteredUnits, 'monthlyFee')
  const annualRevenue = monthlyRevenue * 12

  // Expenses for current year
  const yearExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchBuilding = !buildingId || buildingId === 'all' || e.buildingId === buildingId
      return matchBuilding && inPeriod(e.date, 'this_year')
    })
  }, [expenses, buildingId])

  const annualExpenses = sumBy(yearExpenses, 'amount')
  const avgMonthlyExpenses =
    currentMonthIdx > 0 ? annualExpenses / currentMonthIdx : annualExpenses
  const projectedAnnualExpenses = avgMonthlyExpenses * 12

  const gap = annualRevenue - projectedAnnualExpenses
  const budgetUsedPct =
    annualRevenue > 0 ? Math.min(100, (projectedAnnualExpenses / annualRevenue) * 100) : 0
  const usedColor = budgetUsedPct > 90 ? 'red' : budgetUsedPct > 70 ? 'amber' : 'blue'
  const usedBar = budgetUsedPct > 90 ? 'bg-[var(--danger)]' : budgetUsedPct > 70 ? 'bg-[var(--warning)]' : 'bg-[var(--success)]'

  // Reserve fund
  const recommendedReserve = annualRevenue * 0.1
  const hypotheticalAvailable = annualRevenue - annualExpenses

  // Annual projection table: remaining months (currentMonthIdx .. 11)
  const remainingMonths = useMemo(() => {
    const months = []
    for (let m = currentMonthIdx; m < 12; m++) {
      months.push({
        label: `${HEBREW_MONTHS[m]} ${currentYear}`,
        income: monthlyRevenue,
        expenses: avgMonthlyExpenses,
        net: monthlyRevenue - avgMonthlyExpenses,
      })
    }
    return months
  }, [currentMonthIdx, currentYear, monthlyRevenue, avgMonthlyExpenses])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="הכנסה שנתית צפויה" value={formatCurrency(annualRevenue)} color="emerald" sub={`${formatCurrency(monthlyRevenue)} לחודש`} />
        <StatCard icon={TrendingDown} label="הוצאות שנתיות צפויות" value={formatCurrency(projectedAnnualExpenses)} color="red" valueClassName="text-[var(--text-primary)]" sub={`ממוצע ${formatCurrency(Math.round(avgMonthlyExpenses))} לחודש`} />
        <StatCard icon={Scale} label="פער תקציבי" value={formatCurrency(gap)} color={gap >= 0 ? 'emerald' : 'red'} sub={gap >= 0 ? 'עודף צפוי' : 'גירעון צפוי'} />
        <StatCard icon={Gauge} label="ניצול תקציב" value={`${Math.round(budgetUsedPct)}%`} color={usedColor} progress={budgetUsedPct} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          {/* Budget bar */}
          <SectionCard icon={BarChart2} title={`תקציב שנתי — ${currentYear}`} subtitle="הוצאות צפויות מול הכנסות" bodyClassName="p-4">
            <div className="mb-2 flex justify-between text-[12px] text-[var(--text-secondary)] num-tabular">
              <span>הוצאות צפויות: {formatCurrency(projectedAnnualExpenses)}</span>
              <span>הכנסות: {formatCurrency(annualRevenue)}</span>
            </div>
            <div className="h-4 w-full rounded-full bg-[var(--surface-container)] overflow-hidden">
              <div className={cn('h-full rounded-full transition-all duration-700', usedBar)} style={{ width: `${budgetUsedPct}%` }} />
            </div>
          </SectionCard>

          {/* Monthly projection table */}
          <SectionCard icon={TrendingUp} title="תחזית חודשית שנתית" subtitle={`${remainingMonths.length} חודשים עד סוף ${currentYear}`}>
            <TableShell>
              <table className="ds-table">
                <thead>
                  <tr><th>חודש</th><th className="!text-left">הכנסה צפויה</th><th className="!text-left">הוצאות צפויות</th><th className="!text-left">נטו</th></tr>
                </thead>
                <tbody>
                  {remainingMonths.map((row) => (
                    <tr key={row.label}>
                      <td className="whitespace-nowrap text-[13px] font-semibold">{row.label}</td>
                      <td className="!text-left whitespace-nowrap num-tabular text-[13px] text-[var(--success)]">{formatCurrency(row.income)}</td>
                      <td className="!text-left whitespace-nowrap num-tabular text-[13px] text-[var(--danger)]">{formatCurrency(row.expenses)}</td>
                      <td className={cn('!text-left whitespace-nowrap num-tabular text-[13px] font-bold', tone(row.net))}>{formatCurrency(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </SectionCard>
        </div>

        {/* Reserve fund */}
        <SectionCard className="xl:col-span-4 xl:sticky xl:top-20" icon={PiggyBank} title="קרן רזרבה מומלצת" subtitle="10% מההכנסות השנתיות" bodyClassName="p-4 space-y-3">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <p className="text-[12px] text-[var(--text-secondary)]">רזרבה מומלצת</p>
            <p className="mt-1 text-[20px] font-bold num-tabular text-[var(--primary)]">{formatCurrency(recommendedReserve)}</p>
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <p className="text-[12px] text-[var(--text-secondary)]">עודף היפותטי (הכנסות פחות הוצאות)</p>
            <p className={cn('mt-1 text-[20px] font-bold num-tabular', tone(hypotheticalAvailable))}>{formatCurrency(hypotheticalAvailable)}</p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reports() {
  const [activeTab, setActiveTab] = useState('financial')
  const [period, setPeriod] = useState('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { selectedBuilding } = useBuildingContext()
  // Data is scoped server-side to the sidebar's building.
  const buildingFilter = 'all'
  const scope = { building_id: selectedBuilding?.id }

  const { data: payments, isLoading } = useCollection('payments', scope)
  const { data: expenses } = useCollection('expenses', scope)
  const { data: issues } = useCollection('issues', scope)
  const { data: units } = useCollection('units', scope)
  const directory = useUnitDirectory(selectedBuilding?.id)

  const activeBuildingId =
    buildingFilter === 'all' ? 'all' : buildingFilter

  // Period-level financial KPIs (shown on every tab)
  const fin = useMemo(() => {
    const filteredPayments = (payments || []).filter((p) => {
      const dateField = p.status === 'paid' ? p.paidAt : p.month
      return inPeriod(dateField, period, customFrom, customTo)
    })
    const paidPayments = filteredPayments.filter((p) => p.status === 'paid')
    const totalIncome = sumBy(paidPayments, 'amount')
    const totalExpected = sumBy(filteredPayments, 'amount')
    const collectionRate = totalExpected > 0 ? (totalIncome / totalExpected) * 100 : 0
    const filteredExpenses = (expenses || []).filter((e) => inPeriod(e.date, period, customFrom, customTo))
    const totalExpenses = sumBy(filteredExpenses, 'amount')
    return {
      totalIncome, totalExpected, collectionRate, totalExpenses,
      netBalance: totalIncome - totalExpenses,
      filteredExpenses,
      paidCount: paidPayments.length,
      expenseCount: filteredExpenses.length,
    }
  }, [payments, expenses, period, customFrom, customTo])

  const periodLabel = period === 'custom'
    ? (customFrom || customTo ? `${customFrom ? formatDate(customFrom) : '…'} – ${customTo ? formatDate(customTo) : '…'}` : 'טווח מותאם')
    : PERIODS.find((p) => p.key === period)?.label

  // Derive data needed for CSV export from filtered collections
  function handleExport() {
    const periodLabel = period === 'custom'
      ? `${customFrom || ''}_${customTo || ''}`
      : period
    if (activeTab === 'financial') {
      const monthKeys = getLast6MonthKeys()
      const rows = monthKeys.map((key) => {
        const monthPayments = (payments || []).filter((p) => {
          const matchBuilding = !activeBuildingId || activeBuildingId === 'all' || p.buildingId === activeBuildingId
          return matchBuilding && getMonthKey(p.status === 'paid' ? p.paidAt : p.month) === key
        })
        const monthPaid = monthPayments.filter((p) => p.status === 'paid')
        const income = sumBy(monthPaid, 'amount')
        const expected = sumBy(monthPayments, 'amount')
        const rate = expected > 0 ? Math.round((income / expected) * 100) : 0
        const monthExpenses = (expenses || []).filter((e) => {
          const matchBuilding = !activeBuildingId || activeBuildingId === 'all' || e.buildingId === activeBuildingId
          return matchBuilding && getMonthKey(e.date) === key
        })
        const expenseSum = sumBy(monthExpenses, 'amount')
        const net = income - expenseSum
        return [monthLabel(key), income, expenseSum, net, `${rate}%`]
      })
      exportToCSV('דוח_כספי.csv', ['חודש', 'הכנסות', 'הוצאות', 'נטו', '% גבייה'], rows)
    } else if (activeTab === 'residents') {
      const filteredUnits = (units || []).filter(
        (u) => !activeBuildingId || activeBuildingId === 'all' || u.buildingId === activeBuildingId
      )
      const rows = filteredUnits.map((unit) => {
        const unitPayments = (payments || []).filter((p) => p.unitId === unit.id)
        const paid = unitPayments.filter((p) => p.status === 'paid')
        const pending = unitPayments.filter((p) => p.status === 'pending')
        const overdue = unitPayments.filter((p) => p.status === 'overdue')
        const totalPaid = sumBy(paid, 'amount')
        const totalDebt = sumBy([...pending, ...overdue], 'amount')
        return [
          unit.number || '',
          directory.byId[unit.id]?.name || '',
          paid.length,
          pending.length + overdue.length,
          totalPaid,
          totalDebt,
        ]
      })
      exportToCSV('דוח_דיירים.csv', ['מספר דירה', 'שם דייר', 'תשלומים ששולמו', 'חובות', 'סה"כ שולם', 'סה"כ חוב'], rows)
    } else if (activeTab === 'maintenance') {
      const filtered = (issues || []).filter((i) => {
        const matchBuilding = !activeBuildingId || activeBuildingId === 'all' || i.buildingId === activeBuildingId
        return matchBuilding && inPeriod(i.reportedAt, period, customFrom, customTo)
      })
      const rows = filtered.map((i) => [
        i.title || i.description || '',
        i.category || i.priority || '',
        i.status || '',
        i.cost ?? '',
        formatDate(i.reportedAt),
        i.resolvedAt ? formatDate(i.resolvedAt) : '',
      ])
      exportToCSV(`דוח_תחזוקה_${periodLabel}.csv`, ['כותרת', 'קטגוריה', 'סטטוס', 'עלות', 'תאריך דיווח', 'תאריך סגירה'], rows)
    } else if (activeTab === 'budget') {
      const now = new Date()
      const currentMonthIdx = now.getMonth()
      const currentYear = now.getFullYear()
      const filteredUnits = (units || []).filter(
        (u) => !activeBuildingId || activeBuildingId === 'all' || u.buildingId === activeBuildingId
      )
      const monthlyRevenue = sumBy(filteredUnits, 'monthlyFee')
      const yearExpenses = (expenses || []).filter((e) => {
        const matchBuilding = !activeBuildingId || activeBuildingId === 'all' || e.buildingId === activeBuildingId
        return matchBuilding && inPeriod(e.date, 'this_year')
      })
      const annualExpenses = sumBy(yearExpenses, 'amount')
      const avgMonthlyExpenses = currentMonthIdx > 0 ? annualExpenses / currentMonthIdx : annualExpenses
      const rows = []
      for (let m = currentMonthIdx; m < 12; m++) {
        const net = monthlyRevenue - avgMonthlyExpenses
        rows.push([`${HEBREW_MONTHS[m]} ${currentYear}`, monthlyRevenue, Math.round(avgMonthlyExpenses), Math.round(net)])
      }
      exportToCSV('דוח_תקציב.csv', ['חודש', 'הכנסה צפויה', 'הוצאות צפויות', 'נטו'], rows)
    }
  }

  const subtitle = `סקירה כספית ותפעולית של הבניין${selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}`

  if (isLoading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">דוחות וניתוחים</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">{subtitle}</p>
      </div>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  const periodApplies = activeTab === 'financial' || activeTab === 'maintenance'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">דוחות וניתוחים — {periodLabel}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabGroup tabs={PERIODS} activeTab={period} onChange={setPeriod} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />הדפסה</Button>
          <Button onClick={handleExport}><Download className="h-4 w-4" />ייצוא CSV</Button>
        </div>
      </div>

      {/* KPI row — financial health for the selected period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="הכנסות (נגבו)" icon={TrendingUp} color="emerald"
          value={formatCurrency(fin.totalIncome)}
          sub={`${fin.paidCount} תשלומים • ${periodLabel}`} />
        <StatCard label="הוצאות" icon={TrendingDown} color="red" valueClassName="text-[var(--text-primary)]"
          value={formatCurrency(fin.totalExpenses)}
          sub={`${fin.expenseCount} הוצאות • ${periodLabel}`} />
        <StatCard label="מאזן" icon={Scale} color={fin.netBalance >= 0 ? 'emerald' : 'red'}
          value={formatCurrency(fin.netBalance)}
          footer={
            <span className={cn('inline-flex items-center gap-1 font-semibold', tone(fin.netBalance))}>
              {fin.netBalance >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {fin.netBalance >= 0 ? 'עודף בתקופה' : 'גירעון בתקופה'}
            </span>
          } />
        <StatCard label="אחוז גבייה" icon={PiggyBank} color={fin.collectionRate >= 80 ? 'blue' : fin.collectionRate >= 50 ? 'amber' : 'red'}
          valueClassName="text-[var(--text-primary)]"
          value={`${Math.round(fin.collectionRate)}%`}
          sub={`${formatCurrency(fin.totalIncome)} מתוך ${formatCurrency(fin.totalExpected)}`}
          progress={fin.collectionRate} />
      </div>

      {/* Filter card — report section + custom range */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Building2 className="h-4 w-4 text-[var(--primary)]" />
            {periodApplies ? `תקופה: ${periodLabel}` : activeTab === 'budget' ? `שנת ${new Date().getFullYear()} (התקופה לא חלה)` : 'כל התקופות (התקופה לא חלה)'}
          </span>
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-[var(--border-light)]">
            <label className="text-[12px] font-medium text-[var(--text-secondary)]">מתאריך:</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
            />
            <label className="text-[12px] font-medium text-[var(--text-secondary)]">עד:</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        )}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'financial' && (
          <FinancialTab
            payments={payments}
            expenses={expenses}
            buildingId={activeBuildingId}
            filteredExpenses={fin.filteredExpenses}
            periodLabel={periodLabel}
          />
        )}
        {activeTab === 'residents' && (
          <ResidentsTab
            units={units}
            payments={payments}
            buildingId={activeBuildingId}
            directory={directory}
          />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab
            issues={issues}
            period={period}
            buildingId={activeBuildingId}
            customFrom={customFrom}
            customTo={customTo}
            periodLabel={periodLabel}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetTab
            units={units}
            expenses={expenses}
            buildingId={activeBuildingId}
          />
        )}
      </div>
    </div>
  )
}
