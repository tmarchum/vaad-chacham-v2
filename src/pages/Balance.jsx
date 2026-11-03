import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { Scale, TrendingUp, TrendingDown, BarChart2, CalendarRange, Landmark, PencilLine, ChevronLeft } from 'lucide-react'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'

export default function Balance() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allTx, isLoading } = useCollection('bankTransactions', scope)
  const { data: allExpenses } = useCollection('expenses', scope)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  // Monthly breakdown for the selected year
  const monthlyData = useMemo(() => {
    if (!selectedBuilding) return []

    return HEBREW_MONTHS.map(({ value: month, label }) => {
      const monthKey = `${selectedYear}-${month}`

      // Bank income: credits (exclude 'excluded' and 'suggested' transactions)
      const bankIncome = allTx
        .filter(tx => tx.building_id === selectedBuilding.id && tx.match_status !== 'excluded' && tx.match_status !== 'suggested' && tx.month === monthKey && Number(tx.credit) > 0)
        .reduce((s, tx) => s + (Number(tx.credit) || 0), 0)

      // Bank expenses: debits (exclude 'excluded' and 'suggested' transactions)
      const bankExpenses = allTx
        .filter(tx => tx.building_id === selectedBuilding.id && tx.match_status !== 'excluded' && tx.match_status !== 'suggested' && tx.month === monthKey && Number(tx.debit) > 0)
        .reduce((s, tx) => s + (Number(tx.debit) || 0), 0)

      // Manual expenses (not from bank)
      const manualExpenses = allExpenses
        .filter(exp => exp.building_id === selectedBuilding.id && exp.date?.startsWith(monthKey) && !exp.bank_transaction_id)
        .reduce((s, exp) => s + (Number(exp.amount) || 0), 0)

      const totalIncome = bankIncome
      const totalExpenses = bankExpenses + manualExpenses
      const balance = totalIncome - totalExpenses

      return {
        month,
        label,
        income: totalIncome,
        expenses: totalExpenses,
        bankExpenses,
        manualExpenses,
        balance,
      }
    })
  }, [allTx, allExpenses, selectedBuilding, selectedYear])

  // Year totals
  const yearTotals = useMemo(() => {
    const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0)
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0)
    return {
      income: totalIncome,
      expenses: totalExpenses,
      balance: totalIncome - totalExpenses,
    }
  }, [monthlyData])

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מאזן</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={Scale} title="בחר בניין" description="יש לבחור בניין כדי לצפות במאזן" />
  }

  // ── View model ──
  const activeMonths = monthlyData.filter(m => m.income > 0 || m.expenses > 0)
  const surplusMonths = activeMonths.filter(m => m.balance >= 0).length
  const deficitMonths = activeMonths.length - surplusMonths
  const avgNet = activeMonths.length ? yearTotals.balance / activeMonths.length : 0
  const coveragePct = yearTotals.expenses > 0 ? Math.round((yearTotals.income / yearTotals.expenses) * 100) : 0
  const chartMax = Math.max(1, ...monthlyData.map(m => Math.max(m.income, m.expenses)))
  const bankExpTotal = monthlyData.reduce((s, m) => s + m.bankExpenses, 0)
  const manualExpTotal = monthlyData.reduce((s, m) => s + m.manualExpenses, 0)
  const bankExpPct = yearTotals.expenses > 0 ? Math.round((bankExpTotal / yearTotals.expenses) * 100) : 0
  const sortedByBalance = [...activeMonths].sort((a, b) => b.balance - a.balance)
  const bestMonth = sortedByBalance[0]
  const worstMonth = sortedByBalance[sortedByBalance.length - 1]
  const ledgerRows = monthlyData.map((m, i) => ({
    ...m,
    cumulative: monthlyData.slice(0, i + 1).reduce((s, x) => s + x.balance, 0),
    hasData: m.income > 0 || m.expenses > 0,
  }))
  const signed = (v) => `${v >= 0 ? '+' : ''}${formatCurrency(v)}`
  const toneOf = (v) => (v >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מאזן קופת הבניין — {selectedYear}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">הכנסות מול הוצאות לפי חודשים, מתנועות הבנק והוצאות ידניות • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} options={yearOptions} className="w-28" aria-label="שנה" />
          <Link to="/bank-transactions" className="h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[13px] font-semibold inline-flex items-center gap-1.5">
            <Landmark className="h-4 w-4" />תנועות בנק
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={`סה״כ הכנסות ${selectedYear}`} icon={TrendingUp} color="emerald"
          value={formatCurrency(yearTotals.income)}
          sub={yearTotals.expenses > 0 ? `מכסות ${coveragePct}% מההוצאות` : 'אין הוצאות בשנה זו'} />
        <StatCard label={`סה״כ הוצאות ${selectedYear}`} icon={TrendingDown} color="red"
          value={formatCurrency(yearTotals.expenses)}
          sub={`בנק ${formatCurrency(bankExpTotal)} • ידני ${formatCurrency(manualExpTotal)}`} />
        <StatCard label={`מאזן ${selectedYear}`} icon={Scale} color={yearTotals.balance >= 0 ? 'emerald' : 'red'}
          value={signed(yearTotals.balance)}
          sub={activeMonths.length ? `ממוצע חודשי נטו ${signed(Math.round(avgNet))}` : 'אין נתונים לשנה זו'} />
        <StatCard label="חודשים בעודף / בגירעון" icon={CalendarRange} color={deficitMonths ? 'amber' : 'blue'}
          value={`${surplusMonths} / ${deficitMonths}`}
          sub={`${activeMonths.length} חודשים עם פעילות`}
          progress={activeMonths.length ? Math.round((surplusMonths / activeMonths.length) * 100) : 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6 min-w-0">
          {/* Chart */}
          <SectionCard icon={BarChart2} title="הכנסות מול הוצאות" subtitle={`לפי חודש • ${selectedYear}`}
            actions={
              <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />הכנסות</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />הוצאות</span>
              </div>
            }
            bodyClassName="p-4">
            {activeMonths.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-10">אין תנועות לשנה זו</p>
            ) : (
              <div className="flex items-end gap-1.5 sm:gap-2 h-48 overflow-x-auto">
                {monthlyData.map(m => (
                  <div key={m.month} className="flex-1 min-w-[22px] flex flex-col items-center gap-1 h-full justify-end" title={`${m.label}: הכנסות ${formatCurrency(m.income)} • הוצאות ${formatCurrency(m.expenses)}`}>
                    <div className="flex items-end gap-0.5 w-full h-full justify-center">
                      <div className="w-1/2 max-w-[14px] rounded-t-sm bg-[var(--success)]" style={{ height: `${(m.income / chartMax) * 100}%` }} />
                      <div className="w-1/2 max-w-[14px] rounded-t-sm bg-[var(--danger)]" style={{ height: `${(m.expenses / chartMax) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">{m.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Monthly ledger */}
          <SectionCard icon={Scale} title="פירוט חודשי" subtitle="מאזן חודשי ומצטבר" bodyClassName="p-0"
            footer={<span className="num-tabular">סה״כ שנתי: <strong className={toneOf(yearTotals.balance)}>{signed(yearTotals.balance)}</strong></span>}>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>חודש</th><th className="!text-left">הכנסות</th><th className="!text-left">הוצאות</th><th className="!text-left">מאזן</th><th className="!text-left">מצטבר</th><th>מצב</th></tr>
                </thead>
                <tbody>
                  {ledgerRows.map(m => (
                    <tr key={m.month} className={m.hasData ? '' : 'opacity-50'}>
                      <td className="whitespace-nowrap font-semibold">{m.label}</td>
                      <td className="whitespace-nowrap !text-left num-tabular text-[var(--success)] font-semibold">{m.income > 0 ? formatCurrency(m.income) : '—'}</td>
                      <td className="whitespace-nowrap !text-left num-tabular">
                        <span className="text-[var(--danger)] font-semibold">{m.expenses > 0 ? formatCurrency(m.expenses) : '—'}</span>
                        {m.bankExpenses > 0 && m.manualExpenses > 0 && (
                          <span className="block text-[10px] text-[var(--text-muted)]">בנק {formatCurrency(m.bankExpenses)} | ידני {formatCurrency(m.manualExpenses)}</span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap !text-left num-tabular font-bold ${m.hasData ? toneOf(m.balance) : 'text-[var(--text-muted)]'}`}>{m.hasData ? signed(m.balance) : '—'}</td>
                      <td className="whitespace-nowrap !text-left num-tabular text-[var(--text-secondary)]">{m.hasData ? signed(m.cumulative) : '—'}</td>
                      <td className="whitespace-nowrap">
                        {!m.hasData ? <Badge variant="neutral">ללא פעילות</Badge> : m.balance >= 0 ? <Badge variant="success">עודף</Badge> : <Badge variant="danger">גירעון</Badge>}
                      </td>
                    </tr>
                  ))}
                  <tr className="!bg-[var(--surface-secondary)]">
                    <td className="font-bold">סה״כ {selectedYear}</td>
                    <td className="!text-left num-tabular font-bold text-[var(--success)]">{formatCurrency(yearTotals.income)}</td>
                    <td className="!text-left num-tabular font-bold text-[var(--danger)]">{formatCurrency(yearTotals.expenses)}</td>
                    <td className={`!text-left num-tabular font-bold ${toneOf(yearTotals.balance)}`}>{signed(yearTotals.balance)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y divide-[var(--border-light)]">
              {ledgerRows.map(m => (
                <div key={m.month} className={`p-4 flex items-center justify-between gap-3 ${m.hasData ? '' : 'opacity-50'}`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">{m.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] num-tabular">
                      <span className="text-[var(--success)]">{m.income > 0 ? formatCurrency(m.income) : '—'}</span>
                      {' • '}
                      <span className="text-[var(--danger)]">{m.expenses > 0 ? formatCurrency(m.expenses) : '—'}</span>
                    </p>
                  </div>
                  <span className={`text-[14px] font-bold num-tabular ${m.hasData ? toneOf(m.balance) : 'text-[var(--text-muted)]'}`}>{m.hasData ? signed(m.balance) : '—'}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Side panel */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-6">
          <SectionCard icon={TrendingDown} title="הרכב ההוצאות" subtitle={`${selectedYear} • לפי מקור`} bodyClassName="p-4 space-y-4">
            {yearTotals.expenses === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-4">אין הוצאות בשנה זו</p>
            ) : (
              <>
                <div className="h-2 rounded-full bg-[var(--surface-container)] overflow-hidden flex">
                  <div className="h-full bg-[var(--primary)]" style={{ width: `${bankExpPct}%` }} />
                  <div className="h-full bg-[var(--warning)]" style={{ width: `${100 - bankExpPct}%` }} />
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-[var(--primary)]" />חיובי בנק</span>
                    <span className="num-tabular"><strong>{formatCurrency(bankExpTotal)}</strong> <span className="text-[var(--text-muted)]">({bankExpPct}%)</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><PencilLine className="h-3.5 w-3.5 text-[var(--warning)]" />הוצאות ידניות</span>
                    <span className="num-tabular"><strong>{formatCurrency(manualExpTotal)}</strong> <span className="text-[var(--text-muted)]">({100 - bankExpPct}%)</span></span>
                  </div>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard icon={CalendarRange} title="חודשי שיא" subtitle="המאזן הטוב והחלש בשנה" bodyClassName="p-4 space-y-3">
            {!bestMonth ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-4">אין נתונים</p>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--success-light)]">
                  <span className="text-[12px] font-semibold text-[var(--success)]">החודש הטוב — {bestMonth.label}</span>
                  <span className="text-[13px] font-bold num-tabular text-[var(--success)]">{signed(bestMonth.balance)}</span>
                </div>
                {worstMonth && worstMonth !== bestMonth && (
                  <div className={`flex items-center justify-between p-3 rounded-[var(--radius)] ${worstMonth.balance < 0 ? 'bg-[var(--danger-light)]' : 'bg-[var(--surface-secondary)]'}`}>
                    <span className={`text-[12px] font-semibold ${worstMonth.balance < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>החודש החלש — {worstMonth.label}</span>
                    <span className={`text-[13px] font-bold num-tabular ${toneOf(worstMonth.balance)}`}>{signed(worstMonth.balance)}</span>
                  </div>
                )}
              </>
            )}
            <Link to="/expense-analysis" className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)] text-[12px]">
              <span className="font-semibold text-[var(--text-primary)]">ניתוח הוצאות מעמיק (AI)</span>
              <ChevronLeft className="h-4 w-4 text-[var(--primary)]" />
            </Link>
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
