import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { FormSelect } from '@/components/common/FormField'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { Scale, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight } from 'lucide-react'

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' }, { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' }, { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' }, { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' }, { value: '12', label: 'דצמבר' },
]

export default function Balance() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx } = useCollection('bankTransactions')
  const { data: allExpenses } = useCollection('expenses')

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
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

  if (!selectedBuilding) {
    return <EmptyState icon={Scale} title="בחר בניין" description="יש לבחור בניין כדי לצפות במאזן" />
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Scale} iconColor="blue" title="מאזן" subtitle="סיכום הכנסות מול הוצאות לפי חודשים" />

      {/* Year selector */}
      <div className="flex flex-wrap gap-3 items-end">
        <FormSelect
          label="שנה"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={yearOptions}
          className="w-28"
        />
      </div>

      {/* Year summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`סה״כ הכנסות ${selectedYear}`}
          value={formatCurrency(yearTotals.income)}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label={`סה״כ הוצאות ${selectedYear}`}
          value={formatCurrency(yearTotals.expenses)}
          icon={TrendingDown}
          color="red"
        />
        <StatCard
          label={`מאזן ${selectedYear}`}
          value={`${yearTotals.balance >= 0 ? '+' : ''}${formatCurrency(yearTotals.balance)}`}
          icon={Scale}
          color={yearTotals.balance >= 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* Monthly breakdown cards */}
      <div className="space-y-2">
        {monthlyData.map(m => {
          const hasData = m.income > 0 || m.expenses > 0
          const maxAmount = Math.max(m.income, m.expenses) || 1
          const incomePct = Math.round((m.income / maxAmount) * 100)
          const expensesPct = Math.round((m.expenses / maxAmount) * 100)

          // Month gradient based on balance
          const monthGradient = !hasData
            ? 'from-slate-300 to-slate-400'
            : m.balance >= 0
              ? 'from-emerald-500 to-emerald-600'
              : 'from-red-500 to-red-600'

          return (
            <div
              key={m.month}
              className={`group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white transition-all ${
                hasData ? 'hover:shadow-md hover:border-blue-200' : 'opacity-50'
              }`}
            >
              {/* Month gradient circle */}
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${monthGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                {m.label.slice(0, 3)}
              </div>

              {/* Month name */}
              <div className="min-w-[70px]">
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">{m.label}</span>
              </div>

              {/* Income section */}
              <div className="flex-1 min-w-[120px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <ArrowDownLeft className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span className="text-xs text-[var(--text-muted)]">הכנסות</span>
                </div>
                <span className="text-[13px] font-bold text-emerald-600">
                  {m.income > 0 ? formatCurrency(m.income) : '-'}
                </span>
                {hasData && (
                  <div className="h-1 w-full rounded-full bg-slate-100 mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: incomePct + '%' }} />
                  </div>
                )}
              </div>

              {/* Expenses section */}
              <div className="flex-1 min-w-[120px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <ArrowUpRight className="h-3 w-3 text-red-600 shrink-0" />
                  <span className="text-xs text-[var(--text-muted)]">הוצאות</span>
                </div>
                <span className="text-[13px] font-bold text-red-600">
                  {m.expenses > 0 ? formatCurrency(m.expenses) : '-'}
                </span>
                {m.bankExpenses > 0 && m.manualExpenses > 0 && (
                  <div className="text-[10px] text-[var(--text-muted)]">
                    בנק: {formatCurrency(m.bankExpenses)} | ידני: {formatCurrency(m.manualExpenses)}
                  </div>
                )}
                {hasData && (
                  <div className="h-1 w-full rounded-full bg-slate-100 mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-red-500" style={{ width: expensesPct + '%' }} />
                  </div>
                )}
              </div>

              {/* Balance with dot */}
              <div className="flex items-center gap-2 min-w-[100px] shrink-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  !hasData ? 'bg-slate-300' : m.balance >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
                <span className={`text-[13px] font-bold ${
                  !hasData ? 'text-[var(--text-muted)]' : m.balance >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {hasData ? `${m.balance >= 0 ? '+' : ''}${formatCurrency(m.balance)}` : '-'}
                </span>
              </div>
            </div>
          )
        })}

        {/* Totals card */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-hover)]">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
            {selectedYear.slice(2)}
          </div>
          <div className="min-w-[70px]">
            <span className="text-[14px] font-bold text-[var(--text-primary)]">סה״כ</span>
          </div>
          <div className="flex-1 min-w-[120px]">
            <span className="text-[13px] font-bold text-emerald-600">{formatCurrency(yearTotals.income)}</span>
          </div>
          <div className="flex-1 min-w-[120px]">
            <span className="text-[13px] font-bold text-red-600">{formatCurrency(yearTotals.expenses)}</span>
          </div>
          <div className="flex items-center gap-2 min-w-[100px] shrink-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${yearTotals.balance >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className={`text-[14px] font-bold ${yearTotals.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {yearTotals.balance >= 0 ? '+' : ''}{formatCurrency(yearTotals.balance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
