import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { TrendingUp, TrendingDown, BarChart2, Users, Wrench, PiggyBank, Download } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'financial', label: 'כספי' },
  { key: 'residents', label: 'דיירים' },
  { key: 'maintenance', label: 'תחזוקה' },
  { key: 'budget', label: 'תקציב' },
]

const PERIODS = [
  { key: 'this_month', label: 'החודש' },
  { key: 'last_3', label: '3 חודשים' },
  { key: 'this_year', label: 'השנה' },
  { key: 'all', label: 'הכל' },
]

import { HEBREW_MONTHS } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inPeriod(dateStr, period) {
  if (!dateStr || period === 'all') return true
  const d = new Date(dateStr)
  const now = new Date()
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STAT_GRADIENTS = {
  '#22c55e': 'from-emerald-500 to-emerald-600',
  '#ef4444': 'from-red-500 to-red-600',
  '#f59e0b': 'from-amber-500 to-amber-600',
  '#6366f1': 'from-indigo-500 to-indigo-600',
  '#06b6d4': 'from-cyan-500 to-cyan-600',
}

function StatCard({ icon: Icon, label, value, sub, color = 'var(--primary)', className = '' }) {
  const gradient = STAT_GRADIENTS[color] || 'from-blue-500 to-blue-600'
  return (
    <Card className={cn('overflow-hidden border border-[var(--border)] hover:shadow-md transition-all', className)}>
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}
        >
          <Icon size={20} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </p>
          <p className="mt-0.5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {value}
          </p>
          {sub && (
            <div className="mt-1">{sub}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function HorizontalBar({ label, amount, pct, color = 'var(--primary)' }) {
  return (
    <div className="group flex flex-col gap-1.5 p-2.5 rounded-lg hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {formatCurrency(amount)}{' '}
          <span className="text-xs font-normal text-[var(--text-muted)]">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--border-light, #e5e7eb)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Financial
// ---------------------------------------------------------------------------

function FinancialTab({ payments, expenses, period, buildingId }) {
  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchBuilding = !buildingId || buildingId === 'all' || p.buildingId === buildingId
      const dateField = p.status === 'paid' ? p.paidAt : p.month
      return matchBuilding && inPeriod(dateField, period)
    })
  }, [payments, buildingId, period])

  const paidPayments = filteredPayments.filter((p) => p.status === 'paid')
  const totalIncome = sumBy(paidPayments, 'amount')
  const totalExpected = sumBy(filteredPayments, 'amount')
  const collectionRate = totalExpected > 0 ? (totalIncome / totalExpected) * 100 : 0

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchBuilding = !buildingId || buildingId === 'all' || e.buildingId === buildingId
      return matchBuilding && inPeriod(e.date, period)
    })
  }, [expenses, buildingId, period])

  const totalExpenses = sumBy(filteredExpenses, 'amount')
  const netBalance = totalIncome - totalExpenses

  // Monthly breakdown (last 6 months)
  const monthKeys = getLast6MonthKeys()
  const monthlyRows = useMemo(() => {
    return monthKeys.map((key) => {
      const [y, m] = key.split('-').map(Number)
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
  }, [monthKeys, payments, expenses, buildingId])

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

  const CATEGORY_COLORS = [
    '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
    '#a855f7', '#ec4899', '#14b8a6',
  ]

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

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="הכנסות"
          value={formatCurrency(totalIncome)}
          color="#22c55e"
        />
        <StatCard
          icon={TrendingDown}
          label="הוצאות"
          value={formatCurrency(totalExpenses)}
          color="#ef4444"
        />
        <StatCard
          icon={BarChart2}
          label="מאזן"
          value={formatCurrency(netBalance)}
          color={netBalance >= 0 ? '#22c55e' : '#ef4444'}
        />
        <StatCard
          icon={PiggyBank}
          label="אחוז גבייה"
          value={`${Math.round(collectionRate)}%`}
          color="var(--primary)"
          sub={<Progress value={collectionRate} />}
        />
      </div>

      {/* SVG Bar Chart */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-sm">
              <BarChart2 size={16} className="text-white" />
            </div>
            הכנסות מול הוצאות — 6 חודשים אחרונים
          </h3>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
              <span>הכנסות</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
              <span>הוצאות</span>
            </div>
          </div>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              width={svgW}
              height={svgH}
              style={{ display: 'block', minWidth: '300px' }}
            >
              {/* Y-axis ticks and grid lines */}
              {ticks.map(({ pct, value }) => {
                const y = padT + innerH * (1 - pct)
                return (
                  <g key={pct}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={svgW - padR}
                      y2={y}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 4}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="9"
                      fill="#9ca3af"
                    >
                      {value >= 1000 ? `${Math.round(value / 1000)}k` : value}
                    </text>
                  </g>
                )
              })}
              {/* Y axis line */}
              <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#d1d5db" strokeWidth="1" />
              {/* Bars */}
              {chartData.map((d, i) => {
                const groupX = padL + i * barGroupW + barGroupW / 2
                const incomeH = chartMax > 0 ? (d.income / chartMax) * innerH : 0
                const expensesH = chartMax > 0 ? (d.expenses / chartMax) * innerH : 0
                const incomeX = groupX - barW - 1
                const expensesX = groupX + 1
                const labelY = padT + innerH + 14
                return (
                  <g key={d.label}>
                    {/* Income bar */}
                    <rect
                      x={incomeX}
                      y={padT + innerH - incomeH}
                      width={barW}
                      height={incomeH}
                      fill="#22c55e"
                      rx="2"
                    />
                    {/* Expenses bar */}
                    <rect
                      x={expensesX}
                      y={padT + innerH - expensesH}
                      width={barW}
                      height={expensesH}
                      fill="#ef4444"
                      rx="2"
                    />
                    {/* X-axis label */}
                    <text
                      x={groupX}
                      y={labelY}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#6b7280"
                    >
                      {d.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Monthly breakdown */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
        <CardContent className="p-4">
          <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <BarChart2 size={16} className="text-white" />
            </div>
            פירוט חודשי (6 חודשים אחרונים)
          </h3>
          <div className="overflow-x-auto">
            {/* Header */}
            <div
              className="mb-2 grid grid-cols-5 gap-2 border-b pb-2 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              }}
            >
              <span>חודש</span>
              <span className="text-left">הכנסות</span>
              <span className="text-left">הוצאות</span>
              <span className="text-left">נטו</span>
              <span className="text-left">% גבייה</span>
            </div>
            {monthlyRows.map((row) => (
              <div
                key={row.key}
                className="group grid gap-2 border-b py-2.5 text-sm hover:bg-slate-50/50 transition-colors rounded-lg px-1"
                style={{
                  borderColor: 'var(--border)',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                }}
              >
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{monthLabel(row.key)}</span>
                <span className="font-medium" style={{ color: '#22c55e' }}>{formatCurrency(row.income)}</span>
                <span className="font-medium" style={{ color: '#ef4444' }}>{formatCurrency(row.expenses)}</span>
                <span className="font-semibold" style={{ color: row.net >= 0 ? '#22c55e' : '#ef4444' }}>
                  {formatCurrency(row.net)}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${row.rate >= 80 ? 'bg-emerald-500' : row.rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{row.rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expense by category */}
      {expenseByCategory.length > 0 && (
        <Card className="overflow-hidden border border-[var(--border)]">
          <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
                <PiggyBank size={16} className="text-white" />
              </div>
              הוצאות לפי קטגוריה
            </h3>
            <div className="space-y-1">
              {expenseByCategory.map(({ cat, amt, pct }, i) => (
                <HorizontalBar
                  key={cat}
                  label={cat}
                  amount={amt}
                  pct={pct}
                  color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Residents
// ---------------------------------------------------------------------------

function ResidentsTab({ units, payments, buildingId }) {
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
        paidCount: paid.length,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        totalPaid,
        totalDebt,
      }
    })
  }, [filteredUnits, payments])

  const searched = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const name = (r.unit.ownerName || r.unit.tenant_name || '').toLowerCase()
      const num = String(r.unit.number || '').toLowerCase()
      return name.includes(q) || num.includes(q)
    })
  }, [rows, search])

  const totalPaidAll = rows.reduce((s, r) => s + r.totalPaid, 0)
  const totalDebtAll = rows.reduce((s, r) => s + r.totalDebt, 0)

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="חיפוש לפי שם או מספר דירה..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
        }}
        dir="rtl"
      />

      {searched.length === 0 && (
        <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          אין נתונים
        </p>
      )}

      {/* Resident cards */}
      <div className="space-y-2">
        {searched.map(({ unit, paidCount, pendingCount, overdueCount, totalPaid, totalDebt }) => {
          const hasDebt = totalDebt > 0
          const debtCount = pendingCount + overdueCount
          return (
            <div
              key={unit.id}
              className={cn(
                'group flex items-center gap-4 p-4 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all',
                hasDebt ? 'border-red-200/60' : 'border-[var(--border)]'
              )}
            >
              {/* Unit number circle */}
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${hasDebt ? 'from-red-500 to-red-600' : 'from-emerald-500 to-emerald-600'} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                {unit.number || unit.unit_number}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                    דירה {unit.number || unit.unit_number}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {unit.ownerName || unit.tenant_name || '—'}
                </span>
              </div>

              {/* Payment status badges */}
              <div className="flex items-center gap-2">
                {paidCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-xs font-medium text-emerald-700">{paidCount} שולם</span>
                  </div>
                )}
                {debtCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                    <span className="text-xs font-medium text-red-700">{debtCount} חוב</span>
                  </div>
                )}
              </div>

              {/* Amounts */}
              <div className="text-left min-w-[100px]">
                <div className="text-[13px] font-bold text-emerald-600">{formatCurrency(totalPaid)}</div>
                {hasDebt && (
                  <div className="text-[11px] font-semibold text-red-500">חוב: {formatCurrency(totalDebt)}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary card */}
      {searched.length > 0 && (
        <Card className="overflow-hidden border-2 border-[var(--border)]">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-primary)]">סה"כ</span>
              <div className="flex items-center gap-6">
                <div className="text-left">
                  <div className="text-xs text-[var(--text-muted)]">שולם</div>
                  <div className="text-sm font-bold text-emerald-600">{formatCurrency(totalPaidAll)}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs text-[var(--text-muted)]">חוב</div>
                  <div className={cn('text-sm font-bold', totalDebtAll > 0 ? 'text-red-500' : 'text-[var(--text-secondary)]')}>
                    {formatCurrency(totalDebtAll)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Maintenance
// ---------------------------------------------------------------------------

function MaintenanceTab({ issues, period, buildingId }) {
  const filtered = useMemo(() => {
    return issues.filter((i) => {
      const matchBuilding = !buildingId || buildingId === 'all' || i.buildingId === buildingId
      return matchBuilding && inPeriod(i.reportedAt, period)
    })
  }, [issues, buildingId, period])

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

  const CATEGORY_COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#06b6d4', '#a855f7']

  function statusBadge(status) {
    const STATUS_MAP = {
      reported:     { label: 'דווח',       variant: 'default' },
      acknowledged: { label: 'התקבל',      variant: 'info'    },
      quoted:       { label: 'הוצע מחיר',  variant: 'info'    },
      approved:     { label: 'אושר',       variant: 'warning' },
      scheduled:    { label: 'מתוכנן',     variant: 'warning' },
      in_progress:  { label: 'בטיפול',     variant: 'warning' },
      completed:    { label: 'הושלם',      variant: 'success' },
      closed:       { label: 'סגור',       variant: 'success' },
    }
    const s = STATUS_MAP[status]
    if (s) return <Badge variant={s.variant}>{s.label}</Badge>
    return <Badge>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Wrench}
          label="תקלות פתוחות"
          value={openIssues.length}
          color="#ef4444"
        />
        <StatCard
          icon={Wrench}
          label="תקלות שנסגרו"
          value={resolvedIssues.length}
          color="#22c55e"
        />
        <StatCard
          icon={PiggyBank}
          label="עלות כוללת"
          value={formatCurrency(totalCost)}
          color="#f59e0b"
        />
        <StatCard
          icon={BarChart2}
          label="זמן תיקון ממוצע"
          value={avgRepairDays != null ? `${avgRepairDays} ימים` : '—'}
          color="var(--primary)"
        />
      </div>

      {/* Top categories */}
      {byCategory.length > 0 && (
        <Card className="overflow-hidden border border-[var(--border)]">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm">
                <Wrench size={16} className="text-white" />
              </div>
              תקלות לפי קטגוריה
            </h3>
            <div className="space-y-1">
              {byCategory.map(({ cat, count, pct }, i) => (
                <div key={cat} className="group flex flex-col gap-1.5 p-2.5 rounded-lg hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                    </div>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{count} <span className="font-normal text-xs text-[var(--text-muted)]">תקלות</span></span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--border-light, #e5e7eb)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 5 most expensive */}
      {top5.length > 0 && (
        <Card className="overflow-hidden border border-[var(--border)]">
          <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-sm">
                <TrendingDown size={16} className="text-white" />
              </div>
              5 התקלות היקרות ביותר
            </h3>
            <div className="space-y-2">
              {top5.map((issue, idx) => (
                <div
                  key={issue.id}
                  className="group flex items-center gap-4 p-3 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all border-[var(--border)]"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {issue.title || issue.description || '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {issue.category || issue.priority || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                      {formatCurrency(issue.cost)}
                    </span>
                    {statusBadge(issue.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vendor utilization */}
      {byVendor.length > 0 && (
        <Card className="overflow-hidden border border-[var(--border)]">
          <div className="h-1 bg-gradient-to-r from-cyan-500 to-teal-500" />
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-sm">
                <Users size={16} className="text-white" />
              </div>
              ספקים ונותני שירות
            </h3>
            <div className="space-y-2">
              {byVendor.map(({ name, count, cost }) => (
                <div
                  key={name}
                  className="group flex items-center gap-4 p-3 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all border-[var(--border)]"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate block">{name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{count} תקלות</span>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{formatCurrency(cost)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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

  // Reserve fund
  const recommendedReserve = annualRevenue * 0.1
  const hypotheticalAvailable = annualRevenue - annualExpenses

  // Annual projection table: remaining months (currentMonthIdx+1 .. 11)
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
      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="הכנסה שנתית צפויה"
          value={formatCurrency(annualRevenue)}
          color="#22c55e"
        />
        <StatCard
          icon={TrendingDown}
          label="הוצאות שנתיות צפויות"
          value={formatCurrency(projectedAnnualExpenses)}
          color="#ef4444"
        />
        <StatCard
          icon={BarChart2}
          label="פער תקציבי"
          value={formatCurrency(gap)}
          color={gap >= 0 ? '#22c55e' : '#ef4444'}
        />
        <StatCard
          icon={PiggyBank}
          label="ניצול תקציב"
          value={`${Math.round(budgetUsedPct)}%`}
          color={budgetUsedPct > 90 ? '#ef4444' : budgetUsedPct > 70 ? '#f59e0b' : 'var(--primary)'}
          sub={
            <Progress
              value={budgetUsedPct}
              color={budgetUsedPct > 90 ? '#ef4444' : budgetUsedPct > 70 ? '#f59e0b' : undefined}
            />
          }
        />
      </div>

      {/* Budget bar */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
              <BarChart2 size={16} className="text-white" />
            </div>
            תקציב שנתי — {currentYear}
          </h3>
          <div className="mb-2 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>הוצאות צפויות: {formatCurrency(projectedAnnualExpenses)}</span>
            <span>הכנסות: {formatCurrency(annualRevenue)}</span>
          </div>
          <Progress
            value={budgetUsedPct}
            color={budgetUsedPct > 90 ? '#ef4444' : budgetUsedPct > 70 ? '#f59e0b' : '#22c55e'}
            className="h-4"
          />
        </CardContent>
      </Card>

      {/* Reserve fund */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <PiggyBank size={16} className="text-white" />
            </div>
            קרן רזרבה מומלצת (10% מהכנסות שנתיות)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                רזרבה מומלצת
              </p>
              <p className="mt-1 text-lg font-bold" style={{ color: 'var(--primary)' }}>
                {formatCurrency(recommendedReserve)}
              </p>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                עודף היפותטי (הכנסות פחות הוצאות)
              </p>
              <p
                className="mt-1 text-lg font-bold"
                style={{ color: hypotheticalAvailable >= 0 ? '#22c55e' : '#ef4444' }}
              >
                {formatCurrency(hypotheticalAvailable)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly projection table */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
        <CardContent className="p-4">
          <h3 className="mb-4 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
              <TrendingUp size={16} className="text-white" />
            </div>
            תחזית חודשית שנתית
          </h3>
          {/* Header */}
          <div
            className="mb-1 grid gap-2 border-b pb-2 text-xs font-medium"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
            }}
          >
            <span>חודש</span>
            <span>הכנסה צפויה</span>
            <span>הוצאות צפויות</span>
            <span>נטו</span>
          </div>
          {remainingMonths.map((row) => (
            <div
              key={row.label}
              className="grid gap-2 border-b py-2 text-sm"
              style={{
                borderColor: 'var(--border)',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
              <span style={{ color: '#22c55e' }}>{formatCurrency(row.income)}</span>
              <span style={{ color: '#ef4444' }}>{formatCurrency(row.expenses)}</span>
              <span style={{ color: row.net >= 0 ? '#22c55e' : '#ef4444' }}>
                {formatCurrency(row.net)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reports() {
  const [activeTab, setActiveTab] = useState('financial')
  const [period, setPeriod] = useState('this_month')

  const { selectedBuilding, buildings } = useBuildingContext()
  const [buildingFilter, setBuildingFilter] = useState('all')

  const { data: payments, isLoading } = useCollection('payments')
  const { data: expenses } = useCollection('expenses')
  const { data: issues } = useCollection('issues')
  const { data: units } = useCollection('units')

  const activeBuildingId =
    buildingFilter === 'all' ? 'all' : buildingFilter

  // Derive data needed for CSV export from filtered collections
  function handleExport() {
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
          unit.number || unit.unit_number || '',
          unit.ownerName || unit.tenant_name || '',
          paid.length,
          pending.length + overdue.length,
          totalPaid,
          totalDebt,
        ]
      })
      exportToCSV('דוח_דיירים.csv', ['מספר דירה', 'שם בעלים', 'תשלומים ששולמו', 'חובות', 'סה"כ שולם', 'סה"כ חוב'], rows)
    } else if (activeTab === 'maintenance') {
      const filtered = (issues || []).filter((i) => {
        const matchBuilding = !activeBuildingId || activeBuildingId === 'all' || i.buildingId === activeBuildingId
        return matchBuilding && inPeriod(i.reportedAt, period)
      })
      const rows = filtered.map((i) => [
        i.title || i.description || '',
        i.category || i.priority || '',
        i.status || '',
        i.cost ?? '',
        formatDate(i.reportedAt),
        i.resolvedAt ? formatDate(i.resolvedAt) : '',
      ])
      exportToCSV('דוח_תחזוקה.csv', ['כותרת', 'קטגוריה', 'סטטוס', 'עלות', 'תאריך דיווח', 'תאריך סגירה'], rows)
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

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={BarChart2} iconColor="blue" title="דוחות וניתוחים" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <PageHeader
        icon={BarChart2}
        iconColor="blue"
        title="דוחות וניתוחים"
        subtitle="סקירה כללית של פעילות הבניין"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">כל הבניינים</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.address}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={handleExport} className="flex items-center gap-1.5">
              <Download size={15} />
              ייצוא CSV
            </Button>
          </div>
        }
      />

      {/* Period selector (visible on financial & maintenance tabs) */}
      {(activeTab === 'financial' || activeTab === 'maintenance') && (
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              variant={period === p.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div>
        {activeTab === 'financial' && (
          <FinancialTab
            payments={payments}
            expenses={expenses}
            period={period}
            buildingId={activeBuildingId}
          />
        )}
        {activeTab === 'residents' && (
          <ResidentsTab
            units={units}
            payments={payments}
            buildingId={activeBuildingId}
          />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab
            issues={issues}
            period={period}
            buildingId={activeBuildingId}
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
