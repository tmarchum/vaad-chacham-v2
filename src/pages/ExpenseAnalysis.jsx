import { useState, useMemo, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { findExpenseCategory, LEGACY_EXPENSE_MAP } from '@/lib/categories'
import { HEBREW_MONTHS as MONTH_NAMES } from '@/lib/constants'
import {
  Brain, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Lightbulb, ShieldAlert, Scale, Zap, BarChart2, PieChart, CalendarRange,
} from 'lucide-react'

const HEALTH_STYLES = {
  good: { label: 'תקין', variant: 'success' },
  warning: { label: 'דורש תשומת לב', variant: 'warning' },
  critical: { label: 'קריטי', variant: 'danger' },
}

const SEVERITY = {
  high: { label: 'גבוה', variant: 'danger', tile: 'bg-[var(--danger-light)] text-[var(--danger)]' },
  medium: { label: 'בינוני', variant: 'warning', tile: 'bg-[var(--warning-light)] text-[var(--warning)]' },
  low: { label: 'נמוך', variant: 'info', tile: 'bg-[var(--surface-secondary)] text-[var(--primary)]' },
}

const PALETTE = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--primary-dark)', 'var(--danger)', 'var(--text-muted)']

function catLabel(val) {
  if (!val) return 'לא מסווג'
  const c = findExpenseCategory(val) || findExpenseCategory(LEGACY_EXPENSE_MAP[val])
  return c?.label || val
}

