import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TrendingUp, TrendingDown, BarChart2, Users, Wrench, PiggyBank } from 'lucide-react'

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

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, sub, color = 'var(--primary)', className = '' }) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatCurrency(amount)}{' '}
          <span className="text-xs">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
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

      {/* Monthly breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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
                className="grid gap-2 border-b py-2 text-sm"
                style={{
                  borderColor: 'var(--border)',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{monthLabel(row.key)}</span>
                <span style={{ color: '#22c55e' }}>{formatCurrency(row.income)}</span>
                <span style={{ color: '#ef4444' }}>{formatCurrency(row.expenses)}</span>
                <span style={{ color: row.net >= 0 ? '#22c55e' : '#ef4444' }}>
                  {formatCurrency(row.net)}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{row.rate}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expense by category */}
      {expenseByCategory.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              הוצאות לפי קטגוריה
            </h3>
            <div className="space-y-3">
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

      <Card>
        <CardContent className="p-0">
          {/* Header */}
          <div
            className="grid gap-2 border-b px-4 py-2 text-xs font-medium"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              gridTemplateColumns: '60px 1fr 80px 80px 100px 100px',
            }}
          >
            <span>דירה</span>
            <span>שם</span>
            <span>שולם</span>
            <span>חוב</span>
            <span>סה"כ שולם</span>
            <span>סה"כ חוב</span>
          </div>

          {searched.length === 0 && (
            <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              אין נתונים
            </p>
          )}

          {searched.map(({ unit, paidCount, pendingCount, overdueCount, totalPaid, totalDebt }) => (
            <div
              key={unit.id}
              className="grid items-center gap-2 border-b px-4 py-2.5 text-sm transition-colors"
              style={{
                borderColor: 'var(--border)',
                gridTemplateColumns: '60px 1fr 80px 80px 100px 100px',
                backgroundColor: totalDebt > 0 ? 'rgba(239,68,68,0.05)' : undefined,
              }}
            >
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                {unit.number}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>
                {unit.ownerName || unit.tenant_name || '—'}
              </span>
              <span>
                {paidCount > 0 && (
                  <Badge variant="success">{paidCount} חודשים</Badge>
                )}
              </span>
              <span>
                {(pendingCount + overdueCount) > 0 && (
                  <Badge variant="danger">{pendingCount + overdueCount} חודשים</Badge>
                )}
              </span>
              <span style={{ color: '#22c55e', fontWeight: 500 }}>
                {formatCurrency(totalPaid)}
              </span>
              <span style={{ color: totalDebt > 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: totalDebt > 0 ? 600 : 400 }}>
                {formatCurrency(totalDebt)}
              </span>
            </div>
          ))}

          {/* Summary row */}
          <div
            className="grid items-center gap-2 px-4 py-2.5 text-sm font-semibold"
            style={{
              gridTemplateColumns: '60px 1fr 80px 80px 100px 100px',
              backgroundColor: 'var(--surface)',
              borderTop: `2px solid var(--border)`,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>סה"כ</span>
            <span />
            <span />
            <span />
            <span style={{ color: '#22c55e' }}>{formatCurrency(totalPaidAll)}</span>
            <span style={{ color: totalDebtAll > 0 ? '#ef4444' : 'var(--text-secondary)' }}>
              {formatCurrency(totalDebtAll)}
            </span>
          </div>
        </CardContent>
      </Card>
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
    (i) => i.status !== 'resolved' && i.status !== 'closed'
  )
  const resolvedIssues = filtered.filter(
    (i) => i.status === 'resolved' || i.status === 'closed'
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
    if (status === 'open') return <Badge variant="danger">פתוחה</Badge>
    if (status === 'in_progress') return <Badge variant="warning">בטיפול</Badge>
    if (status === 'resolved' || status === 'closed') return <Badge variant="success">סגורה</Badge>
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
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              תקלות לפי קטגוריה
            </h3>
            <div className="space-y-3">
              {byCategory.map(({ cat, count, pct }, i) => (
                <div key={cat} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-primary)' }}>{cat}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{count} תקלות</span>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full"
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
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              5 התקלות היקרות ביותר
            </h3>
            <div className="space-y-2">
              {top5.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {issue.title || issue.description || '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {issue.category || issue.priority || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
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
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              ספקים ונותני שירות
            </h3>
            <div
              className="mb-2 grid gap-2 border-b pb-2 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                gridTemplateColumns: '1fr 80px 120px',
              }}
            >
              <span>ספק</span>
              <span>תקלות</span>
              <span>עלות כוללת</span>
            </div>
            {byVendor.map(({ name, count, cost }) => (
              <div
                key={name}
                className="grid gap-2 border-b py-2 text-sm"
                style={{
                  borderColor: 'var(--border)',
                  gridTemplateColumns: '1fr 80px 120px',
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{count}</span>
                <span style={{ color: '#f59e0b' }}>{formatCurrency(cost)}</span>
              </div>
            ))}
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
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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

  const { data: payments } = useCollection('payments')
  const { data: expenses } = useCollection('expenses')
  const { data: issues } = useCollection('issues')
  const { data: units } = useCollection('units')
  const { data: vendors } = useCollection('vendors')
  const { data: workOrders } = useCollection('workOrders')

  const activeBuildingId =
    buildingFilter === 'all' ? 'all' : buildingFilter

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            דוחות וניתוחים
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            סקירה כללית של פעילות הבניין
          </p>
        </div>

        {/* Building filter */}
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

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
