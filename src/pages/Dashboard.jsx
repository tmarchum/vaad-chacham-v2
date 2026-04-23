import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { HDate } from '@hebcal/core'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  ClipboardList,
  Megaphone,
  BarChart2,
  ChevronLeft,
  Building2,
} from 'lucide-react'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/* ── Circular progress ring ─────────────────────────────────────────── */
function CircleProgress({ value, size = 56, strokeWidth = 5, color = '#3b82f6' }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={strokeWidth}
        className="text-slate-100" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-700 ease-out" />
    </svg>
  )
}

function Dashboard() {
  const { selectedBuilding } = useBuildingContext()
  const { profile } = useAuth()
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
  const paidPayments = monthPayments.filter((p) => p.status === 'paid' || p.status === 'partial')
  const collected = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
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

  const monthExpenses = expenses.filter((e) => e.date?.startsWith(currentMonth))
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const balance = selectedBuilding?.balance ?? 0

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
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
    const timer = setTimeout(() => {
      try { setHebrewDate(new HDate().render('he')) } catch {}
    }, msUntilMidnight)
    return () => clearTimeout(timer)
  }, [])

  const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const dayOfWeek = WEEKDAYS_HE[now.getDay()]
  const gregDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
  const hour = now.getHours()
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב'
  const firstName = profile?.first_name || ''

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ═══════════════════════════════════════════════════════════════
          ── Welcome banner ──
          ═══════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-blue-600 via-blue-700 to-indigo-800 p-6 lg:p-8 text-white shadow-xl shadow-blue-600/10 animate-fade-in-up">
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/5 rounded-full translate-x-1/4 translate-y-1/4" />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold mb-1">
              {greeting}{firstName ? `, ${firstName}` : ''} 👋
            </h1>
            <p className="text-blue-100 text-sm lg:text-base">
              {selectedBuilding ? (
                <>
                  <Building2 className="inline h-4 w-4 ml-1 -mt-0.5" />
                  {selectedBuilding.name}
                  <span className="mx-2 opacity-40">|</span>
                </>
              ) : null}
              יום {dayOfWeek}, {gregDate}
              {hebrewDate && (
                <>
                  <span className="mx-2 opacity-40">|</span>
                  <span className="font-medium">{hebrewDate}</span>
                </>
              )}
            </p>
          </div>

          {/* Quick stats in banner */}
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-2xl font-black">{units.length}</div>
              <div className="text-[11px] text-blue-200">דירות</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <div className="text-2xl font-black">{collectionPct}%</div>
              <div className="text-[11px] text-blue-200">גבייה</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <div className="text-2xl font-black">{openIssues.length}</div>
              <div className="text-[11px] text-blue-200">תקלות</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ── KPI cards ──
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Collection KPI */}
        <div className="kpi-card kpi-blue rounded-xl border border-[var(--border)] bg-white p-5 animate-fade-in-up animate-fade-in-up-delay-1">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1">גבייה חודשית</p>
              <p className="text-[28px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
                {formatCurrency(collected)}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                מתוך {formatCurrency(expected)}
              </p>
            </div>
            <CircleProgress value={collectionPct} color="#3b82f6" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${Math.min(collectionPct, 100)}%` }} />
            </div>
            <span className="text-xs font-bold text-blue-600 min-w-[36px] text-left">{collectionPct}%</span>
          </div>
        </div>

        {/* Debtors KPI */}
        <div className="kpi-card kpi-amber rounded-xl border border-[var(--border)] bg-white p-5 animate-fade-in-up animate-fade-in-up-delay-2">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1">חייבים</p>
              <p className="text-[28px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
                {debtors.length}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">דירות שטרם שילמו</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
          </div>
          {debtors.length > 0 ? (
            <div className="flex items-center gap-1.5 mt-3">
              <div className="status-dot warning" />
              <span className="text-xs text-amber-600 font-medium">נדרש מעקב</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-3">
              <div className="status-dot success" />
              <span className="text-xs text-green-600 font-medium">הכל שולם</span>
            </div>
          )}
        </div>

        {/* Issues KPI */}
        <div className="kpi-card kpi-purple rounded-xl border border-[var(--border)] bg-white p-5 animate-fade-in-up animate-fade-in-up-delay-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1">תקלות פתוחות</p>
              <p className="text-[28px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
                {openIssues.length}
              </p>
              {urgentIssues.length > 0 ? (
                <p className="text-xs text-red-500 font-semibold mt-1.5">{urgentIssues.length} דחופות</p>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mt-1.5">הכל תקין</p>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 flex items-center justify-center shrink-0">
              <Wrench className="h-6 w-6 text-purple-500" />
            </div>
          </div>
          {urgentIssues.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <div className="status-dot danger" />
              <span className="text-xs text-red-600 font-medium">דורש טיפול מיידי</span>
            </div>
          )}
        </div>

        {/* Expenses + Balance KPI */}
        <div className="kpi-card kpi-emerald rounded-xl border border-[var(--border)] bg-white p-5 animate-fade-in-up animate-fade-in-up-delay-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1">הוצאות {monthLabel}</p>
              <p className="text-[28px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
                {formatCurrency(totalExpenses)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center shrink-0">
              <Wallet className="h-6 w-6 text-emerald-500" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-[var(--text-muted)]">יתרה</span>
            <span className={`text-sm font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {balance >= 0 ? (
                <TrendingUp className="inline h-3.5 w-3.5 ml-1 -mt-0.5" />
              ) : (
                <TrendingDown className="inline h-3.5 w-3.5 ml-1 -mt-0.5" />
              )}
              {formatCurrency(Math.abs(balance))}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ── Quick actions ──
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up">
        {[
          { to: '/payments',     icon: CreditCard,  label: 'גבייה',        color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
          { to: '/issues',       icon: Wrench,      label: 'תקלה חדשה',    color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
          { to: '/expenses',     icon: Wallet,      label: 'הוצאות',       color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
          { to: '/announcements', icon: Megaphone,  label: 'הודעות',       color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
        ].map(({ to, icon: Icon, label, color }) => (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-semibold transition-all border border-transparent hover:border-[var(--border)] hover:shadow-sm ${color}`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ── Main content grid ──
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── Debtors list (3 cols) ── */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-amber-400" />
                חייבים החודש — {monthLabel}
              </CardTitle>
              <Link
                to="/payments"
                className="text-xs text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium flex items-center gap-1 transition-colors"
              >
                לכל הגבייה
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {debtorUnits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-3">
                  <CreditCard className="h-7 w-7 text-green-400" />
                </div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">כל הדירות שילמו החודש</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">מצוין!</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {debtorUnits.slice(0, 8).map((d, i) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                        {d.unit?.number || '?'}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-[var(--text-primary)] block">
                          דירה {d.unit?.number || '?'}
                        </span>
                        {d.unit?.ownerName && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {d.unit.ownerName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatCurrency(d.amount)}
                      </span>
                      <Badge variant={statusVariant(d.status)}>
                        {statusLabel(d.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
                {debtorUnits.length > 8 && (
                  <div className="pt-3 text-center">
                    <Link to="/payments" className="text-xs text-[var(--primary)] font-medium hover:underline">
                      +{debtorUnits.length - 8} נוספים
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Issues list (2 cols) ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-purple-400" />
                תקלות פתוחות
              </CardTitle>
              <Link
                to="/issues"
                className="text-xs text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium flex items-center gap-1 transition-colors"
              >
                הכל
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {openIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-3">
                  <Wrench className="h-7 w-7 text-green-400" />
                </div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">אין תקלות פתוחות</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">הכל תקין</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openIssues.slice(0, 6).map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--surface-hover)] transition-colors group"
                  >
                    <div className={`status-dot mt-1.5 ${
                      issue.priority === 'high' || issue.priority === 'urgent' ? 'danger' :
                      issue.priority === 'medium' ? 'warning' : 'success'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {issue.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={priorityVariant(issue.priority)} className="text-[10px] px-1.5 py-0">
                          {priorityLabel(issue.priority)}
                        </Badge>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {issueStatusLabel(issue.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {openIssues.length > 6 && (
                  <Link to="/issues" className="block text-center text-xs text-[var(--primary)] font-medium py-2 hover:underline">
                    +{openIssues.length - 6} תקלות נוספות
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ── Collection progress bar ──
          ═══════════════════════════════════════════════════════════ */}
      <Card className="animate-fade-in-up">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[var(--primary)]" />
              התקדמות גבייה — {monthLabel}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--text-muted)]">
                נגבה: <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(collected)}</span>
              </span>
              <span className="text-[var(--text-muted)]">
                צפוי: <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(expected)}</span>
              </span>
            </div>
          </div>
          <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-blue-500 to-blue-600 transition-all duration-700 ease-out"
              style={{ width: `${Math.min(collectionPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs font-bold text-blue-600">{collectionPct}%</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {paidPayments.length} מתוך {monthPayments.length || units.length} דירות
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════
          ── Agent alerts ──
          ═══════════════════════════════════════════════════════════ */}
      {agentAlerts.length > 0 && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                התראות סוכנים חכמים
                {agentAlerts.filter(a => !a.is_read).length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1.5">
                    {agentAlerts.filter(a => !a.is_read).length}
                  </span>
                )}
              </CardTitle>
              <Link
                to="/smart-agents"
                className="text-xs text-[var(--primary)] hover:text-[var(--primary-dark)] font-medium flex items-center gap-1 transition-colors"
              >
                לכל הסוכנים
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {agentAlerts.filter(a => !a.is_read).slice(0, 5).map((alert) => {
                const sevIcon = alert.severity === 'high'
                  ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  : alert.severity === 'medium'
                  ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  : <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                const sevClass = alert.severity === 'high' ? 'severity-high'
                  : alert.severity === 'medium' ? 'severity-medium' : 'severity-low'
                return (
                  <div
                    key={alert.id}
                    className={`alert-item ${sevClass} flex items-start gap-3 p-3.5 rounded-xl bg-[var(--surface-secondary)]`}
                  >
                    {sevIcon}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{alert.title}</p>
                      {alert.description && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{alert.description}</p>
                      )}
                      {alert.recommendation && (
                        <p className="text-xs text-blue-600 mt-1.5 font-medium">💡 {alert.recommendation}</p>
                      )}
                    </div>
                    <Badge variant="default" className="shrink-0 text-[10px]">
                      {alert.agent_type === 'expense_analysis' ? 'הוצאות'
                        : alert.agent_type === 'collection' ? 'גבייה'
                        : alert.agent_type === 'budget' ? 'תקציב'
                        : alert.agent_type}
                    </Badge>
                  </div>
                )
              })}
              {agentAlerts.filter(a => !a.is_read).length > 5 && (
                <Link
                  to="/smart-agents"
                  className="block text-center text-xs text-[var(--primary)] font-medium py-2 hover:underline"
                >
                  +{agentAlerts.filter(a => !a.is_read).length - 5} התראות נוספות
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Dashboard