export default function ExpenseAnalysis() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allTx, isLoading } = useCollection('bankTransactions', scope)
  const { data: allExpenses } = useCollection('expenses', scope)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
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

      if (fnError) {
        // supabase-js hides the body of non-2xx responses — read our Hebrew message.
        let msg = fnError.message
        try { msg = (await fnError.context?.json())?.error || msg } catch { /* */ }
        throw new Error(msg)
      }
      const r = data?.result || null
      if (r && typeof r.summary === 'string' && /^\s*[{[]/.test(r.summary)) throw new Error('הניתוח חזר בפורמט לא תקין — נסו שוב')
      setResult(r)
    } catch (err) {
      setError(err.message || 'שגיאה בניתוח')
    } finally {
      setLoading(false)
    }
  }, [analysisData, selectedBuilding])

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ניתוח הוצאות</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={Brain} title="בחר בניין" description="יש לבחור בניין כדי להפעיל ניתוח" />
  }

  // ── Local analytics (from the same data sent to the agent) ──
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    const expenses = (analysisData?.expensesByMonth[key] || []).reduce((s, e) => s + e.amount, 0)
    const income = analysisData?.incomeByMonth[key]?.total || 0
    return { key, label: MONTH_NAMES[i], expenses, income }
  })
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0)
  const totalIncome = months.reduce((s, m) => s + m.income, 0)
  const net = totalIncome - totalExpenses
  const expenseMonths = months.filter(m => m.expenses > 0)
  const avgMonthly = expenseMonths.length ? totalExpenses / expenseMonths.length : 0
  const peakMonth = [...expenseMonths].sort((a, b) => b.expenses - a.expenses)[0]
  const chartMax = Math.max(1, ...months.map(m => Math.max(m.income, m.expenses)))
  const byCat = Object.entries(
    Object.values(analysisData?.expensesByMonth || {}).flat().reduce((m, e) => {
      const k = catLabel(e.cat)
      m[k] = (m[k] || 0) + e.amount
      return m
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const catRows = byCat.slice(0, 5)
  if (byCat.length > 5) catRows.push(['שונות', byCat.slice(5).reduce((a, [, v]) => a + v, 0)])
  const topCat = byCat[0]
  const topCatPct = topCat && totalExpenses > 0 ? Math.round((topCat[1] / totalExpenses) * 100) : 0
  const healthStyle = result?.health ? HEALTH_STYLES[result.health] : null
  const signed = (v) => `${v >= 0 ? '+' : ''}${formatCurrency(v)}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ניתוח הוצאות — {selectedYear}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">השוואה חודשית, פילוח קטגוריות, זיהוי חריגות והמלצות AI • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setResult(null) }} options={yearOptions} className="w-28" aria-label="שנה" />
          <Button onClick={runAnalysis} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? 'מנתח...' : 'הפעל ניתוח AI'}
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={`סה״כ הוצאות ${selectedYear}`} icon={TrendingDown} color="red"
          value={formatCurrency(totalExpenses)}
          sub={`${expenseMonths.length} חודשים עם הוצאות`} />
        <StatCard label="ממוצע הוצאות חודשי" icon={BarChart2} color="blue"
          value={avgMonthly > 0 ? formatCurrency(Math.round(avgMonthly)) : '—'}
          sub={peakMonth ? `שיא: ${peakMonth.label} (${formatCurrency(peakMonth.expenses)})` : 'אין נתונים'} />
        <StatCard label={`מאזן ${selectedYear}`} icon={Scale} color={net >= 0 ? 'emerald' : 'red'}
          value={signed(net)}
          sub={`הכנסות ${formatCurrency(totalIncome)}`} />
        <StatCard label="הקטגוריה המובילה" icon={PieChart} color="purple"
          value={topCat ? `${topCatPct}%` : '—'}
          sub={topCat ? `${topCat[0]} • ${formatCurrency(topCat[1])}` : 'אין הוצאות מסווגות'}
          progress={topCat ? topCatPct : undefined} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <SectionCard className="xl:col-span-8" icon={BarChart2} title="הכנסות מול הוצאות לפי חודש" subtitle={selectedYear}
          actions={
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />הכנסות</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />הוצאות</span>
            </div>
          }
          bodyClassName="p-4">
          {totalExpenses === 0 && totalIncome === 0 ? (
            <p className="text-center text-[12px] text-[var(--text-muted)] py-10">אין נתונים לשנה זו</p>
          ) : (
            <div className="flex items-end gap-1.5 sm:gap-2 h-48 overflow-x-auto">
              {months.map(m => (
                <div key={m.key} className="flex-1 min-w-[22px] flex flex-col items-center gap-1 h-full justify-end" title={`${m.label}: הכנסות ${formatCurrency(m.income)} • הוצאות ${formatCurrency(m.expenses)}`}>
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

        <SectionCard className="xl:col-span-4" icon={PieChart} title="פילוח לפי קטגוריה" subtitle={`סה״כ ${formatCurrency(totalExpenses)}`} bodyClassName="p-4">
          {catRows.length === 0 ? (
            <p className="text-center text-[12px] text-[var(--text-muted)] py-10">אין הוצאות לשנה זו</p>
          ) : (
            <div className="space-y-3">
              {catRows.map(([label, value], i) => {
                const pct = totalExpenses ? Math.round((value / totalExpenses) * 1000) / 10 : 0
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PALETTE[i] }} /><span className="truncate font-medium text-[var(--text-primary)]">{label}</span></span>
                      <span className="shrink-0 num-tabular"><strong>{formatCurrency(value)}</strong> <span className="text-[var(--text-muted)]">({pct}%)</span></span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* AI analysis */}
      <SectionCard icon={Brain} title="ניתוח AI" subtitle="הסוכן מנתח את ההוצאות וההכנסות של השנה ומחזיר תובנות והמלצות"
        actions={healthStyle ? <Badge variant={healthStyle.variant}>{healthStyle.label}</Badge> : null}
        bodyClassName="p-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-[var(--radius)] bg-[var(--danger-light)] text-[var(--danger)] text-[13px]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {!result && !loading && !error && (
          <EmptyState
            icon={Brain}
            title="לחץ על הפעל ניתוח AI"
            description="הסוכן ינתח את כל ההוצאות וההכנסות שלך ויתן תובנות חכמות"
            actionLabel="הפעל ניתוח AI"
            onAction={runAnalysis}
          />
        )}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
            <p className="text-sm text-[var(--text-secondary)]">הסוכן מנתח את הנתונים...</p>
          </div>
        )}
        {result && (
          <div className="space-y-4">
            {result.summary && <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">{result.summary}</p>}
            {result.income_vs_expense && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                  <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-[var(--success)]" />סה״כ הכנסות</p>
                  <p className="text-[18px] font-bold num-tabular text-[var(--success)]">{formatCurrency(result.income_vs_expense.total_income)}</p>
                </div>
                <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                  <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-[var(--danger)]" />סה״כ הוצאות</p>
                  <p className="text-[18px] font-bold num-tabular text-[var(--danger)]">{formatCurrency(result.income_vs_expense.total_expenses)}</p>
                </div>
                <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                  <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1"><Scale className="h-3.5 w-3.5 text-[var(--primary)]" />מאזן</p>
                  <p className={`text-[18px] font-bold num-tabular ${result.income_vs_expense.net >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{signed(result.income_vs_expense.net)}</p>
                  {result.income_vs_expense.assessment && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{result.income_vs_expense.assessment}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {result && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 space-y-6 min-w-0">
            {/* Alerts */}
            {result.alerts?.length > 0 && (
              <SectionCard icon={ShieldAlert} title="התראות" subtitle={`${result.alerts.length} ממצאים`} bodyClassName="divide-y divide-[var(--border-light)]">
                {result.alerts.map((alert, i) => {
                  const sev = SEVERITY[alert.severity] || SEVERITY.low
                  return (
                    <div key={i} className="flex items-start gap-3 p-4">
                      <span className={`p-1.5 rounded-[var(--radius)] shrink-0 ${sev.tile}`}><AlertTriangle className="h-4 w-4" /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{alert.title}</p>
                          <Badge variant={sev.variant}>{sev.label}</Badge>
                        </div>
                        <p className="text-[12px] text-[var(--text-secondary)]">{alert.description}</p>
                        {alert.recommendation && (
                          <p className="text-[12px] mt-1.5 font-medium text-[var(--text-primary)]">המלצה: {alert.recommendation}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </SectionCard>
            )}

            {/* Category analysis */}
            {result.category_analysis?.length > 0 && (
              <SectionCard icon={PieChart} title="ניתוח לפי קטגוריה" bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>קטגוריה</th><th>מגמה</th><th className="!text-left">סכום</th><th className="!text-left">שינוי</th></tr>
                    </thead>
                    <tbody>
                      {result.category_analysis.map((cat, i) => {
                        const maxTotal = Math.max(...result.category_analysis.map(c => c.total), 1)
                        const barPct = Math.round((cat.total / maxTotal) * 100)
                        return (
                          <tr key={i}>
                            <td className="min-w-[180px]">
                              <span className="text-[13px] font-semibold">{cat.category}</span>
                              <div className="h-1.5 w-full max-w-[200px] rounded-full bg-[var(--surface-container)] mt-1 overflow-hidden">
                                <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-500" style={{ width: `${barPct}%` }} />
                              </div>
                              {cat.alert && <span className="block text-[11px] text-[var(--text-muted)] mt-1">{cat.alert}</span>}
                            </td>
                            <td className="whitespace-nowrap">
                              {cat.trend === 'up' && <Badge variant="danger"><TrendingUp className="h-3 w-3" />עולה</Badge>}
                              {cat.trend === 'down' && <Badge variant="success"><TrendingDown className="h-3 w-3" />יורד</Badge>}
                              {cat.trend === 'stable' && <Badge variant="neutral">יציב</Badge>}
                            </td>
                            <td className="whitespace-nowrap !text-left font-bold num-tabular">{formatCurrency(cat.total)}</td>
                            <td className="whitespace-nowrap !text-left">
                              {cat.change_pct != null && (
                                <span className={`text-[12px] font-semibold num-tabular ${cat.change_pct > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                                  {cat.change_pct > 0 ? '+' : ''}{cat.change_pct}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Monthly comparison */}
            {result.monthly_comparison?.length > 0 && (
              <SectionCard icon={CalendarRange} title="השוואה חודשית" bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>חודש</th><th className="!text-left">הכנסות</th><th className="!text-left">הוצאות</th><th className="!text-left">מאזן</th><th>הערות</th></tr>
                    </thead>
                    <tbody>
                      {result.monthly_comparison.map((m, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap font-semibold">{m.month || `${i + 1}`}</td>
                          <td className="whitespace-nowrap !text-left num-tabular text-[var(--success)]">{formatCurrency(m.income)}</td>
                          <td className="whitespace-nowrap !text-left num-tabular text-[var(--danger)]">{formatCurrency(m.expenses)}</td>
                          <td className={`whitespace-nowrap !text-left num-tabular font-bold ${m.balance >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{signed(m.balance)}</td>
                          <td className="text-[11px] text-[var(--text-muted)] min-w-[160px]">
                            {m.alerts?.length > 0 ? m.alerts.map((a, j) => <span key={j} className="block">{a}</span>) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}
          </div>

          <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-6">
            {/* Insights */}
            {result.insights?.length > 0 && (
              <SectionCard icon={Lightbulb} title="תובנות" bodyClassName="divide-y divide-[var(--border-light)]">
                {result.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 p-4">
                    <span className="p-1.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-[var(--warning)] shrink-0"><Lightbulb className="h-3.5 w-3.5" /></span>
                    <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{insight}</p>
                  </div>
                ))}
              </SectionCard>
            )}

            {/* Recommendations */}
            {result.recommendations?.length > 0 && (
              <SectionCard icon={Zap} title="המלצות" bodyClassName="divide-y divide-[var(--border-light)]">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-4">
                    <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Zap className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{rec.title}</p>
                      {rec.potential_saving && (
                        <Badge variant="success" className="mt-1">חיסכון פוטנציאלי: {rec.potential_saving}</Badge>
                      )}
                      <p className="text-[12px] text-[var(--text-secondary)] mt-1">{rec.action}</p>
                    </div>
                  </div>
                ))}
              </SectionCard>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
