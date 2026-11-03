import { useState, useMemo, useEffect } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { callVaadAgent } from '@/lib/vaadAgent'
import {
  Bot, Brain, Wrench, AlertTriangle, CheckCircle, TrendingUp,
  Star, Zap, Shield, Activity, RefreshCw, PlusCircle, Sparkles,
  HeartPulse, ListChecks, Store, CalendarClock, Wallet,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColorVar(score) {
  if (score >= 80) return 'var(--success)'
  if (score >= 60) return 'var(--warning)'
  return 'var(--danger)'
}

function scoreTone(score) {
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

const TONE_CHIP = {
  success: 'bg-[var(--success-light)] text-[var(--success)]',
  warning: 'bg-[var(--warning-light)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-light)] text-[var(--danger)]',
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
          style={{ color: i <= Math.round(value) ? 'var(--warning)' : 'var(--border)' }}
          fill={i <= Math.round(value) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

function IconTile({ icon: Icon, tone }) {
  const cls = tone ? TONE_CHIP[tone] : 'bg-[var(--surface-secondary)] text-[var(--primary)]'
  return (
    <span className={cn('p-1.5 rounded-[var(--radius)] shrink-0', cls)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  )
}

const fmtStamp = (ts) => new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------------------
// BuildingAgent
// ---------------------------------------------------------------------------

// Cache AI results in localStorage so they persist across navigation
const AI_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

function loadCachedAiResult(buildingId) {
  try {
    const raw = localStorage.getItem(`building-agent-ai-${buildingId}`)
    if (!raw) return null
    const { result, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > AI_CACHE_TTL_MS) return null
    return { result, timestamp }
  } catch { return null }
}

function saveCachedAiResult(buildingId, result) {
  try {
    localStorage.setItem(
      `building-agent-ai-${buildingId}`,
      JSON.stringify({ result, timestamp: Date.now() })
    )
  } catch { /* ignore storage errors */ }
}

export default function BuildingAgent() {
  const { selectedBuilding } = useBuildingContext()
  const [activeTab, setActiveTab] = useState('health')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiResultTimestamp, setAiResultTimestamp] = useState(null)
  const [aiError, setAiError] = useState(null)

  // Load cached AI result when building changes
  useEffect(() => {
    if (!selectedBuilding?.id) { setAiResult(null); setAiResultTimestamp(null); return }
    const cached = loadCachedAiResult(selectedBuilding.id)
    if (cached) {
      setAiResult(cached.result)
      setAiResultTimestamp(cached.timestamp)
    } else {
      setAiResult(null)
      setAiResultTimestamp(null)
    }
  }, [selectedBuilding?.id])

  // Building-scoped SERVER-SIDE (vendors stays global); unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allIssues, create: createIssue, isLoading } = useCollection('issues', scope)
  const { data: allTasks } = useCollection('recurringTasks', scope)
  const { data: allCompliance } = useCollection('compliance', scope)
  const { data: allPayments } = useCollection('payments', scope)
  const { data: allExpenses } = useCollection('expenses', scope)
  const { data: allAssets } = useCollection('buildingAssets', scope)
  const { data: allVendors } = useCollection('vendors')
  const { data: allWorkOrders } = useCollection('workOrders', scope)

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
  // AI Health Analysis
  // ---------------------------------------------------------------------------

  async function runAiHealthAnalysis() {
    if (!selectedBuilding || !healthScore) return
    setAiLoading(true)
    setAiResult(null)
    setAiResultTimestamp(null)
    setAiError(null)
    try {
      const result = await callVaadAgent('building_health', selectedBuilding.name, {
        overallScore: healthScore.overall,
        complianceScore: healthScore.complianceScore,
        maintenanceScore: healthScore.maintenanceScore,
        issueScore: healthScore.issueScore,
        financialScore: healthScore.financialScore,
        assetScore: healthScore.assetScore,
        openIssues: healthScore.openIssues,
        urgentIssues: healthScore.urgentIssues,
        overdueTasks: healthScore.overdueTasks,
        vendorCount: allVendors.length,
        recommendations: recommendations.slice(0, 5),
      })
      setAiResult(result)
      const now = Date.now()
      setAiResultTimestamp(now)
      saveCachedAiResult(selectedBuilding.id, result)
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
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

  const headerText = (
    <div className="min-w-0">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">סוכן AI חכם</h1>
      <p className="text-[13px] text-[var(--text-secondary)] mt-1">
        ניתוח חכם של מצב הבניין, התחזוקה, התקלות והספקים{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
      </p>
    </div>
  )

  if (isLoading) return (
    <div className="space-y-6" dir="rtl">
      {headerText}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return (
      <div className="space-y-6" dir="rtl">
        {headerText}
        <SectionCard>
          <EmptyState icon={Bot} title="לא נבחר בניין" description="יש לבחור בניין כדי להפעיל את הסוכן" />
        </SectionCard>
      </div>
    )
  }

  const scoreColor = healthScore ? scoreColorVar(healthScore.overall) : 'var(--border)'
  const circumference = 2 * Math.PI * 70

  const tabsWithCounts = tabs.map((t) => (t.key === 'maintain' ? { ...t, count: recommendations.length } : t))

  const healthItems = healthScore ? [
    {
      label: 'תקינה', score: healthScore.complianceScore, icon: Shield, weight: '20%',
      finding: healthScore.complianceScore < 80 ? 'ישנם מסמכי תקינות שפג תוקפם' : 'כל מסמכי התקינות בתוקף',
    },
    {
      label: 'תחזוקה', score: healthScore.maintenanceScore, icon: Wrench, weight: '25%',
      finding: healthScore.overdueTasks > 0 ? `${healthScore.overdueTasks} משימות תחזוקה באיחור` : 'כל משימות התחזוקה מעודכנות',
    },
    {
      label: 'תקלות', score: healthScore.issueScore, icon: AlertTriangle, weight: '25%',
      finding: healthScore.openIssues > 0 ? `${healthScore.openIssues} תקלות פתוחות, ${healthScore.urgentIssues} דחופות` : 'אין תקלות פתוחות',
    },
    {
      label: 'גבייה', score: healthScore.financialScore, icon: TrendingUp, weight: '15%',
      finding: healthScore.financialScore < 80 ? 'שיעור הגבייה החודשי נמוך מהמצופה' : 'שיעור הגבייה החודשי תקין',
    },
    {
      label: 'ציוד', score: healthScore.assetScore, icon: Activity, weight: '15%',
      finding: healthScore.assetScore < 80 ? 'ציוד מסוים דורש טיפול שירות' : 'כל הציוד מתוחזק כנדרש',
    },
  ] : []

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        {headerText}
        <div className="flex flex-col items-start lg:items-end gap-1">
          <Button onClick={runAiHealthAnalysis} disabled={aiLoading || !healthScore}>
            <Sparkles className="h-4 w-4" />
            {aiLoading ? 'מנתח...' : aiResult ? 'עדכן ניתוח AI' : 'ניתוח AI'}
          </Button>
          {aiResultTimestamp && !aiLoading && (
            <span className="text-[11px] text-[var(--text-muted)] num-tabular">
              נותח לאחרונה: {fmtStamp(aiResultTimestamp)}
            </span>
          )}
        </div>
      </div>

      {/* KPI row */}
      {healthScore && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="ציון בריאות הבניין" icon={HeartPulse}
            color={healthScore.overall >= 80 ? 'emerald' : healthScore.overall >= 60 ? 'amber' : 'red'}
            value={String(healthScore.overall)} note="/ 100"
            sub={scoreLabel(healthScore.overall)}
            progress={healthScore.overall}
          />
          <StatCard
            label="תקלות פתוחות" icon={AlertTriangle}
            color={healthScore.openIssues > 3 ? 'red' : 'blue'}
            value={String(healthScore.openIssues)}
            sub={healthScore.urgentIssues > 0 ? `${healthScore.urgentIssues} דחופות` : 'אין תקלות דחופות'}
          />
          <StatCard
            label="תחזוקות באיחור" icon={Wrench}
            color={healthScore.overdueTasks > 0 ? 'amber' : 'emerald'}
            value={String(healthScore.overdueTasks)}
            sub={healthScore.overdueTasks > 0 ? 'משימות קבועות שעבר מועדן' : 'כל המשימות בזמן'}
          />
          <StatCard
            label="המלצות פעילות" icon={ListChecks} color="purple"
            value={String(recommendations.length)}
            sub={`${recommendations.filter((r) => r.urgency === 'high').length} בעדיפות גבוהה`}
            footer={recommendations.length > 0 ? (
              <button onClick={() => setActiveTab('maintain')} className="text-[var(--primary)] font-semibold hover:underline">לרשימת התחזוקה ←</button>
            ) : null}
          />
        </div>
      )}

      {/* Filter card */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <TabGroup tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-4 min-w-0">
          {/* -------------------------------------------------------------- */}
          {/* Tab: בריאות הבניין                                             */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'health' && healthScore && (
            <SectionCard icon={HeartPulse} title="בריאות הבניין" subtitle="ציון משוקלל של תקינה, תחזוקה, תקלות, גבייה וציוד">
              <div className="flex flex-col md:flex-row items-center gap-6 p-4 border-b border-[var(--border-light)]">
                <div className="relative flex items-center justify-center shrink-0" style={{ width: 160, height: 160 }}>
                  <svg width="160" height="160" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <circle cx="80" cy="80" r="70" fill="none" stroke="var(--surface-container)" strokeWidth="12" />
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
                    <div className="text-[36px] leading-10 font-bold num-tabular" style={{ color: scoreColor }}>{healthScore.overall}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">ציון בריאות</div>
                  </div>
                </div>
                <div className="flex-1 text-center md:text-right">
                  <span className={cn('inline-block text-[12px] font-semibold px-2.5 py-0.5 rounded-full', TONE_CHIP[scoreTone(healthScore.overall)])}>
                    {scoreLabel(healthScore.overall)}
                  </span>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                    הציון מחושב מחמישה רכיבים. רכיב מתחת ל-80 מסומן כדורש תשומת לב — ראו את הפירוט למטה ואת המלצות "מה לתחזק".
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {healthItems.map((item) => {
                  const tone = scoreTone(item.score)
                  return (
                    <div key={item.label} className="flex items-center gap-3 px-4 py-3">
                      <IconTile icon={item.icon} tone={tone} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{item.label}</span>
                          <span className="text-[11px] text-[var(--text-muted)] num-tabular">משקל {item.weight}</span>
                        </div>
                        <div className="h-1.5 w-full max-w-[260px] rounded-full bg-[var(--surface-container)] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.score}%`, backgroundColor: scoreColorVar(item.score) }} />
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1">{item.finding}</p>
                      </div>
                      <span className="text-[18px] font-bold num-tabular shrink-0" style={{ color: scoreColorVar(item.score) }}>{item.score}</span>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Tab: מה לתחזק                                                  */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'maintain' && (
            <SectionCard
              icon={ListChecks}
              title="מה לתחזק"
              subtitle="משימות באיחור, ציוד לטיפול ומסמכי תקינות לחידוש"
              footer={recommendations.length > 0 ? `${recommendations.length} המלצות` : undefined}
            >
              {recommendations.length === 0 ? (
                <EmptyState icon={CheckCircle} title="הכל תקין" description="אין המלצות פעילות כרגע. כל הבניין תקין!" />
              ) : (
                <div className="divide-y divide-[var(--border-light)]">
                  {recommendations.map((rec) => (
                    <div key={rec.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <IconTile
                        icon={rec.type === 'asset' ? Activity : rec.type === 'compliance' ? Shield : Wrench}
                        tone={rec.urgency === 'high' ? 'danger' : rec.urgency === 'medium' ? 'warning' : undefined}
                      />
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{rec.title}</span>
                          <Badge variant={urgencyVariant(rec.urgency)}>{urgencyLabel(rec.urgency)}</Badge>
                          {rec.category && <Badge variant="neutral">{rec.category}</Badge>}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] num-tabular">{rec.reason}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => createTaskFromRec(rec)}>
                        <PlusCircle className="h-3.5 w-3.5" />
                        צור משימה
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Tab: ניתוח תקלות                                               */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'issues' && issueAnalysis && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label='סה"כ תקלות' icon={Activity} color="blue" value={String(issueAnalysis.total)} />
                <StatCard label="פתוחות" icon={AlertTriangle} color="red" value={String(issueAnalysis.open)} />
                <StatCard label="סגורות" icon={CheckCircle} color="emerald" value={String(issueAnalysis.resolved)} />
                <StatCard label="ימי טיפול ממוצע" icon={RefreshCw} color="purple" value={String(issueAnalysis.avgResolutionDays || '—')} />
              </div>

              {issueAnalysis.categories.length > 0 && (
                <SectionCard icon={Activity} title="פילוח לפי קטגוריה" bodyClassName="p-4 space-y-3">
                  {issueAnalysis.categories.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-3">
                      <span className="text-[12px] text-[var(--text-secondary)] w-24 shrink-0 truncate">{cat.name}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--surface-container)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all duration-500"
                          style={{ width: `${Math.round((cat.count / issueAnalysis.maxCategoryCount) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold text-[var(--text-primary)] w-6 text-left num-tabular">{cat.count}</span>
                    </div>
                  ))}
                </SectionCard>
              )}

              {issueAnalysis.recurringTitles.length > 0 && (
                <SectionCard icon={RefreshCw} title="תקלות חוזרות" subtitle="אותה כותרת נפתחה יותר מפעם אחת">
                  <div className="divide-y divide-[var(--border-light)]">
                    {issueAnalysis.recurringTitles.map((r) => (
                      <div key={r.title} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-[12px] font-bold num-tabular px-2 py-0.5 rounded-full bg-[var(--warning-light)] text-[var(--warning)] shrink-0">{r.count}x</span>
                        <span className="text-[13px] text-[var(--text-primary)] flex-1 min-w-0 truncate">{r.title}</span>
                        <Badge variant="warning">חוזרת</Badge>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              <SectionCard icon={CalendarClock} title="מגמה חודשית" subtitle="6 חודשים אחרונים">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        {issueAnalysis.months.map((m) => <th key={m.key} className="!text-center">{m.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {issueAnalysis.months.map((m) => (
                          <td key={m.key} className="!text-center">
                            <span className={cn(
                              'inline-flex w-8 h-8 rounded-full text-[12px] font-bold items-center justify-center num-tabular',
                              m.count > 0 ? 'bg-[var(--surface-container)] text-[var(--primary)]' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                            )}>
                              {m.count}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Tab: ניתוח ספקים                                               */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'vendors' && vendorIntel && (
            <>
              <SectionCard icon={Store} title="ספקים מובילים" subtitle="לפי דירוג">
                {vendorIntel.topVendors.length === 0 ? (
                  <EmptyState icon={Store} title="אין נתוני ספקים" />
                ) : (
                  <div className="divide-y divide-[var(--border-light)]">
                    {vendorIntel.topVendors.map((v, idx) => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-8 h-8 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[12px] font-bold shrink-0 num-tabular">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{v.name}</p>
                          {v.category && <p className="text-[11px] text-[var(--text-muted)]">{v.category}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StarRating value={v.rating} />
                          <span className="text-[11px] text-[var(--text-secondary)] num-tabular">{v.jobCount} עבודות</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {vendorIntel.matchedIssues.length > 0 && (
                <SectionCard icon={Wrench} title="התאמת תקלות לספקים" subtitle="תקלות פתוחות מול ספקים באותו תחום">
                  <div className="hidden md:block overflow-x-auto">
                    <table className="ds-table">
                      <thead><tr><th>תקלה</th><th>ספק מתאים</th><th>דירוג</th></tr></thead>
                      <tbody>
                        {vendorIntel.matchedIssues.map(({ issue, vendor }) => (
                          <tr key={issue.id}>
                            <td className="min-w-[180px] font-semibold">{issue.title}</td>
                            <td className="whitespace-nowrap">
                              {vendor
                                ? <span className="text-[13px] font-medium">{vendor.name}</span>
                                : <Badge variant="neutral">אין ספק מתאים</Badge>}
                            </td>
                            <td className="whitespace-nowrap">{vendor ? <StarRating value={vendor.rating} /> : <span className="text-[var(--text-muted)]">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden divide-y divide-[var(--border-light)]">
                    {vendorIntel.matchedIssues.map(({ issue, vendor }) => (
                      <div key={issue.id} className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{issue.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {vendor ? (
                            <>
                              <span className="text-[12px] text-[var(--text-secondary)]">{vendor.name}</span>
                              <StarRating value={vendor.rating} />
                            </>
                          ) : <Badge variant="neutral">אין ספק מתאים</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {vendorIntel.expiringInsurance.length > 0 && (
                <SectionCard icon={AlertTriangle} title="ביטוח ספקים שפג עד 60 יום">
                  <div className="divide-y divide-[var(--border-light)]">
                    {vendorIntel.expiringInsurance.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <IconTile icon={AlertTriangle} tone="warning" />
                        <span className="text-[13px] font-medium text-[var(--text-primary)] flex-1">{v.name}</span>
                        <Badge variant="warning" className="num-tabular">פג תוקף: {formatDate(v.insurance_expiry)}</Badge>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Tab: תחזית                                                     */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'forecast' && forecast && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard label="תחזית הוצאות חודש הבא" icon={Brain} color="blue" value={formatCurrency(forecast.avgExpenses)} sub="ממוצע 3 חודשים אחרונים" />
                <StatCard
                  label="קרן רזרבה מומלצת (10%)" icon={Wallet} color="amber"
                  value={forecast.reserveFund > 0 ? formatCurrency(forecast.reserveFund) : '—'}
                  sub={forecast.annualIncome > 0 ? `מתוך הכנסות השנה ${formatCurrency(forecast.annualIncome)}` : 'אין עדיין הכנסות השנה'}
                />
              </div>

              <SectionCard icon={TrendingUp} title="גבייה והוצאות" subtitle="6 חודשים אחרונים">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>חודש</th><th className="!text-center">שולמו</th><th className="!text-center">סה"כ</th><th className="!text-center">% גבייה</th><th className="!text-left">הוצאות</th></tr>
                    </thead>
                    <tbody>
                      {forecast.months.map((m) => {
                        const pct = m.total > 0 ? Math.round((m.paid / m.total) * 100) : null
                        return (
                          <tr key={m.key}>
                            <td className="font-semibold">{m.label}</td>
                            <td className="!text-center num-tabular">{m.paid}</td>
                            <td className="!text-center num-tabular">{m.total}</td>
                            <td className="!text-center">
                              {pct !== null ? (
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold num-tabular', TONE_CHIP[scoreTone(pct)])}>{pct}%</span>
                              ) : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="!text-left font-semibold num-tabular">{m.expenses > 0 ? formatCurrency(m.expenses) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>

        {/* AI assistant side panel (chat card) */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 min-w-0">
          <SectionCard
            icon={Sparkles}
            title="ניתוח AI — בריאות הבניין"
            subtitle={aiResultTimestamp && !aiLoading ? `עודכן: ${fmtStamp(aiResultTimestamp)}` : 'Claude AI • שמור ל-12 שעות'}
            tone="primary"
            bodyClassName="p-4 space-y-3 bg-[var(--bg)]"
          >
            {!aiLoading && !aiResult && !aiError && (
              <div className="flex flex-col items-center text-center py-6">
                <span className="p-2.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] mb-2">
                  <Bot className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <p className="text-[13px] text-[var(--text-secondary)] max-w-[260px] mb-3">
                  בקשו מ-Claude לנתח את ציוני הבריאות ולהציע עדיפויות לטיפול.
                </p>
                <Button size="sm" onClick={runAiHealthAnalysis} disabled={!healthScore}>
                  <Sparkles className="h-3.5 w-3.5" />
                  ניתוח AI
                </Button>
              </div>
            )}

            {(aiLoading || aiResult || aiError) && (
              <>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-[var(--radius-lg)] rounded-tr-sm bg-[var(--primary)] text-white px-3.5 py-2 text-[13px] shadow-[var(--shadow)]">
                    נתח את בריאות הבניין {selectedBuilding.name}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0">
                    <Bot className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="flex-1 min-w-0 rounded-[var(--radius-lg)] rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow)] space-y-4">
                    {aiLoading && (
                      <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                        <RefreshCw className="h-4 w-4 animate-spin text-[var(--primary)]" />
                        Claude מנתח את הבניין...
                      </div>
                    )}
                    {aiError && (
                      <p className="text-[13px] px-3 py-2 rounded-[var(--radius)] bg-[var(--danger-light)] text-[var(--danger)]">שגיאה: {aiError}</p>
                    )}
                    {aiResult && (
                      <>
                        {aiResult.summary && (
                          <p className="text-[13px] text-[var(--text-primary)] leading-relaxed border-r-[3px] border-[var(--primary)] pr-3">
                            {aiResult.summary}
                          </p>
                        )}

                        {aiResult.top_priorities?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">עדיפויות לטיפול מיידי</h4>
                            <div className="space-y-2">
                              {aiResult.top_priorities.map((p, i) => (
                                <div key={i} className="flex items-start gap-2 p-2.5 rounded-[var(--radius)] border border-[var(--border-light)] bg-[var(--surface-secondary)]">
                                  <Badge variant={p.urgency === 'high' ? 'danger' : p.urgency === 'medium' ? 'warning' : 'default'}>
                                    {p.urgency === 'high' ? 'דחוף' : p.urgency === 'medium' ? 'בינוני' : 'נמוך'}
                                  </Badge>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{p.title}</p>
                                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{p.action}</p>
                                    {p.impact && <p className="text-[12px] text-[var(--primary)] mt-0.5">השפעה: {p.impact}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {aiResult.quick_wins?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">ניצחונות מהירים השבוע</h4>
                            <ul className="space-y-1.5">
                              {aiResult.quick_wins.map((w, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)]">
                                  <CheckCircle className="h-4 w-4 text-[var(--success)] shrink-0 mt-0.5" />
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiResult.risk_forecast && (
                          <div className="rounded-[var(--radius)] bg-[var(--warning-light)] border border-[var(--warning)]/20 p-3">
                            <p className="text-[11px] font-semibold text-[var(--warning)] mb-1 flex items-center gap-1"><Zap className="h-3.5 w-3.5" />תחזית סיכונים 30 יום</p>
                            <p className="text-[13px] text-[var(--text-primary)]">{aiResult.risk_forecast}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
