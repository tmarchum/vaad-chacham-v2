import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { upcomingMaintenance } from '@/lib/maintenance'
import { SectionCard } from '@/components/common/SectionCard'
import { StatCard } from '@/components/common/StatCard'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { formatCurrency, calcUnitFee } from '@/lib/utils'
import { isOpenIssueStatus, issueStatusLabel } from '@/lib/issueStatus'
import { HealthCard } from '@/components/common/HealthCard'
import { canSee, committeeHandlesIssues, PLAN_LABELS } from '@/lib/access'
import { waLink, telHref } from '@/lib/phone'
import { HEBREW_MONTHS } from '@/lib/constants'
import {
  Wallet, AlertTriangle, Wrench, ReceiptText, Receipt, HardHat, Megaphone,
  CalendarDays, MessageCircle, Phone, Download, Clock, ArrowLeft,
  Building2, CalendarClock, ShieldAlert, Zap, DoorOpen, Plus, CreditCard,
} from 'lucide-react'

const PAY_STATUS = {
  paid:    { label: 'שולם',     variant: 'success' },
  partial: { label: 'שולם חלקית', variant: 'warning' },
  pending: { label: 'ממתין',     variant: 'neutral' },
  overdue: { label: 'באיחור',    variant: 'danger' },
  unpaid:  { label: 'לא שולם',   variant: 'danger' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000)
  if (days <= 0) return `היום, ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'אתמול'
  if (days < 30) return `לפני ${days} ימים`
  return d.toLocaleDateString('he-IL')
}

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '')

function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function Dashboard() {
  const { selectedBuilding, buildings, isLoading: buildingsLoading } = useBuildingContext()
  const { profile, isAdmin } = useAuth()
  const bid = selectedBuilding?.id

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = HEBREW_MONTHS[now.getMonth()]

  // Only what the dashboard shows: this month's payments, this building's
  // residents, vendors whose insurance is about to lapse. (It used to pull
  // every resident and every vendor in the system.)
  const scope = { building_id: bid }
  const { data: units, isLoading } = useCollection('units', scope)
  const { data: monthPayments } = useCollection('payments', { ...scope, month: currentMonth })
  const { data: issues } = useCollection('issues', scope)
  const { data: expenses } = useCollection('expenses', scope)
  const { data: agentAlertsRaw } = useCollection('agentAlerts', scope)
  const { data: compliance } = useCollection('compliance', scope)
  const { data: documents } = useCollection('documents', scope)
  const { data: recurringTasks } = useCollection('recurringTasks', scope)
  const { data: buildingAssets } = useCollection('buildingAssets', scope)
  const { data: pendingBookings } = useCollection('bookings', { ...scope, status: 'pending' })
  const { data: latestAnnouncements } = useCollection('announcements', { ...scope, _limit: 1 })
  const dir = useUnitDirectory(bid)

  const [expiringVendors, setExpiringVendors] = useState([])
  useEffect(() => {
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    supabase.from('vendors').select('id, name, insurance_expiry')
      .not('insurance_expiry', 'is', null).lte('insurance_expiry', in30)
      .then(({ data }) => setExpiringVendors(data || []))
  }, [])

  // Health inputs that the collections above do not carry.
  const [lastBankDate, setLastBankDate] = useState(undefined)
  const [openPolls, setOpenPolls] = useState(0)
  useEffect(() => {
    if (!bid) return
    supabase.from('bank_transactions').select('date').eq('building_id', bid)
      .order('date', { ascending: false }).limit(1)
      .then(({ data, error }) => setLastBankDate(error ? undefined : (data?.[0]?.date || null)))
    supabase.from('polls').select('id', { count: 'exact', head: true }).eq('building_id', bid).eq('status', 'open')
      .then(({ count, error }) => setOpenPolls(error ? 0 : count || 0))
  }, [bid])

  const [tableTab, setTableTab] = useState('debtors')

  // ── Collection ──
  const expected = units.reduce((s, u) => s + calcUnitFee(u, selectedBuilding), 0)
  const paidRows = monthPayments.filter((p) => p.status === 'paid' || p.status === 'partial')
  const collected = paidRows.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const collectionPct = expected > 0 ? Math.round((collected / expected) * 100) : 0
  const noChargesYet = monthPayments.length === 0 && units.length > 0
  const debtorRows = monthPayments.filter((p) => p.status !== 'paid')
  const debtTotal = debtorRows.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const daysIntoMonth = now.getDate() - 1

  const tableRows = useMemo(() => {
    const src = tableTab === 'debtors' ? debtorRows : monthPayments.filter((p) => p.status === 'paid')
    return src
      .map((p) => ({ ...p, u: dir.byId[p.unitId] }))
      .sort((a, b) => (parseInt(a.u?.number) || 0) - (parseInt(b.u?.number) || 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableTab, monthPayments, dir.byId])

  // ── Issues ──
  const openIssues = issues.filter((i) => isOpenIssueStatus(i.status))
  const urgentIssues = openIssues.filter((i) => i.priority === 'high' || i.priority === 'urgent')
  const withVendor = openIssues.filter((i) => i.vendor_name).length
  const todayStr = now.toISOString().slice(0, 10)
  const nextVisit = openIssues
    .filter((i) => i.scheduledDate && i.scheduledDate.slice(0, 10) >= todayStr)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
  const issueStack = [...openIssues]
    .sort((a, b) => {
      const ua = a.priority === 'urgent' || a.priority === 'high' ? 0 : 1
      const ub = b.priority === 'urgent' || b.priority === 'high' ? 0 : 1
      return ua - ub || new Date(b.reportedAt || b.created_at || 0) - new Date(a.reportedAt || a.created_at || 0)
    })
    .slice(0, 4)

  // ── Expenses ──
  const monthExpenses = expenses.filter((e) => e.date?.startsWith(currentMonth))
  const totalExpenses = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const topCategories = Object.entries(
    monthExpenses.reduce((m, e) => { const k = e.category || 'אחר'; m[k] = (m[k] || 0) + (Number(e.amount) || 0); return m }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  const balance = selectedBuilding?.balance ?? null

  // ── Attention lists ──
  const maintenanceDue = useMemo(
    () => upcomingMaintenance({ assets: buildingAssets, compliance, recurringTasks }, 45).slice(0, 6),
    [buildingAssets, compliance, recurringTasks]
  )
  const expiryAlerts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = (d) => Math.ceil((new Date(d) - today) / 86400000)
    const out = []
    compliance.forEach((c) => {
      if (c.expiry_date && days(c.expiry_date) <= 60) out.push({ id: `c${c.id}`, label: c.type || 'רגולציה', detail: c.document_number || '', daysLeft: days(c.expiry_date), link: '/compliance' })
    })
    documents.forEach((d) => {
      const exp = d.expiresAt || d.expires_at
      if (exp && days(exp) <= 30) out.push({ id: `d${d.id}`, label: d.name || 'מסמך', detail: d.category || '', daysLeft: days(exp), link: '/documents' })
    })
    expiringVendors.forEach((v) => {
      out.push({ id: `v${v.id}`, label: v.name || 'ספק', detail: 'ביטוח ספק', daysLeft: days(v.insurance_expiry), link: '/vendors' })
    })
    recurringTasks.forEach((t) => {
      if (t.next_due_date && t.status !== 'completed' && days(t.next_due_date) < 0) {
        out.push({ id: `t${t.id}`, label: t.title || 'משימה', detail: 'משימה תקופתית', daysLeft: days(t.next_due_date), link: '/recurring-tasks' })
      }
    })
    return out.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6)
  }, [compliance, documents, expiringVendors, recurringTasks])
  const agentAlerts = agentAlertsRaw.filter((a) => !a.is_dismissed && !a.is_read).slice(0, 4)
  const announcement = latestAnnouncements[0]

  // ── Health: what needs attention, phrased for the person looking ──
  // The committee on the managed plan does not dispatch faults, so a fault
  // waiting on the management side is not "theirs" to act on; it shows only
  // when it has waited long enough to be worth a word.
  const ctx = { isAdmin, building: selectedBuilding }
  const ownsFaults = isAdmin || committeeHandlesIssues(selectedBuilding)
  const waitingDecision = openIssues.filter((i) => !i.handler && ['reported', 'pending_committee', 'acknowledged'].includes(i.status))
  const staleIssues = openIssues.filter((i) => {
    const t = new Date(i.reportedAt || i.created_at || 0).getTime()
    return t && Date.now() - t > 7 * 864e5
  })
  // Counted from the full list, not the six the panel below shows.
  const overdueTasks = useMemo(
    () => upcomingMaintenance({ assets: buildingAssets, compliance, recurringTasks }, 0).filter((m) => m.overdue),
    [buildingAssets, compliance, recurringTasks]
  )
  const expiredDocs = expiryAlerts.filter((a) => a.daysLeft < 0)
  const bankStaleDays = lastBankDate ? Math.floor((Date.now() - new Date(lastBankDate)) / 864e5) : null
  const healthChecks = [
    urgentIssues.length > 0 && { key: 'urgent', severity: 'danger', to: '/issues', text: `${urgentIssues.length} תקלות דחופות פתוחות` },
    ownsFaults && waitingDecision.length > 0 && { key: 'decide', severity: 'warning', to: '/issues', text: `${waitingDecision.length} תקלות ממתינות להחלטה על טיפול` },
    staleIssues.length > 0 && { key: 'stale', severity: 'warning', to: '/issues', text: `${staleIssues.length} תקלות פתוחות יותר משבוע` },
    !noChargesYet && daysIntoMonth >= 10 && collectionPct < 80 && { key: 'collection', severity: 'warning', to: '/payments', text: `גבייה ${collectionPct}% לחודש ${monthName}, חסרים ${formatCurrency(debtTotal)}` },
    noChargesYet && daysIntoMonth >= 5 && { key: 'charges', severity: 'warning', to: '/payments', text: `לא הופקו חיובים לחודש ${monthName}` },
    canSee('bank_settings', ctx) && bankStaleDays != null && bankStaleDays > 45 && { key: 'bank', severity: 'warning', to: '/bank-transactions', text: `דף הבנק לא עודכן ${bankStaleDays} ימים` },
    canSee('compliance', ctx) && overdueTasks.length > 0 && { key: 'tasks', severity: 'danger', to: '/compliance', text: `${overdueTasks.length} בדיקות ותחזוקות שעבר מועדן` },
    expiredDocs.length > 0 && { key: 'docs', severity: 'danger', to: expiredDocs[0].link, text: `${expiredDocs.length} אישורים או מסמכים שפג תוקפם` },
    pendingBookings.length > 0 && { key: 'bookings', severity: 'warning', to: '/room-booking', text: `${pendingBookings.length} בקשות שריון ממתינות לאישור` },
    openPolls > 0 && { key: 'polls', severity: 'warning', to: '/polls', text: `${openPolls} הצבעות פתוחות לדיירים` },
  ]

  // ── Greeting ──
  const [hebrewDate, setHebrewDate] = useState('')
  useEffect(() => {
    import('@hebcal/core').then(({ HDate }) => {
      try { setHebrewDate(new HDate().render('he')) } catch { /* optional */ }
    })
  }, [])
  const hour = now.getHours()
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב'
  const firstName = profile?.first_name || ''

  if (!buildingsLoading && buildings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--surface-container)] text-[var(--primary)] flex items-center justify-center mb-5">
          <Building2 className="h-8 w-8" strokeWidth={1.5} />
        </div>
        <h1 className="text-[24px] font-semibold text-[var(--text-primary)] mb-2">ברוכים הבאים ל־ועד1</h1>
        <p className="text-[14px] text-[var(--text-secondary)] mb-6 max-w-sm">טרם הוגדר בניין במערכת. הוסיפו את הבניין הראשון כדי להתחיל לנהל גבייה, תקלות ודיירים.</p>
        <Link to="/buildings" className="h-[38px] px-4 rounded-[var(--radius)] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-[13px] font-semibold inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />הוספת בניין ראשון
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent" />
      </div>
    )
  }

  const debtorCount = debtorRows.length
  const debtorPct = units.length ? Math.round((debtorCount / units.length) * 1000) / 10 : 0

  return (
    <div className="space-y-6">
      {/* 1 ── Welcome banner */}
      <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] sm:text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">
              {greeting}{firstName ? `, ${firstName}` : ''}! 👋
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--surface-container)] text-[var(--primary)] text-[11px] font-semibold">
              {monthName} {now.getFullYear()}
            </span>
            {hebrewDate && <span className="text-[11px] text-[var(--text-muted)]">{hebrewDate}</span>}
            {selectedBuilding?.service_plan && (
              <span className="px-2.5 py-0.5 rounded-full border border-[var(--outline-variant)] text-[var(--text-secondary)] text-[11px] font-semibold">
                מסלול {PLAN_LABELS[selectedBuilding.service_plan]}
              </span>
            )}
          </div>
          <p className="text-[14px] leading-5 text-[var(--text-secondary)]">
            {noChargesYet
              ? <>טרם הופקו חיובים לחודש {monthName}. </>
              : <>מצב הגבייה לחודש {monthName} עומד על <strong className="text-[var(--success)] font-semibold num-tabular">{collectionPct}%</strong>. </>}
            {openIssues.length === 0
              ? 'אין תקלות פתוחות בבניין.'
              : <><strong className="text-[var(--text-primary)] num-tabular">{openIssues.length}</strong> תקלות פתוחות{urgentIssues.length > 0 && <> (<strong className="text-[var(--danger)] num-tabular">{urgentIssues.length}</strong> דחופות)</>}.</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link to="/announcements" className="h-9 px-3.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-container)] text-[var(--success)] border border-[var(--success)]/25 text-[12px] font-semibold flex items-center gap-2 transition-colors">
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
            הודעה לדיירים
          </Link>
          <Link to="/room-booking" className="relative h-9 px-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--bg)] text-[var(--text-secondary)] text-[12px] font-medium flex items-center gap-1.5 transition-colors">
            <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
            שריון חדרים
            {pendingBookings.length > 0 && (
              <span className="px-1.5 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold num-tabular">{pendingBookings.length}</span>
            )}
          </Link>
        </div>
      </div>

      {/* 1b ── Health: what needs attention right now */}
      <HealthCard checks={healthChecks} />

      {/* 2 ── KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="גבייה חודשית שוטפת"
          icon={Wallet}
          color="blue"
          value={formatCurrency(collected)}
          sub={noChargesYet ? 'טרם הופקו חיובים' : `מתוך יעד ${formatCurrency(expected)} (${collectionPct}%)`}
          progress={collectionPct}
        />
        <StatCard
          label="חייבים בתשלום"
          icon={AlertTriangle}
          color={debtorCount > 0 ? 'red' : 'emerald'}
          value={noChargesYet ? '—' : `${debtorCount} דירות`}
          note={!noChargesYet && debtorCount > 0 ? `(${debtorPct}% מהבניין)` : null}
          sub={noChargesYet ? 'אין חיובים לחודש זה' : debtorCount > 0 ? <>סך חוב: <strong className="text-[var(--text-primary)]">{formatCurrency(debtTotal)}</strong></> : 'כל הדירות שילמו 🎉'}
          footer={
            <div className="flex items-center justify-between">
              <Link to="/payments" className="text-[var(--primary)] hover:underline font-semibold flex items-center gap-1">
                {debtorCount > 0 ? 'לטיפול בחייבים' : 'לכל הגבייה'}
                <ArrowLeft className="h-3 w-3" />
              </Link>
              <span className={`h-2 w-2 rounded-full ${debtorCount > 0 ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`} />
            </div>
          }
        />
        <StatCard
          label="קריאות ותקלות פתוחות"
          icon={Wrench}
          color="purple"
          value={`${openIssues.length} תקלות`}
          note={urgentIssues.length > 0 ? <span className="px-1.5 py-0.5 rounded bg-[var(--danger-light)] text-[var(--danger)]">{urgentIssues.length} דחופות</span> : null}
          sub={openIssues.length ? `${withVendor} בטיפול ספק • ${openIssues.length - withVendor} ממתינות לשיוך` : 'הכל תקין'}
          footer={
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{nextVisit ? <>ביקור הבא: <strong className="text-[var(--text-primary)]">{nextVisit.title}</strong> — {shortDate(nextVisit.scheduledDate)}</> : 'אין ביקורים מתוזמנים'}</span>
              <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            </div>
          }
        />
        <StatCard
          label={`הוצאות ${monthName}`}
          icon={ReceiptText}
          color="slate"
          value={formatCurrency(totalExpenses)}
          sub={balance != null ? <>יתרת קופה: <strong className={balance >= 0 ? 'text-[var(--text-primary)]' : 'text-[var(--danger)]'}>{formatCurrency(balance)}</strong></> : null}
          footer={<span className="truncate block">{topCategories.length ? topCategories.join(', ') : 'אין הוצאות רשומות החודש'}</span>}
        />
      </section>

      {/* 3 ── Ledger + issues */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SectionCard
          className="lg:col-span-7"
          icon={Receipt}
          title="מעקב גביית ועד וחייבים"
          subtitle={`${monthName} ${now.getFullYear()} • ${units.length} דירות`}
          actions={
            <>
              <TabGroup
                tabs={[
                  { key: 'debtors', label: 'חייבים', count: debtorCount },
                  { key: 'paid', label: 'שילמו', count: monthPayments.filter((p) => p.status === 'paid').length },
                ]}
                activeTab={tableTab}
                onChange={setTableTab}
              />
              <button
                onClick={() => downloadCsv(`gvia-${currentMonth}-${tableTab}.csv`, [
                  ['דירה', 'דייר', 'סכום', 'סטטוס'],
                  ...tableRows.map((r) => [r.u?.number, r.u?.name, r.amount, PAY_STATUS[r.status]?.label || r.status]),
                ])}
                className="h-8 px-2 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] text-[12px] flex items-center gap-1"
                title="ייצוא לאקסל"
              >
                <Download className="h-4 w-4" /><span className="hidden sm:inline">אקסל</span>
              </button>
            </>
          }
          footer={`מציג ${tableRows.length} ${tableTab === 'debtors' ? 'חייבים' : 'משלמים'}`}
          footerLink={{ to: '/payments', label: `לגבייה של כל ${units.length} הדירות` }}
        >
          {noChargesYet ? (
            <div className="py-12 text-center">
              <CreditCard className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" strokeWidth={1.5} />
              <p className="text-[13px] text-[var(--text-secondary)]">טרם הופקו חיובים לחודש {monthName}</p>
              <Link to="/payments" className="text-[12px] text-[var(--primary)] font-semibold hover:underline">להפקת חיובים בעמוד הגבייה</Link>
            </div>
          ) : tableRows.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-[var(--text-secondary)]">
              {tableTab === 'debtors' ? 'אין חייבים החודש — כל הכבוד! 🎉' : 'עדיין אין תשלומים החודש'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>דירה</th>
                    <th>שם דייר</th>
                    <th className="!text-left">סכום</th>
                    {tableTab === 'debtors' && <th>משך איחור</th>}
                    <th>סטטוס</th>
                    {tableTab === 'debtors' && <th className="!text-center">פעולות מהירות</th>}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 8).map((r) => {
                    const st = PAY_STATUS[r.status] || PAY_STATUS.pending
                    const msg = `שלום ${r.u?.household || `דירה ${r.u?.number || ''}`.trim()}, תזכורת ידידותית מוועד הבית: דמי הוועד לחודש ${monthName} (${formatCurrency(r.amount)}) טרם התקבלו. תודה רבה 🙏`
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">
                          <span className="text-[16px] font-bold num-tabular">{r.u?.number || '—'}</span>
                          {r.u?.floor != null && r.u.floor !== '' && <span className="block text-[11px] text-[var(--text-muted)]">קומה {r.u.floor}</span>}
                        </td>
                        <td className="whitespace-nowrap">
                          <p className="text-[14px] font-semibold leading-snug">{r.u?.name || 'ללא דייר רשום'}</p>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-container)] text-[var(--text-secondary)] text-[11px]">{r.u?.type === 'rented' ? 'שוכר' : 'בעלים'}</span>
                        </td>
                        <td className="whitespace-nowrap !text-left">
                          <span className={`text-[16px] font-bold num-tabular ${r.status === 'overdue' ? 'text-[var(--danger)]' : ''}`}>{formatCurrency(r.amount)}</span>
                        </td>
                        {tableTab === 'debtors' && (
                          <td className="whitespace-nowrap">
                            <span className={`text-[12px] font-semibold num-tabular ${daysIntoMonth > 14 ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>{daysIntoMonth} ימים</span>
                          </td>
                        )}
                        <td className="whitespace-nowrap"><Badge variant={st.variant}>{st.label}</Badge></td>
                        {tableTab === 'debtors' && (
                          <td className="whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {r.u?.phone ? (
                                <>
                                  <a href={waLink(r.u.phone, msg) || '#'} target="_blank" rel="noopener noreferrer" title="תזכורת בוואטסאפ"
                                    className="p-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-container)] text-[var(--success)] transition-colors">
                                    <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                                  </a>
                                  <a href={telHref(r.u.phone)} title="שיחה טלפונית"
                                    className="p-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-container)] text-[var(--primary)] transition-colors">
                                    <Phone className="h-4 w-4" strokeWidth={1.75} />
                                  </a>
                                </>
                              ) : <span className="text-[11px] text-[var(--text-muted)]">אין טלפון</span>}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          className="lg:col-span-5"
          icon={HardHat}
          title="קריאות שירות ומעקב טיפול"
          subtitle="תקלות פעילות הדורשות פיקוח"
          actions={
            <Link to="/issues?new=1" className="h-8 px-2.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-container)] text-[var(--primary)] text-[11px] font-semibold flex items-center gap-1 transition-colors">
              <Plus className="h-4 w-4" />פתח קריאה
            </Link>
          }
          footer={`סה״כ ${openIssues.length} תקלות פתוחות`}
          footerLink={{ to: '/issues', label: 'לכל התקלות' }}
          bodyClassName="p-4 space-y-3"
        >
          {issueStack.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[var(--text-secondary)]">אין תקלות פתוחות — הבניין תקין ✓</p>
          ) : issueStack.map((iss) => {
            const urgent = iss.priority === 'urgent' || iss.priority === 'high'
            const reporter = dir.byId[iss.unitId]
            return (
              <div key={iss.id} className={`p-3.5 rounded-[var(--radius)] border space-y-2.5 transition-colors ${urgent ? 'border-[var(--danger)]/30 bg-[var(--danger-light)]/40 hover:border-[var(--danger)]/50' : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--outline-variant)]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {urgent ? <Badge variant="solid">דחוף</Badge> : <Badge variant="info">{issueStatusLabel(iss.status)}</Badge>}
                    {iss.category && <span className="text-[12px] font-bold text-[var(--text-primary)]">{iss.category}</span>}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />{timeAgo(iss.reportedAt || iss.created_at)}
                  </span>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold leading-tight text-[var(--text-primary)]">{iss.title}</h3>
                  <p className="text-[12px] leading-[18px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                    {iss.description ? `${iss.description} ` : ''}
                    {reporter && <>דווח ע״י <strong className="text-[var(--text-primary)]">דירה {reporter.number}{reporter.lastName ? ` (${reporter.lastName})` : ''}</strong>.</>}
                  </p>
                </div>
                <div className={`pt-2 border-t flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)] ${urgent ? 'border-[var(--danger)]/20' : 'border-[var(--border)]'}`}>
                  <span className="flex items-center gap-1.5 truncate">
                    <Wrench className="h-4 w-4 text-[var(--primary)] shrink-0" strokeWidth={1.75} />
                    {iss.vendor_name
                      ? <>ספק: <strong className="text-[var(--text-primary)]">{iss.vendor_name}</strong>{iss.scheduledDate ? ` • ${shortDate(iss.scheduledDate)}` : ''}</>
                      : 'ממתין לשיוך ספק'}
                  </span>
                  <Link to={`/issues?open=${iss.id}`} className="text-[var(--primary)] hover:underline font-semibold shrink-0">פרטים</Link>
                </div>
              </div>
            )
          })}
        </SectionCard>
      </div>

      {/* 4 ── Attention row (only non-empty sections render) */}
      {(maintenanceDue.length > 0 || expiryAlerts.length > 0 || agentAlerts.length > 0 || pendingBookings.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingBookings.length > 0 && (
            <SectionCard icon={DoorOpen} title="הזמנות חדר ממתינות לאישור" subtitle={`${pendingBookings.length} בקשות`} footerLink={{ to: '/room-booking', label: 'לאישור ההזמנות' }} bodyClassName="p-2">
              {pendingBookings.slice(0, 5).map((b) => (
                <Link key={b.id} to="/room-booking" className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-[13px]">
                  <span className="truncate text-[var(--text-primary)]">{b.booker_name || 'דייר'}</span>
                  <span className="text-[12px] text-[var(--text-secondary)] num-tabular shrink-0">{b.booking_date ? new Date(b.booking_date).toLocaleDateString('he-IL') : ''}</span>
                </Link>
              ))}
            </SectionCard>
          )}
          {maintenanceDue.length > 0 && (
            <SectionCard icon={CalendarClock} title="תחזוקה מתקרבת" subtitle="45 הימים הקרובים" footerLink={{ to: '/recurring-tasks', label: 'לכל המשימות' }} bodyClassName="p-2">
              {maintenanceDue.map((m, i) => (
                <Link key={i} to="/recurring-tasks" className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-[13px]">
                  <span className="flex items-center gap-2 min-w-0">
                    {m.requiredByLaw && <Badge variant="danger" className="!px-1.5">חוק</Badge>}
                    <span className="truncate text-[var(--text-primary)]">{m.title}</span>
                  </span>
                  <span className={`text-[12px] font-semibold shrink-0 num-tabular ${m.overdue ? 'text-[var(--danger)]' : m.daysUntil <= 7 ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}>
                    {m.overdue ? `באיחור ${Math.abs(m.daysUntil)} ימים` : m.daysUntil === 0 ? 'היום' : `בעוד ${m.daysUntil} ימים`}
                  </span>
                </Link>
              ))}
            </SectionCard>
          )}
          {expiryAlerts.length > 0 && (
            <SectionCard icon={ShieldAlert} title="תפוגות ומשימות באיחור" subtitle="רגולציה, מסמכים, ביטוח ספקים" bodyClassName="p-2">
              {expiryAlerts.map((a) => (
                <Link key={a.id} to={a.link} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--text-primary)] font-medium">{a.label}</span>
                    {a.detail && <span className="block text-[11px] text-[var(--text-muted)]">{a.detail}</span>}
                  </span>
                  <span className={`text-[12px] font-semibold shrink-0 num-tabular ${a.daysLeft <= 7 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
                    {a.daysLeft < 0 ? `באיחור ${Math.abs(a.daysLeft)} ימים` : a.daysLeft === 0 ? 'היום' : `בעוד ${a.daysLeft} ימים`}
                  </span>
                </Link>
              ))}
            </SectionCard>
          )}
          {agentAlerts.length > 0 && (
            <SectionCard icon={Zap} title="התראות הסוכנים החכמים" footerLink={{ to: '/smart-agents', label: 'לכל הסוכנים' }} bodyClassName="p-3 space-y-2">
              {agentAlerts.map((a) => (
                <div key={a.id} className={`p-3 rounded-[var(--radius)] border-r-[3px] bg-[var(--bg)] ${a.severity === 'high' ? 'border-[var(--danger)]' : a.severity === 'medium' ? 'border-[var(--warning)]' : 'border-[var(--primary)]'}`}>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{a.title}</p>
                  {a.description && <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{a.description}</p>}
                </div>
              ))}
            </SectionCard>
          )}
        </div>
      )}

      {/* 5 ── Latest announcement banner */}
      <div className="p-4 bg-[var(--surface-container)] border border-[var(--primary)]/20 rounded-[var(--radius)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-[var(--radius-lg)] bg-[var(--primary)] text-white flex items-center justify-center shrink-0">
            <Megaphone className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--primary-dark)] text-white font-bold">
                {announcement ? 'הודעה אחרונה לדיירי הבניין' : 'אין הודעות פעילות'}
              </span>
              {announcement?.created_at && <span className="text-[11px] text-[var(--text-muted)]">{timeAgo(announcement.created_at)}</span>}
            </div>
            <p className="text-[14px] text-[var(--text-primary)] font-medium mt-0.5 truncate">
              {announcement ? announcement.title : 'שלחו עדכון לכל הדיירים — יופיע בפורטל ויישלח כהתראה לנייד'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <Link to="/announcements" className="h-9 px-3 rounded-[var(--radius)] bg-[var(--surface)] hover:bg-[var(--bg)] border border-[var(--border)] text-[12px] text-[var(--text-secondary)] font-semibold flex items-center">
            כל ההודעות
          </Link>
          <Link to="/announcements" className="h-9 px-3.5 rounded-[var(--radius)] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-[12px] font-semibold flex items-center gap-1.5">
            <Plus className="h-4 w-4" />הודעה חדשה
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
