import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
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

      {/* Year summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-sm text-[var(--text-secondary)]">סה״כ הכנסות {selectedYear}</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(yearTotals.income)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <p className="text-sm text-[var(--text-secondary)]">סה״כ הוצאות {selectedYear}</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(yearTotals.expenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-[var(--text-secondary)]">מאזן {selectedYear}</p>
            </div>
            <p className={`text-2xl font-bold ${yearTotals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {yearTotals.balance >= 0 ? '+' : ''}{formatCurrency(yearTotals.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly breakdown table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">חודש</th>
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />
                    הכנסות
                  </div>
                </th>
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1">
                    <ArrowUpRight className="h-3.5 w-3.5 text-red-600" />
                    הוצאות בנק
                  </div>
                </th>
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">הוצאות ידניות</th>
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">סה״כ הוצאות</th>
                <th className="text-right p-3 font-medium text-[var(--text-secondary)]">מאזן</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map(m => {
                const hasData = m.income > 0 || m.expenses > 0
                return (
                  <tr
                    key={m.month}
                    className={`border-b border-[var(--border)] last:border-0 transition-colors ${
                      hasData ? 'hover:bg-[var(--surface-hover)]' : 'opacity-40'
                    }`}
                  >
                    <td className="p-3 font-medium">{m.label}</td>
                    <td className="p-3 text-green-600 font-medium">
                      {m.income > 0 ? formatCurrency(m.income) : '-'}
                    </td>
                    <td className="p-3 text-red-600">
                      {m.bankExpenses > 0 ? formatCurrency(m.bankExpenses) : '-'}
                    </td>
                    <td className="p-3 text-red-500">
                      {m.manualExpenses > 0 ? formatCurrency(m.manualExpenses) : '-'}
                    </td>
                    <td className="p-3 text-red-600 font-medium">
                      {m.expenses > 0 ? formatCurrency(m.expenses) : '-'}
                    </td>
                    <td className={`p-3 font-bold ${m.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {hasData ? (
                        <>
                          {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                        </>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
              {/* Totals row */}
              <tr className="bg-[var(--surface-hover)] font-bold">
                <td className="p-3">סה״כ</td>
                <td className="p-3 text-green-600">{formatCurrency(yearTotals.income)}</td>
                <td className="p-3 text-red-600">
                  {formatCurrency(monthlyData.reduce((s, m) => s + m.bankExpenses, 0))}
                </td>
                <td className="p-3 text-red-500">
                  {formatCurrency(monthlyData.reduce((s, m) => s + m.manualExpenses, 0))}
                </td>
                <td className="p-3 text-red-600">{formatCurrency(yearTotals.expenses)}</td>
                <td className={`p-3 ${yearTotals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {yearTotals.balance >= 0 ? '+' : ''}{formatCurrency(yearTotals.balance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
