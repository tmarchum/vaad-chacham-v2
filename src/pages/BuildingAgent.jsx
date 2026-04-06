import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Bot, Brain, Wrench, AlertTriangle, CheckCircle, TrendingUp,
  Star, Zap, Shield, Activity, RefreshCw, PlusCircle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColorVar(score) {
  if (score >= 80) return 'var(--success, #22c55e)'
  if (score >= 60) return '#f59e0b'
  return 'var(--danger, #ef4444)'
}

function scoreLabel(score) {
  if (score >= 80) return 'מצוין'
  if (score >= 60) return 'טוב'
  return 'דורש שיפור'
}

function urgencyLabel(urgency) {
  if (urgency === 'high') return 'דחוף'
  if (urgency === 'medium') return 'בינוני'
  return 'נמוך'
}

function urgencyVariant(urgency) {
  if (urgency === 'high') return 'danger'
  if (urgency === 'medium') return 'warning'
  return 'default'
}

function StarRating({ value = 0 }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-3.5 w-3.5"
          style={{ color: i <= Math.round(value) ? '#f59e0b' : 'var(--border)' }}
          fill={i <= Math.round(value) ? '#f59e0b' : 'none'}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// BuildingAgent
// ---------------------------------------------------------------------------

export default function BuildingAgent() {
  const { selectedBuilding } = useBuildingContext()
  const [activeTab, setActiveTab] = useState('health')

  const { data: allIssues, create: createIssue } = useCollection('issues')
  const { data: allTasks } = useCollection('recurringTasks')
  const { data: allCompliance } = useCollection('compliance')
  const { data: allPayments } = useCollection('payments')
  const { data: allExpenses } = useCollection('expenses')
  const { data: allAssets } = useCollection('buildingAssets')
  const { data: allVendors } = useCollection('vendors')
  const { data: allWorkOrders } = useCollection('workOrders')

  // ---------------------------------------------------------------------------
  // Health Score
  // ---------------------------------------------------------------------------

  const healthScore = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id

    // 1. Compliance Score (20%)
    const bCompliance = allCompliance.filter((c) => c.buildingId === bId)
    const validCompliance = bCompliance.filter(
      (c) => c.expiry_date && new Date(c.expiry_date) >= new Date()
    )
    const complianceScore =
      bCompliance.length > 0
        ? Math.round((validCompliance.length / bCompliance.length) * 100)
        : 50

    // 2. Maintenance Score (25%)
    const bTasks = allTasks.filter((t) => t.buildingId === bId)
    const overdueTasks = bTasks.filter(
      (t) => t.next_due_date && new Date(t.next_due_date) < new Date()
    )
    const maintenanceScore =
      bTasks.length > 0
        ? Math.round(((bTasks.length - overdueTasks.length) / bTasks.length) * 100)
        : 80

    // 3. Issues Score (25%)
    const bIssues = allIssues.filter((i) => i.buildingId === bId)
    const openIssues = bIssues.filter(
      (i) => !['resolved', 'closed', 'completed'].includes(i.status)
    )
    const urgentIssues = openIssues.filter((i) => i.priority === 'urgent')
    const issueScore = Math.max(
      0,
      100 - openIssues.length * 10 - urgentIssues.length * 20
    )

    // 4. Financial Score (15%)
    const currentMonth = new Date().toISOString().slice(0, 7)
    const bPayments = allPayments.filter(
      (p) => p.buildingId === bId && p.month === currentMonth
    )
    const paidPayments = bPayments.filter((p) => p.status === 'paid')
    const financialScore =
      bPayments.length > 0
        ? Math.round((paidPayments.length / bPayments.length) * 100)
        : 70

    // 5. Asset Score (15%)
    const bAssets = allAssets.filter((a) => a.buildingId === bId)
    const overdueAssets = bAssets.filter(
      (a) => a.nextService && new Date(a.nextService) < new Date()
    )
    const assetScore =
      bAssets.length > 0
        ? Math.round(((bAssets.length - overdueAssets.length) / bAssets.length) * 100)
        : 80

    const overall = Math.round(
      complianceScore * 0.2 +
        maintenanceScore * 0.25 +
        issueScore * 0.25 +
        financialScore * 0.15 +
        assetScore * 0.15
    )

    return {
      overall,
      complianceScore,
      maintenanceScore,
      issueScore,
      financialScore,
      assetScore,
      overdueTasks: overdueTasks.length,
      openIssues: openIssues.length,
      urgentIssues: urgentIssues.length,
    }
  }, [selectedBuilding, allCompliance, allTasks, allIssues, allPayments, allAssets])

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  const recommendations = useMemo(() => {
    if (!selectedBuilding) return []
    const bId = selectedBuilding.id
    const today = new Date()
    const recs = []

    // Overdue recurring tasks
    allTasks
      .filter((t) => t.buildingId === bId && t.next_due_date && new Date(t.next_due_date) < today)
      .forEach((t) =>
        recs.push({
          id: `task_${t.id}`,
          type: 'task',
          urgency: 'high',
          title: `משימה באיחור: ${t.title}`,
          reason: `הגיע לביצוע ב-${formatDate(t.next_due_date)}`,
          category: 'תחזוקה',
          suggestedVendorCategory: null,
          sourceId: t.id,
          sourceType: 'recurringTask',
        })
      )

    // Assets overdue for service
    allAssets
      .filter((a) => a.buildingId === bId && a.nextService && new Date(a.nextService) < today)
      .forEach((a) =>
        recs.push({
          id: `asset_${a.id}`,
          type: 'asset',
          urgency: 'high',
          title: `ציוד דורש תחזוקה: ${a.name}`,
          reason: `טיפול היה אמור להתבצע ב-${formatDate(a.nextService)}`,
          category: a.category,
          suggestedVendorCategory: a.category,
          sourceId: a.id,
          sourceType: 'asset',
        })
      )

    // Compliance expiring in 60 days
    const in60 = new Date()
    in60.setDate(in60.getDate() + 60)
    allCompliance
      .filter(
        (c) =>
          c.buildingId === bId &&
          c.expiry_date &&
          new Date(c.expiry_date) <= in60 &&
          new Date(c.expiry_date) >= today
      )
      .forEach((c) =>
        recs.push({
          id: `comp_${c.id}`,
          type: 'compliance',
          urgency: 'medium',
          title: `חידוש ${c.type || ''}: ${c.title}`,
          reason: `פג תוקף ב-${formatDate(c.expiry_date)}`,
          category: 'רגולציה',
          suggestedVendorCategory: null,
          sourceId: c.id,
          sourceType: 'compliance',
        })
      )

    // Assets service due within 30 days
    const in30 = new Date()
    in30.setDate(in30.getDate() + 30)
    allAssets
      .filter(
        (a) =>
          a.buildingId === bId &&
          a.nextService &&
          new Date(a.nextService) > today &&
          new Date(a.nextService) <= in30
      )
      .forEach((a) =>
        recs.push({
          id: `asset_soon_${a.id}`,
          type: 'asset',
          urgency: 'low',
          title: `תחזוקה מתקרבת: ${a.name}`,
          reason: `טיפול נדרש ב-${formatDate(a.nextService)}`,
          category: a.category,
          suggestedVendorCategory: a.category,
          sourceId: a.id,
          sourceType: 'asset',
        })
      )

    const urgencyOrder = { high: 0, medium: 1, low: 2 }
    return recs.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
  }, [selectedBuilding, allTasks, allAssets, allCompliance])

  // ---------------------------------------------------------------------------
  // Issue Analysis data
  // ---------------------------------------------------------------------------

  const issueAnalysis = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id
    const bIssues = allIssues.filter((i) => i.buildingId === bId)
    const open = bIssues.filter((i) => !['resolved', 'closed', 'completed'].includes(i.status))
    const resolved = bIssues.filter((i) => ['resolved', 'closed', 'completed'].includes(i.status))

    // Avg resolution days
    const resolvedWithDates = resolved.filter((i) => i.created_at && i.resolved_at)
    const avgResolutionDays =
      resolvedWithDates.length > 0
        ? Math.round(
            resolvedWithDates.reduce(
              (sum, i) =>
                sum +
                Math.max(
                  0,
                  Math.round(
                    (new Date(i.resolved_at) - new Date(i.created_at)) / (1000 * 60 * 60 * 24)
                  )
                ),
              0
            ) / resolvedWithDates.length
          )
        : 0

    // Category breakdown
    const categoryMap = {}
    bIssues.forEach((i) => {
      const cat = i.category || 'כללי'
      categoryMap[cat] = (categoryMap[cat] || 0) + 1
    })
    const categories = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    const maxCategoryCount = categories.length > 0 ? categories[0].count : 1

    // Recurring issues (same title appears more than once)
    const titleMap = {}
    bIssues.forEach((i) => {
      const t = (i.title || '').trim()
      if (!t) return
      titleMap[t] = (titleMap[t] || 0) + 1
    })
    const recurringTitles = Object.entries(titleMap)
      .filter(([, count]) => count > 1)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)

    // Monthly trend last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
      months.push({ key, label, count: 0 })
    }
    bIssues.forEach((issue) => {
      if (!issue.created_at) return
      const key = new Date(issue.created_at).toISOString().slice(0, 7)
      const m = months.find((mo) => mo.key === key)
      if (m) m.count++
    })

    return { total: bIssues.length, open: open.length, resolved: resolved.length, avgResolutionDays, categories, maxCategoryCount, recurringTitles, months }
  }, [selectedBuilding, allIssues])

  // ---------------------------------------------------------------------------
  // Vendor Intelligence data
  // ---------------------------------------------------------------------------

  const vendorIntel = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id

    // Best performers: top 3 vendors by rating
    const bWorkOrders = allWorkOrders.filter((w) => w.buildingId === bId)
    const vendorJobCount = {}
    bWorkOrders.forEach((w) => {
      if (w.vendorId) vendorJobCount[w.vendorId] = (vendorJobCount[w.vendorId] || 0) + 1
    })
    const topVendors = [...allVendors]
      .filter((v) => v.rating != null)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 3)
      .map((v) => ({ ...v, jobCount: vendorJobCount[v.id] || 0 }))

    // Open issue matching
    const bOpenIssues = allIssues.filter(
      (i) => i.buildingId === bId && !['resolved', 'closed', 'completed'].includes(i.status)
    )
    const matchedIssues = bOpenIssues.slice(0, 8).map((issue) => {
      const matched = allVendors.find(
        (v) =>
          v.category &&
          issue.category &&
          (v.category === issue.category ||
            issue.category.includes(v.category) ||
            v.category.includes(issue.category))
      )
      return { issue, vendor: matched || null }
    })

    // Vendors with expiring insurance (within 60 days)
    const today = new Date()
    const in60 = new Date()
    in60.setDate(in60.getDate() + 60)
    const expiringInsurance = allVendors.filter(
      (v) =>
        v.insurance_expiry &&
        new Date(v.insurance_expiry) >= today &&
        new Date(v.insurance_expiry) <= in60
    )

    return { topVendors, matchedIssues, expiringInsurance }
  }, [selectedBuilding, allVendors, allWorkOrders, allIssues])

  // ---------------------------------------------------------------------------
  // Forecast data
  // ---------------------------------------------------------------------------

  const forecast = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id

    // Last 6 months keys
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
      months.push({ key, label, paid: 0, total: 0, expenses: 0 })
    }

    // Payments collection rate
    allPayments
      .filter((p) => p.buildingId === bId)
      .forEach((p) => {
        const m = months.find((mo) => mo.key === p.month)
        if (!m) return
        m.total++
        if (p.status === 'paid') m.paid++
      })

    // Monthly expenses
    allExpenses
      .filter((e) => e.buildingId === bId)
      .forEach((e) => {
        if (!e.date) return
        const key = new Date(e.date).toISOString().slice(0, 7)
        const m = months.find((mo) => mo.key === key)
        if (m) m.expenses += Number(e.amount) || 0
      })

    // Prediction: avg of last 3 months expenses
    const last3 = months.slice(-3)
    const avgExpenses =
      last3.length > 0
        ? Math.round(last3.reduce((s, m) => s + m.expenses, 0) / last3.length)
        : 0

    // Annual expected income rough estimate from payments
    const totalPaidThisYear = allPayments
      .filter(
        (p) =>
          p.buildingId === bId &&
          p.status === 'paid' &&
          p.month &&
          p.month.startsWith(new Date().getFullYear().toString())
      )
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const annualIncome = totalPaidThisYear || 0
    const reserveFund = Math.round(annualIncome * 0.1)

    return { months, avgExpenses, annualIncome, reserveFund }
  }, [selectedBuilding, allPayments, allExpenses])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function createTaskFromRec(rec) {
    if (!selectedBuilding) return
    createIssue({
      buildingId: selectedBuilding.id,
      title: rec.title,
      description: rec.reason,
      category: rec.category,
      status: 'open',
      priority: rec.urgency === 'high' ? 'urgent' : rec.urgency === 'medium' ? 'medium' : 'low',
      created_at: new Date().toISOString(),
    })
  }

  // ---------------------------------------------------------------------------
  // Tab definitions
  // ---------------------------------------------------------------------------

  const tabs = [
    { key: 'health', label: 'בריאות הבניין' },
    { key: 'maintain', label: 'מה לתחזק' },
    { key: 'issues', label: 'ניתוח תקלות' },
    { key: 'vendors', label: 'ניתוח ספקים' },
    { key: 'forecast', label: 'תחזית' },
  ]

  // ---------------------------------------------------------------------------
  // No building selected guard
  // ---------------------------------------------------------------------------

  if (!selectedBuilding) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Bot className="h-7 w-7 text-[var(--text-secondary)]" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">סוכן AI חכם</h1>
        </div>
        <Card>
          <CardContent className="pt-6 text-center py-16">
            <Bot className="h-12 w-12 mx-auto mb-4 text-[var(--text-secondary)] opacity-40" />
            <p className="text-[var(--text-secondary)]">יש לבחור בניין כדי להפעיל את הסוכן</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const scoreColor = healthScore ? scoreColorVar(healthScore.overall) : 'var(--border)'
  const circumference = 2 * Math.PI * 70

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Bot className="h-7 w-7" />
            סוכן AI חכם
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            ניתוח חכם ל{selectedBuilding.name || 'בניין'}
          </p>
        </div>
      </div>

      {/* Hero Health Card */}
      {healthScore && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Circle */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
                  <svg width="160" height="160" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <circle cx="80" cy="80" r="70" fill="none" stroke="var(--border)" strokeWidth="12" />
                    <circle
                      cx="80" cy="80" r="70"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="12"
                      strokeDasharray={`${circumference}`}
                      strokeDashoffset={`${circumference * (1 - healthScore.overall / 100)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                    />
                  </svg>
                  <div className="text-center z-10">
                    <div className="text-4xl font-bold" style={{ color: scoreColor }}>
                      {healthScore.overall}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">ציון בריאות</div>
                  </div>
                </div>
                <span
                  className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: scoreColor + '22', color: scoreColor }}
                >
                  {scoreLabel(healthScore.overall)}
                </span>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1 w-full">
                {[
                  { label: 'תחזוקות באיחור', value: healthScore.overdueTasks, icon: <Wrench className="h-4 w-4" />, danger: healthScore.overdueTasks > 0 },
                  { label: 'תקלות פתוחות', value: healthScore.openIssues, icon: <AlertTriangle className="h-4 w-4" />, danger: healthScore.openIssues > 3 },
                  { label: 'תקלות דחופות', value: healthScore.urgentIssues, icon: <Zap className="h-4 w-4" />, danger: healthScore.urgentIssues > 0 },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col items-center justify-center rounded-xl p-3 gap-1"
                    style={{ background: 'var(--surface-hover, var(--surface))' }}
                  >
                    <span
                      style={{ color: stat.danger ? 'var(--danger)' : 'var(--text-secondary)' }}
                    >
                      {stat.icon}
                    </span>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: stat.danger ? 'var(--danger)' : 'var(--text-primary)' }}
                    >
                      {stat.value}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] text-center">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div>
        <TabGroup tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-4 space-y-4">
          {/* ---------------------------------------------------------------- */}
          {/* Tab: בריאות הבניין                                               */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'health' && healthScore && (
            <div className="grid grid-cols-1 gap-4">
              {[
                {
                  label: 'תקינה',
                  score: healthScore.complianceScore,
                  icon: <Shield className="h-5 w-5" />,
                  finding:
                    healthScore.complianceScore < 80
                      ? 'ישנם מסמכי תקינות שפג תוקפם'
                      : 'כל מסמכי התקינות בתוקף',
                },
                {
                  label: 'תחזוקה',
                  score: healthScore.maintenanceScore,
                  icon: <Wrench className="h-5 w-5" />,
                  finding:
                    healthScore.overdueTasks > 0
                      ? `${healthScore.overdueTasks} משימות תחזוקה באיחור`
                      : 'כל משימות התחזוקה מעודכנות',
                },
                {
                  label: 'תקלות',
                  score: healthScore.issueScore,
                  icon: <AlertTriangle className="h-5 w-5" />,
                  finding:
                    healthScore.openIssues > 0
                      ? `${healthScore.openIssues} תקלות פתוחות, ${healthScore.urgentIssues} דחופות`
                      : 'אין תקלות פתוחות',
                },
                {
                  label: 'גבייה',
                  score: healthScore.financialScore,
                  icon: <TrendingUp className="h-5 w-5" />,
                  finding:
                    healthScore.financialScore < 80
                      ? 'שיעור הגבייה החודשי נמוך מהמצופה'
                      : 'שיעור הגבייה החודשי תקין',
                },
                {
                  label: 'ציוד',
                  score: healthScore.assetScore,
                  icon: <Activity className="h-5 w-5" />,
                  finding:
                    healthScore.assetScore < 80
                      ? 'ציוד מסוים דורש טיפול שירות'
                      : 'כל הציוד מתוחזק כנדרש',
                },
              ].map((item) => {
                const color = scoreColorVar(item.score)
                return (
                  <Card key={item.label}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span style={{ color }}>{item.icon}</span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </span>
                        <span className="mr-auto font-bold text-lg" style={{ color }}>
                          {item.score}
                        </span>
                      </div>
                      <Progress value={item.score} color={color} />
                      <p className="text-xs text-[var(--text-secondary)] mt-2">{item.finding}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Tab: מה לתחזק                                                    */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'maintain' && (
            <div className="space-y-3">
              {recommendations.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center py-12">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-[var(--success,#22c55e)]" />
                    <p className="text-[var(--text-secondary)]">אין המלצות פעילות כרגע. כל הבניין תקין!</p>
                  </CardContent>
                </Card>
              ) : (
                recommendations.map((rec) => (
                  <Card key={rec.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant={urgencyVariant(rec.urgency)}>
                              {urgencyLabel(rec.urgency)}
                            </Badge>
                            {rec.category && (
                              <Badge variant="default">{rec.category}</Badge>
                            )}
                          </div>
                          <p className="font-semibold text-[var(--text-primary)] text-sm mt-1">
                            {rec.title}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {rec.reason}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0"
                          onClick={() => createTaskFromRec(rec)}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          צור משימה
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Tab: ניתוח תקלות                                                 */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'issues' && issueAnalysis && (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'סה"כ תקלות', value: issueAnalysis.total, icon: <Activity className="h-4 w-4" /> },
                  { label: 'פתוחות', value: issueAnalysis.open, icon: <AlertTriangle className="h-4 w-4" />, color: 'var(--danger)' },
                  { label: 'סגורות', value: issueAnalysis.resolved, icon: <CheckCircle className="h-4 w-4" />, color: 'var(--success,#22c55e)' },
                  { label: 'ימי טיפול ממוצע', value: issueAnalysis.avgResolutionDays || '—', icon: <RefreshCw className="h-4 w-4" /> },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-4 pb-4 text-center">
                      <span
                        className="flex justify-center mb-1"
                        style={{ color: s.color || 'var(--text-secondary)' }}
                      >
                        {s.icon}
                      </span>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: s.color || 'var(--text-primary)' }}
                      >
                        {s.value}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{s.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Category breakdown */}
              {issueAnalysis.categories.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>פילוח לפי קטגוריה</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {issueAnalysis.categories.map((cat) => (
                      <div key={cat.name} className="flex items-center gap-3">
                        <span className="text-sm text-[var(--text-secondary)] w-24 shrink-0 text-right">
                          {cat.name}
                        </span>
                        <div className="flex-1 h-5 rounded-full overflow-hidden bg-[var(--border-light,var(--border))]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.round((cat.count / issueAnalysis.maxCategoryCount) * 100)}%`,
                              backgroundColor: 'var(--primary)',
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-[var(--text-primary)] w-6 text-left">
                          {cat.count}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recurring issues */}
              {issueAnalysis.recurringTitles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>תקלות חוזרות</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {issueAnalysis.recurringTitles.map((r) => (
                      <div
                        key={r.title}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ background: 'var(--surface-hover, #f9f9f9)' }}
                      >
                        <span className="text-sm text-[var(--text-primary)]">{r.title}</span>
                        <Badge variant="warning">חוזרת × {r.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Monthly trend */}
              <Card>
                <CardHeader>
                  <CardTitle>מגמה חודשית (6 חודשים אחרונים)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {issueAnalysis.months.map((m) => (
                            <th
                              key={m.key}
                              className="text-center pb-2 text-xs text-[var(--text-secondary)] font-medium"
                            >
                              {m.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {issueAnalysis.months.map((m) => (
                            <td key={m.key} className="text-center">
                              <span
                                className="inline-block w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center mx-auto"
                                style={{
                                  background: m.count > 0 ? 'var(--primary-bg, #eff6ff)' : 'var(--border-light, #f1f5f9)',
                                  color: m.count > 0 ? 'var(--primary)' : 'var(--text-secondary)',
                                }}
                              >
                                {m.count}
                              </span>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Tab: ניתוח ספקים                                                  */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'vendors' && vendorIntel && (
            <div className="space-y-4">
              {/* Top performers */}
              <Card>
                <CardHeader>
                  <CardTitle>ספקים מובילים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vendorIntel.topVendors.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">אין נתוני ספקים</p>
                  ) : (
                    vendorIntel.topVendors.map((v, idx) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--surface-hover, #f9f9f9)' }}
                      >
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{
                            background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f1f5f9' : '#fde8d8',
                            color: idx === 0 ? '#d97706' : idx === 1 ? '#64748b' : '#c2410c',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-[var(--text-primary)]">
                            {v.name}
                          </p>
                          {v.category && (
                            <p className="text-xs text-[var(--text-secondary)]">{v.category}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StarRating value={v.rating} />
                          <span className="text-xs text-[var(--text-secondary)]">
                            {v.jobCount} עבודות
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Issue matching */}
              {vendorIntel.matchedIssues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>התאמת תקלות לספקים</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {vendorIntel.matchedIssues.map(({ issue, vendor }) => (
                      <div
                        key={issue.id}
                        className="flex items-center gap-2 p-2 rounded-lg text-sm"
                        style={{ background: 'var(--surface-hover, #f9f9f9)' }}
                      >
                        <span className="flex-1 text-[var(--text-primary)] truncate">
                          {issue.title}
                        </span>
                        <span className="text-[var(--text-secondary)]">→</span>
                        {vendor ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--text-primary)] font-medium">
                              {vendor.name}
                            </span>
                            <StarRating value={vendor.rating} />
                          </div>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">אין ספק מתאים</span>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Expiring insurance */}
              {vendorIntel.expiringInsurance.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>ביטוח ספקים שפג עד 60 יום</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {vendorIntel.expiringInsurance.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ background: '#fef9ec' }}
                      >
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {v.name}
                        </span>
                        <Badge variant="warning">
                          פג תוקף: {formatDate(v.insurance_expiry)}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Tab: תחזית                                                        */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'forecast' && forecast && (
            <div className="space-y-4">
              {/* Prediction banner */}
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--primary-bg, #eff6ff)' }}
                    >
                      <Brain className="h-5 w-5" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)]">תחזית הוצאות חודש הבא</p>
                      <p className="text-xl font-bold text-[var(--text-primary)]">
                        {formatCurrency(forecast.avgExpenses)}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        ממוצע 3 חודשים אחרונים
                      </p>
                    </div>
                    {forecast.reserveFund > 0 && (
                      <div className="mr-auto text-left">
                        <p className="text-xs text-[var(--text-secondary)]">קרן רזרבה מומלצת (10%)</p>
                        <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>
                          {formatCurrency(forecast.reserveFund)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Payment collection trend */}
              <Card>
                <CardHeader>
                  <CardTitle>שיעור גבייה (6 חודשים)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-right py-2 pr-2 text-[var(--text-secondary)] font-medium">
                            חודש
                          </th>
                          <th className="text-center py-2 text-[var(--text-secondary)] font-medium">
                            שולמו
                          </th>
                          <th className="text-center py-2 text-[var(--text-secondary)] font-medium">
                            סה"כ
                          </th>
                          <th className="text-center py-2 text-[var(--text-secondary)] font-medium">
                            %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.months.map((m) => {
                          const pct = m.total > 0 ? Math.round((m.paid / m.total) * 100) : null
                          return (
                            <tr
                              key={m.key}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="py-2 pr-2 text-[var(--text-primary)]">{m.label}</td>
                              <td className="py-2 text-center text-[var(--text-primary)]">
                                {m.paid}
                              </td>
                              <td className="py-2 text-center text-[var(--text-primary)]">
                                {m.total}
                              </td>
                              <td className="py-2 text-center">
                                {pct !== null ? (
                                  <span
                                    className="font-semibold"
                                    style={{ color: scoreColorVar(pct) }}
                                  >
                                    {pct}%
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly expenses trend */}
              <Card>
                <CardHeader>
                  <CardTitle>הוצאות חודשיות (6 חודשים)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-right py-2 pr-2 text-[var(--text-secondary)] font-medium">
                            חודש
                          </th>
                          <th className="text-left py-2 pl-2 text-[var(--text-secondary)] font-medium">
                            הוצאות
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.months.map((m) => (
                          <tr
                            key={m.key}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="py-2 pr-2 text-[var(--text-primary)]">{m.label}</td>
                            <td className="py-2 pl-2 text-left font-medium text-[var(--text-primary)]">
                              {m.expenses > 0 ? formatCurrency(m.expenses) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
