import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { HDate } from '@hebcal/core'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import {
  CreditCard,
  AlertTriangle,
  Wrench,
  Wallet,
  ArrowLeft,
  Zap,
  Info,
  AlertCircle,
  Calendar,
} from 'lucide-react'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function Dashboard() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allUnits } = useCollection('units')
  const { data: allPayments } = useCollection('payments')
  const { data: allIssues } = useCollection('issues')
  const { data: allExpenses } = useCollection('expenses')
  const { data: allAlerts } = useCollection('agentAlerts')

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = HEBREW_MONTHS[now.getMonth()]

  const { units, payments, issues, expenses, agentAlerts } = useMemo(() => {
    const units = (selectedBuilding
      ? allUnits.filter((u) => u.buildingId === selectedBuilding.id)
      : allUnits
    ).sort(sortByUnitNumber)
    const unitIds = new Set(units.map((u) => u.id))

    const payments = selectedBuilding
      ? allPayments.filter((p) => p.buildingId === selectedBuilding.id || unitIds.has(p.unitId))
      : allPayments
    const issues = selectedBuilding
      ? allIssues.filter((i) => i.buildingId === selectedBuilding.id)
      : allIssues
    const expenses = selectedBuilding
      ? allExpenses.filter((e) => e.buildingId === selectedBuilding.id)
      : allExpenses

    const agentAlerts = selectedBuilding
      ? allAlerts.filter((a) => a.building_id === selectedBuilding.id && !a.is_dismissed)
      : allAlerts.filter((a) => !a.is_dismissed)

    return { units, payments, issues, expenses, agentAlerts }
  }, [selectedBuilding, allUnits, allPayments, allIssues, allExpenses, allAlerts])

  // KPI calculations
  const monthPayments = payments.filter((p) => p.month === currentMonth)
  const paidPayments = monthPayments.filter((p) => p.status === 'paid')
  const collected = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  // Expected = sum of each unit's calculated fee (respects tiers)
  const expected = units.reduce((sum, u) => sum + calcUnitFee(u, selectedBuilding), 0)
    || monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0) || 1
  const collectionPct = expected > 0 ? Math.round((collected / expected) * 100) : 0

  const debtors = monthPayments.filter((p) => p.status !== 'paid')
  const debtorUnits = debtors.map((p) => {
    const unit = units.find((u) => u.id === p.unitId)
    return { ...p, unit }
  })

  const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'in_progress')
  const urgentIssues = openIssues.filter((i) => i.priority === 'high' || i.priority === 'urgent')

  const monthExpenses = expenses.filter((e) => {
    if (!e.date) return false
    return e.date.startsWith(currentMonth)
  })
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const balance = selectedBuilding?.balance ?? 0

  const pctVariant = collectionPct >= 80 ? 'success' : collectionPct >= 50 ? 'warning' : 'danger'
  const pctColor =
    collectionPct >= 80
      ? 'var(--success, #16a34a)'
      : collectionPct >= 50
        ? 'var(--warning, #d97706)'
        : 'var(--danger, #dc2626)'

  const statusLabel = (status) => {
    switch (status) {
      case 'pending': return 'ממתין'
      case 'overdue': return 'באיחור'
      case 'paid': return 'שולם'
      default: return status
    }
  }

  const statusVariant = (status) => {
    switch (status) {
      case 'pending': return 'warning'
      case 'overdue': return 'danger'
      case 'paid': return 'success'
      default: return 'default'
    }
  }

  const priorityLabel = (p) => {
    switch (p) {
      case 'high': return 'גבוהה'
      case 'urgent': return 'דחוף'
      case 'medium': return 'בינונית'
      case 'low': return 'נמוכה'
      default: return p
    }
  }

  const priorityVariant = (p) => {
    switch (p) {
      case 'high':
      case 'urgent': return 'danger'
      case 'medium': return 'warning'
      default: return 'default'
    }
  }

  const issueStatusLabel = (s) => {
    switch (s) {
      case 'open': return 'פתוח'
      case 'in_progress': return 'בטיפול'
      case 'closed': return 'סגור'
      default: return s
    }
  }

  const issueStatusVariant = (s) => {
    switch (s) {
      case 'open': return 'danger'
      case 'in_progress': return 'warning'
      case 'closed': return 'success'
      default: return 'default'
    }
  }

  // Hebrew date
  const [hebrewDate, setHebrewDate] = useState('')
  useEffect(() => {
    try {
      const hd = new HDate()
      setHebrewDate(hd.render('he'))
    } catch (e) {
      console.warn('Hebrew date error:', e)
    }
    // Update at midnight
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
    const timer = setTimeout(() => {
      try { setHebrewDate(new HDate().render('he')) } catch {}
    }, msUntilMidnight)
    return () => clearTimeout(timer)
  }, [])

  const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const dayOfWeek = WEEKDAYS_HE[now.getDay()]
  const gregDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          דשבורד {selectedBuilding ? `- ${selectedBuilding.name}` : ''}
        </h1>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2">
          <Calendar className="h-4 w-4 text-[var(--primary)]" />
          <span>יום {dayOfWeek}</span>
          <span className="text-[var(--text-muted)]">|</span>
          <span>{gregDate}</span>
          {hebrewDate && (
            <>
              <span className="text-[var(--text-muted)]">|</span>
              <span className="font-medium text-[var(--text-primary)]">{hebrewDate}</span>
            </>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Monthly Collection */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                <CreditCard className="h-4 w-4" />
                גבייה חודשית
              </div>
              <Badge variant={pctVariant}>{collectionPct}%</Badge>
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {formatCurrency(collected)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              מתוך {formatCurrency(expected)}
            </div>
          </CardContent>
        </Card>

        {/* Debtors */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2">
              <AlertTriangle className="h-4 w-4" />
              חייבים החודש
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {debtors.length}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              דירות שטרם שילמו
            </div>
          </CardContent>
        </Card>

        {/* Open Issues */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2">
              <Wrench className="h-4 w-4" />
              תקלות פתוחות
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {openIssues.length}
            </div>
            {urgentIssues.length > 0 && (
              <div className="text-xs text-[var(--danger)] mt-1">
                {urgentIssues.length} דחופות
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Expenses */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2">
              <Wallet className="h-4 w-4" />
              הוצאות החודש
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {formatCurrency(totalExpenses)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              יתרה: {formatCurrency(balance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Side-by-side lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Debtors List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>חייבים החודש</CardTitle>
              <Link
                to="/payments"
                className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                לכל הגבייה
                <ArrowLeft className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {debtorUnits.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                כל הדירות שילמו החודש
              </p>
            ) : (
              <div className="space-y-3">
                {debtorUnits.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
                  >
                    <div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        דירה {d.unit?.number || '?'}
                      </span>
                      {d.unit?.ownerName && (
                        <span className="text-xs text-[var(--text-secondary)] mr-2">
                          {d.unit.ownerName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {formatCurrency(d.amount)}
                      </span>
                      <Badge variant={statusVariant(d.status)}>
                        {statusLabel(d.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Issues List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>תקלות פתוחות</CardTitle>
              <Link
                to="/issues"
                className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                לכל התקלות
                <ArrowLeft className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {openIssues.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                אין תקלות פתוחות
              </p>
            ) : (
              <div className="space-y-3">
                {openIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
                  >
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {issue.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={priorityVariant(issue.priority)}>
                        {priorityLabel(issue.priority)}
                      </Badge>
                      <Badge variant={issueStatusVariant(issue.status)}>
                        {issueStatusLabel(issue.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collection Progress */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              התקדמות גבייה - {monthLabel}
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{collectionPct}%</span>
          </div>
          <Progress value={collectionPct} color={pctColor} />
          <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
            <span>נגבה: {formatCurrency(collected)}</span>
            <span>צפוי: {formatCurrency(expected)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Agent Alerts */}
      {agentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[var(--primary)]" />
                התראות סוכנים חכמים
              </CardTitle>
              <Link
                to="/smart-agents"
                className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                לכל הסוכנים
                <ArrowLeft className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agentAlerts.filter(a => !a.is_read).slice(0, 5).map((alert) => {
                const sevIcon = alert.severity === 'high'
                  ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  : alert.severity === 'medium'
                  ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  : <Info className="h-4 w-4 text-blue-500 shrink-0" />
                const sevBg = alert.severity === 'high' ? 'bg-red-50 border-red-200'
                  : alert.severity === 'medium' ? 'bg-amber-50 border-amber-200'
                  : 'bg-blue-50 border-blue-200'
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${sevBg}`}
                  >
                    {sevIcon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{alert.title}</p>
                      {alert.description && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{alert.description}</p>
                      )}
                      {alert.recommendation && (
                        <p className="text-xs text-[var(--primary)] mt-1">💡 {alert.recommendation}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 mt-0.5">
                      {alert.agent_type === 'expense_analysis' ? 'הוצאות'
                        : alert.agent_type === 'collection' ? 'גבייה'
                        : alert.agent_type === 'budget' ? 'תקציב'
                        : alert.agent_type}
                    </span>
                  </div>
                )
              })}
              {agentAlerts.filter(a => !a.is_read).length > 5 && (
                <p className="text-xs text-center text-[var(--text-muted)]">
                  +{agentAlerts.filter(a => !a.is_read).length - 5} התראות נוספות
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Dashboard
