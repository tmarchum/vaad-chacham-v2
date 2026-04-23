import { useState, useMemo, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/common/EmptyState'
import { FormSelect } from '@/components/common/FormField'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/common/PageHeader'
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
      .filter(tx => tx.building_id === selectedBuilding.id && tx.match_status !== 'excluded' && tx.match_status !== 'suggested' && tx.month?.startsWith(selectedYear) && Number(tx.credit) > 0)
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
      <PageHeader
        icon={Brain}
        iconColor="purple"
        title="ניתוח הוצאות AI"
        subtitle="השוואה חודשית, זיהוי חריגות, תובנות והמלצות"
        actions={
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
        }
      />

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
          <div className="relative rounded-xl border bg-white overflow-hidden">
            <div className={`h-1.5 w-full bg-gradient-to-r ${
              result.health === 'good' ? 'from-emerald-500 to-emerald-600' :
              result.health === 'warning' ? 'from-amber-500 to-amber-600' :
              result.health === 'critical' ? 'from-red-500 to-red-600' : 'from-purple-500 to-purple-600'
            }`} />
            <div className="p-5">
              <div className="flex items-start gap-4">
                {healthStyle && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthStyle.bg} ${healthStyle.color}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      result.health === 'good' ? 'bg-emerald-500' :
                      result.health === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    {healthStyle.label}
                  </div>
                )}
                <p className="text-sm leading-relaxed flex-1 text-[var(--text-primary)]">{result.summary}</p>
              </div>
            </div>
          </div>

          {/* Income vs Expense */}
          {result.income_vs_expense && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'סה״כ הכנסות', value: formatCurrency(result.income_vs_expense.total_income), icon: <TrendingUp className="h-5 w-5" />, gradient: 'from-emerald-500 to-emerald-600', color: 'text-green-600' },
                { label: 'סה״כ הוצאות', value: formatCurrency(result.income_vs_expense.total_expenses), icon: <TrendingDown className="h-5 w-5" />, gradient: 'from-red-500 to-red-600', color: 'text-red-600' },
                { label: 'מאזן', value: `${result.income_vs_expense.net >= 0 ? '+' : ''}${formatCurrency(result.income_vs_expense.net)}`, icon: <Scale className="h-5 w-5" />, gradient: result.income_vs_expense.net >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600', color: result.income_vs_expense.net >= 0 ? 'text-green-600' : 'text-red-600', subtitle: result.income_vs_expense.assessment },
              ].map((stat) => (
                <div key={stat.label} className="relative rounded-xl border bg-white overflow-hidden hover:shadow-md transition-all">
                  <div className={`h-1 w-full bg-gradient-to-r ${stat.gradient}`} />
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                        {stat.icon}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">{stat.label}</p>
                    </div>
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{stat.subtitle}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alerts */}
          {result.alerts?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                התראות
              </h2>
              <div className="space-y-2">
                {result.alerts.map((alert, i) => {
                  const alertGradient = alert.severity === 'high' ? 'from-red-500 to-red-600' : alert.severity === 'medium' ? 'from-amber-500 to-amber-600' : 'from-blue-500 to-blue-600'
                  const alertDot = alert.severity === 'high' ? 'bg-red-500 animate-pulse' : alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-400'
                  const alertBorder = alert.severity === 'high' ? 'border-red-200' : alert.severity === 'medium' ? 'border-amber-200' : 'border-blue-200'
                  return (
                    <div key={i} className={`flex items-start gap-4 p-4 rounded-xl border bg-white hover:shadow-md transition-all ${alertBorder}`}>
                      {/* Severity circle */}
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${alertGradient} flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5`}>
                        <AlertTriangle className="h-5 w-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[14px] font-semibold text-[var(--text-primary)]">{alert.title}</p>
                          <Badge variant={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}>
                            {alert.severity === 'high' ? 'גבוה' : alert.severity === 'medium' ? 'בינוני' : 'נמוך'}
                          </Badge>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">{alert.description}</p>
                        {alert.recommendation && (
                          <p className="text-sm mt-2 font-medium text-[var(--text-primary)]">המלצה: {alert.recommendation}</p>
                        )}
                      </div>

                      {/* Status dot */}
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-2 ${alertDot}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Category Analysis */}
          {result.category_analysis?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">ניתוח לפי קטגוריה</h2>
              <div className="space-y-2">
                {result.category_analysis.map((cat, i) => {
                  const catGradients = [
                    'from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 'from-emerald-500 to-emerald-600',
                    'from-amber-500 to-amber-600', 'from-cyan-500 to-cyan-600', 'from-pink-500 to-pink-600',
                    'from-indigo-500 to-indigo-600', 'from-teal-500 to-teal-600',
                  ]
                  const catGradient = catGradients[i % catGradients.length]
                  const trendDot = cat.trend === 'up' ? 'bg-red-500' : cat.trend === 'down' ? 'bg-emerald-500' : 'bg-blue-400'
                  const maxTotal = Math.max(...result.category_analysis.map(c => c.total), 1)
                  const barPct = Math.round((cat.total / maxTotal) * 100)
                  return (
                    <div
                      key={i}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all"
                    >
                      {/* Category circle */}
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${catGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                        {cat.category?.substring(0, 2)}
                      </div>

                      {/* Info with progress bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[14px] font-semibold text-[var(--text-primary)]">{cat.category}</span>
                          {cat.trend === 'up' && <Badge variant="danger" className="gap-1 text-[10px]"><TrendingUp className="h-3 w-3" />עולה</Badge>}
                          {cat.trend === 'down' && <Badge variant="success" className="gap-1 text-[10px]"><TrendingDown className="h-3 w-3" />יורד</Badge>}
                          {cat.trend === 'stable' && <Badge variant="default" className="text-[10px]">יציב</Badge>}
                        </div>
                        <div className="h-1.5 w-full max-w-[200px] rounded-full bg-slate-100 mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${catGradient} transition-all duration-500`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        {cat.alert && <p className="text-[11px] text-[var(--text-muted)] mt-1">{cat.alert}</p>}
                      </div>

                      {/* Amount & change */}
                      <div className="text-left min-w-[100px] shrink-0">
                        <p className="text-[15px] font-bold text-[var(--text-primary)]">{formatCurrency(cat.total)}</p>
                        {cat.change_pct != null && (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${trendDot}`} />
                            <span className={`text-xs font-medium ${cat.change_pct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {cat.change_pct > 0 ? '+' : ''}{cat.change_pct}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Monthly Comparison */}
          {result.monthly_comparison?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">השוואה חודשית</h2>
              <div className="space-y-2">
                {result.monthly_comparison.map((m, i) => {
                  const balanceGradient = m.balance >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'
                  const balanceDot = m.balance >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                  return (
                    <div
                      key={i}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all"
                    >
                      {/* Month circle */}
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${balanceGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                        {m.month?.substring(0, 3) || `${i + 1}`}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">{m.month}</span>
                        <div className="flex items-center gap-4 text-xs mt-0.5">
                          <span className="text-green-600">הכנסות: {formatCurrency(m.income)}</span>
                          <span className="text-red-600">הוצאות: {formatCurrency(m.expenses)}</span>
                        </div>
                        {m.alerts?.length > 0 && (
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {m.alerts.map((a, j) => <span key={j} className="block">{a}</span>)}
                          </div>
                        )}
                      </div>

                      {/* Balance */}
                      <div className="text-left min-w-[100px] shrink-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${balanceDot}`} />
                          <span className={`text-[15px] font-bold ${m.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)]">מאזן</span>
                      </div>
                    </div>
                  )
                })}
              </div>
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
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-amber-100 bg-white hover:shadow-sm transition-all">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <p className="text-sm text-[var(--text-primary)] flex-1 leading-relaxed">{insight}</p>
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-2" />
                  </div>
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
                  <div key={i} className="relative rounded-xl border border-[var(--border)] bg-white overflow-hidden hover:shadow-md hover:border-blue-200 transition-all">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Zap className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[var(--text-primary)]">{rec.title}</p>
                          {rec.potential_saving && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <p className="text-xs font-medium text-green-600">חיסכון פוטנציאלי: {rec.potential_saving}</p>
                            </div>
                          )}
                          <p className="text-sm text-[var(--text-secondary)] mt-1">{rec.action}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
