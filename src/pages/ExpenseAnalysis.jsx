import { useState, useMemo, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/common/EmptyState'
import { FormSelect } from '@/components/common/FormField'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  Brain, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Lightbulb, ShieldAlert, Scale, Zap,
} from 'lucide-react'

const SEVERITY_STYLES = {
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
}

const HEALTH_STYLES = {
  good: { label: 'תקין', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
  warning: { label: 'דורש תשומת לב', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  critical: { label: 'קריטי', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
}

export default function ExpenseAnalysis() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx } = useCollection('bankTransactions')
  const { data: allExpenses } = useCollection('expenses')

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  // Prepare data for analysis
  const analysisData = useMemo(() => {
    if (!selectedBuilding) return null

    const expensesByMonth = {}
    const incomeByMonth = {}

    // Group expenses by month and category
    allExpenses
      .filter(e => e.building_id === selectedBuilding.id && e.date?.startsWith(selectedYear))
      .forEach(e => {
        const m = e.date?.substring(0, 7)
        if (!m) return
        if (!expensesByMonth[m]) expensesByMonth[m] = []
        expensesByMonth[m].push({
          desc: e.description,
          amount: Number(e.amount) || 0,
          cat: e.category || 'אחר',
        })
      })

    // Group income by month
    allTx
      .filter(tx => tx.building_id === selectedBuilding.id && tx.match_status !== 'excluded' && tx.month?.startsWith(selectedYear) && Number(tx.credit) > 0)
      .forEach(tx => {
        const m = tx.month
        if (!incomeByMonth[m]) incomeByMonth[m] = { total: 0, count: 0 }
        incomeByMonth[m].total += Number(tx.credit) || 0
        incomeByMonth[m].count++
      })

    return { expensesByMonth, incomeByMonth, year: selectedYear }
  }, [allTx, allExpenses, selectedBuilding, selectedYear])

  const runAnalysis = useCallback(async () => {
    if (!analysisData || !selectedBuilding) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vaad-agent', {
        body: {
          agentType: 'expense_analysis',
          buildingName: selectedBuilding.name,
          contextData: analysisData,
        },
      })

      if (fnError) throw new Error(fnError.message)
      setResult(data?.result || null)
    } catch (err) {
      setError(err.message || 'שגיאה בניתוח')
    } finally {
      setLoading(false)
    }
  }, [analysisData, selectedBuilding])

  if (!selectedBuilding) {
    return <EmptyState icon={Brain} title="בחר בניין" description="יש לבחור בניין כדי להפעיל ניתוח" />
  }

  const healthStyle = result?.health ? HEALTH_STYLES[result.health] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">ניתוח הוצאות AI</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            השוואה חודשית, זיהוי חריגות, תובנות והמלצות
          </p>
        </div>
        <div className="flex gap-3 items-end">
          <FormSelect
            label="שנה"
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setResult(null) }}
            options={yearOptions}
            className="w-28"
          />
          <Button onClick={runAnalysis} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? 'מנתח...' : 'הפעל ניתוח'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="p-4 text-red-600">{error}</CardContent>
        </Card>
      )}

      {/* No result yet */}
      {!result && !loading && !error && (
        <EmptyState
          icon={Brain}
          title="לחץ על הפעל ניתוח"
          description="הסוכן ינתח את כל ההוצאות וההכנסות שלך ויתן תובנות חכמות"
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
          <p className="text-sm text-[var(--text-secondary)]">הסוכן מנתח את הנתונים...</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary & Health */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                {healthStyle && (
                  <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${healthStyle.bg} ${healthStyle.color}`}>
                    {healthStyle.label}
                  </div>
                )}
                <p className="text-sm leading-relaxed flex-1">{result.summary}</p>
              </div>
            </CardContent>
          </Card>

          {/* Income vs Expense */}
          {result.income_vs_expense && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-[var(--text-secondary)]">סה״כ הכנסות</p>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(result.income_vs_expense.total_income)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <p className="text-sm text-[var(--text-secondary)]">סה״כ הוצאות</p>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    {formatCurrency(result.income_vs_expense.total_expenses)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Scale className="h-4 w-4 text-blue-600" />
                    <p className="text-sm text-[var(--text-secondary)]">מאזן</p>
                  </div>
                  <p className={`text-xl font-bold ${result.income_vs_expense.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.income_vs_expense.net >= 0 ? '+' : ''}{formatCurrency(result.income_vs_expense.net)}
                  </p>
                  {result.income_vs_expense.assessment && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{result.income_vs_expense.assessment}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Alerts */}
          {result.alerts?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                התראות
              </h2>
              {result.alerts.map((alert, i) => (
                <Card key={i} className={`border ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold">{alert.title}</p>
                          <Badge variant={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}>
                            {alert.severity === 'high' ? 'גבוה' : alert.severity === 'medium' ? 'בינוני' : 'נמוך'}
                          </Badge>
                        </div>
                        <p className="text-sm">{alert.description}</p>
                        {alert.recommendation && (
                          <p className="text-sm mt-2 font-medium">המלצה: {alert.recommendation}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Category Analysis */}
          {result.category_analysis?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">ניתוח לפי קטגוריה</h2>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">קטגוריה</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">סה״כ</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">מגמה</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">שינוי</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">התראה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.category_analysis.map((cat, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                          <td className="p-3 font-medium">{cat.category}</td>
                          <td className="p-3">{formatCurrency(cat.total)}</td>
                          <td className="p-3">
                            {cat.trend === 'up' && <Badge variant="danger" className="gap-1"><TrendingUp className="h-3 w-3" />עולה</Badge>}
                            {cat.trend === 'down' && <Badge variant="success" className="gap-1"><TrendingDown className="h-3 w-3" />יורד</Badge>}
                            {cat.trend === 'stable' && <Badge variant="default">יציב</Badge>}
                          </td>
                          <td className="p-3">
                            {cat.change_pct != null && (
                              <span className={cat.change_pct > 0 ? 'text-red-600' : 'text-green-600'}>
                                {cat.change_pct > 0 ? '+' : ''}{cat.change_pct}%
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs">{cat.alert || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Monthly Comparison */}
          {result.monthly_comparison?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">השוואה חודשית</h2>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">חודש</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">הכנסות</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">הוצאות</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">מאזן</th>
                        <th className="text-right p-3 font-medium text-[var(--text-secondary)]">התראות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.monthly_comparison.map((m, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                          <td className="p-3 font-medium">{m.month}</td>
                          <td className="p-3 text-green-600">{formatCurrency(m.income)}</td>
                          <td className="p-3 text-red-600">{formatCurrency(m.expenses)}</td>
                          <td className={`p-3 font-bold ${m.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                          </td>
                          <td className="p-3 text-xs">
                            {m.alerts?.map((a, j) => <span key={j} className="block">{a}</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Insights */}
          {result.insights?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                תובנות
              </h2>
              <div className="space-y-2">
                {result.insights.map((insight, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-sm">{insight}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                המלצות
              </h2>
              <div className="space-y-2">
                {result.recommendations.map((rec, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="font-semibold text-sm">{rec.title}</p>
                      {rec.potential_saving && (
                        <p className="text-xs text-green-600 mt-1">חיסכון פוטנציאלי: {rec.potential_saving}</p>
                      )}
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{rec.action}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
