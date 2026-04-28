import { useMemo, useState, useEffect, useCallback } from 'react'
import { useCollection, useRealtimeCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { FilterPills } from '@/components/common/FilterPills'
import { FormField } from '@/components/common/FormField'
import PageLoader from '@/components/common/PageLoader'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import {
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  Mail, Phone, FileText, Scale, UserCheck, DollarSign, FolderOpen,
  BellOff, Bell, MessageSquare, Plus, X, Check, Edit2, Trash2,
  StickyNote,
} from 'lucide-react'
import { HEBREW_MONTHS } from '@/lib/constants'

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  none:         { label: 'ללא',          variant: 'default', icon: Clock },
  reminder:     { label: 'תזכורת',       variant: 'warning', icon: Mail },
  warning:      { label: 'אזהרה',        variant: 'warning', icon: AlertTriangle },
  legal_warning:{ label: 'אזהרה משפטית', variant: 'danger',  icon: FileText },
  legal_action: { label: 'הליך משפטי',   variant: 'danger',  icon: Scale },
  // legacy keys
  formal:       { label: 'מכתב רשמי',    variant: 'danger',  icon: FileText },
  legal:        { label: 'משפטי',        variant: 'danger',  icon: Scale },
}

const STATUS_CONFIG = {
  open:    { label: 'פתוח',  variant: 'danger' },
  partial: { label: 'חלקי',  variant: 'warning' },
  closed:  { label: 'נסגר',  variant: 'success' },
}

const ESCALATION_OPTIONS = [
  { value: 'none',          label: 'ללא' },
  { value: 'reminder',      label: 'תזכורת' },
  { value: 'warning',       label: 'אזהרה' },
  { value: 'legal_warning', label: 'אזהרה משפטית' },
  { value: 'legal_action',  label: 'הליך משפטי' },
]

const PAYMENT_METHODS = [
  { value: 'transfer',  label: 'העברה בנקאית' },
  { value: 'cash',      label: 'מזומן' },
  { value: 'check',     label: "צ'ק" },
  { value: 'bit',       label: 'ביט' },
  { value: 'paybox',    label: 'PayBox' },
]

const NOTIF_KEY = (bId) => `collection_notif_${bId}`

function monthLabel(mk) {
  if (!mk) return ''
  const [y, m] = mk.split('-')
  return `${HEBREW_MONTHS[parseInt(m) - 1]} ${y}`
}

const EMPTY_CASE = {
  unit_id: '', amount: '', months_overdue: '',
  escalation_level: 'none', notes: '', status: 'open',
}

const EMPTY_PAYMENT = {
  payment_amount: '', payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'transfer',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollectionCases() {
  const { selectedBuilding, refreshBuildings } = useBuildingContext()
  const {
    data: allCases, isLoading, create, update, remove,
  } = useRealtimeCollection('collectionCases', selectedBuilding ? { building_id: selectedBuilding.id } : {})
  const { data: allNotifications } = useCollection('notificationLog')
  const { data: allUnits } = useCollection('units', selectedBuilding ? { building_id: selectedBuilding.id } : {})
  const { data: allResidents } = useCollection('residents')
  const { update: updateBuilding } = useCollection('buildings')

  // ── Notifications toggle ──────────────────────────────────────────────────
  // Source of truth: selectedBuilding.collection_notifications_enabled (Supabase)
  // localStorage used only as optimistic fallback while DB responds
  const notificationsEnabled = selectedBuilding?.collection_notifications_enabled === true

  const toggleNotifications = useCallback(async () => {
    if (!selectedBuilding) return
    const next = !notificationsEnabled
    // Optimistic: write to localStorage immediately for fast UI update
    localStorage.setItem(NOTIF_KEY(selectedBuilding.id), String(next))
    // Persist to DB so Edge Functions and other pages see the same value
    try {
      await updateBuilding(selectedBuilding.id, { collection_notifications_enabled: next })
      await refreshBuildings()
    } catch {
      // Revert localStorage on failure
      localStorage.setItem(NOTIF_KEY(selectedBuilding.id), String(!next))
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירת הגדרה', type: 'error' } }))
    }
  }, [selectedBuilding, notificationsEnabled, updateBuilding, refreshBuildings])

  // ── UI State ──────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]   = useState('open')
  const [expandedId, setExpandedId]       = useState(null)
  const [caseDialog, setCaseDialog]       = useState(null)   // null | 'new' | case object
  const [payDialog, setPayDialog]         = useState(null)   // null | case object
  const [noteDialog, setNoteDialog]       = useState(null)   // null | case object
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [form, setForm]                   = useState(EMPTY_CASE)
  const [payForm, setPayForm]             = useState(EMPTY_PAYMENT)
  const [noteText, setNoteText]           = useState('')
  const [saving, setSaving]               = useState(false)

  // ── Lookups ───────────────────────────────────────────────────────────────
  const unitInfo = useMemo(() => {
    const info = {}
    const primary = {}
    allResidents.forEach(r => {
      if (r.is_primary || !primary[r.unit_id || r.unitId]) {
        primary[r.unit_id || r.unitId] = r
      }
    })
    allUnits.forEach(u => {
      const r = primary[u.id]
      info[u.id] = {
        number: u.unit_number || u.number,
        residentName: r ? `${r.first_name || ''} ${r.last_name || ''}`.trim() : '',
        email: r?.email || '',
        phone: r?.phone || '',
      }
    })
    return info
  }, [allUnits, allResidents])

  const unitOptions = useMemo(() =>
    allUnits.map(u => ({
      value: u.id,
      label: `דירה ${u.unit_number || u.number}${unitInfo[u.id]?.residentName ? ` — ${unitInfo[u.id].residentName}` : ''}`,
    })), [allUnits, unitInfo])

  // ── Filtered cases ────────────────────────────────────────────────────────
  const cases = useMemo(() => {
    let filtered = statusFilter !== 'all'
      ? allCases.filter(c => c.status === statusFilter)
      : allCases
    return filtered.sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0))
  }, [allCases, statusFilter])

  const totalDebt    = cases.filter(c => c.status !== 'closed').reduce((s, c) => s + (c.total_debt || 0), 0)
  const openCount    = cases.filter(c => c.status === 'open').length
  const highEscal    = cases.filter(c => ['legal_warning','legal_action','formal','legal'].includes(c.escalation_level)).length
  const maxDebt      = Math.max(...cases.map(c => c.total_debt || 0), 1)

  const formatDate = (d) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  }

  // ── Handlers: Case CRUD ───────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_CASE)
    setCaseDialog('new')
  }

  const openEdit = (e, c) => {
    e.stopPropagation()
    setForm({
      unit_id: c.unit_id || '',
      amount: c.total_debt || '',
      months_overdue: c.months_overdue || '',
      escalation_level: c.escalation_level || 'none',
      notes: c.notes || '',
      status: c.status || 'open',
    })
    setCaseDialog(c)
  }

  const handleSaveCase = async () => {
    if (!form.unit_id) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש לבחור דירה', type: 'error' } }))
      return
    }
    setSaving(true)
    try {
      const payload = {
        unit_id: form.unit_id,
        building_id: selectedBuilding?.id,
        total_debt: parseFloat(form.amount) || 0,
        months_overdue: parseInt(form.months_overdue) || 0,
        escalation_level: form.escalation_level,
        notes: form.notes,
        status: form.status,
      }
      if (caseDialog === 'new') {
        payload.history = []
        await create(payload)
      } else {
        await update(caseDialog.id, payload)
      }
      setCaseDialog(null)
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירה', type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      setDeleteTarget(null)
      if (expandedId === deleteTarget.id) setExpandedId(null)
    } catch {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה במחיקה', type: 'error' } }))
    }
  }

  const handleToggleClose = async (e, c) => {
    e.stopPropagation()
    const newStatus = c.status === 'closed' ? 'open' : 'closed'
    const history = Array.isArray(c.history) ? [...c.history] : []
    history.push({ date: new Date().toISOString(), note: newStatus === 'closed' ? 'התיק נסגר' : 'התיק נפתח מחדש' })
    await update(c.id, { status: newStatus, history })
  }

  // ── Handler: Record Payment ───────────────────────────────────────────────
  const openPayment = (e, c) => {
    e.stopPropagation()
    setPayForm({ ...EMPTY_PAYMENT, payment_amount: c.total_debt || '' })
    setPayDialog(c)
  }

  const handleSavePayment = async () => {
    if (!payDialog) return
    const amount = parseFloat(payForm.payment_amount) || 0
    if (amount <= 0) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש להזין סכום תשלום', type: 'error' } }))
      return
    }
    setSaving(true)
    try {
      const remaining = Math.max(0, (payDialog.total_debt || 0) - amount)
      const newStatus = remaining === 0 ? 'closed' : remaining < (payDialog.total_debt || 0) ? 'partial' : 'open'
      const history = Array.isArray(payDialog.history) ? [...payDialog.history] : []
      history.push({
        date: new Date().toISOString(),
        note: `תשלום התקבל: ${formatCurrency(amount)} (${PAYMENT_METHODS.find(m => m.value === payForm.payment_method)?.label || payForm.payment_method})`,
      })
      await update(payDialog.id, {
        total_debt: remaining,
        status: newStatus,
        history,
        months_overdue: remaining === 0 ? 0 : payDialog.months_overdue,
      })
      setPayDialog(null)
    } catch {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירת תשלום', type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  // ── Handler: Add Note ─────────────────────────────────────────────────────
  const openNote = (e, c) => {
    e.stopPropagation()
    setNoteText('')
    setNoteDialog(c)
  }

  const handleSaveNote = async () => {
    if (!noteDialog || !noteText.trim()) return
    setSaving(true)
    try {
      const history = Array.isArray(noteDialog.history) ? [...noteDialog.history] : []
      history.push({ date: new Date().toISOString(), note: noteText.trim() })
      await update(noteDialog.id, { history })
      setNoteDialog(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Handler: WhatsApp Reminder ────────────────────────────────────────────
  const sendWhatsApp = async (e, c) => {
    e.stopPropagation()
    if (!notificationsEnabled) {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: 'יש להפעיל שליחת התראות כדי לשלוח תזכורת', type: 'error' },
      }))
      return
    }
    const live = unitInfo[c.unit_id] || {}
    const phone = live.phone || c.resident_phone || ''
    const name = live.residentName || c.resident_name || 'דייר'
    const amount = formatCurrency(c.total_debt || 0)
    const months = c.months_overdue || 1
    const building = selectedBuilding?.name || 'הבניין'
    const msg = encodeURIComponent(
      `שלום ${name},\n\nאנו פונים אליך בעניין יתרת חוב ועד בית לבניין "${building}".\n\n` +
      `סה"כ חוב: ${amount}\nחודשים באיחור: ${months}\n\n` +
      `נבקשך להסדיר את התשלום בהקדם האפשרי.\n\nתודה, ועד הבניין`
    )
    const url = phone
      ? `https://wa.me/972${phone.replace(/^0/, '').replace(/\D/g, '')}?text=${msg}`
      : `https://wa.me/?text=${msg}`
    window.open(url, '_blank')

    // Log to history (fire-and-forget is acceptable here; user already has the WA window open)
    const history = Array.isArray(c.history) ? [...c.history] : []
    history.push({ date: new Date().toISOString(), note: 'תזכורת WhatsApp נשלחה' })
    update(c.id, { history, escalation_level: c.escalation_level === 'none' ? 'reminder' : c.escalation_level })
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <PageHeader
        icon={UserCheck}
        iconColor="red"
        title="מעקב גבייה חכם"
        subtitle={`${openCount} תיקים פתוחים`}
        actions={
          <div className="flex items-center gap-3">
            {/* Notifications toggle */}
            <button
              onClick={toggleNotifications}
              title={notificationsEnabled ? 'כבה שליחת התראות' : 'הפעל שליחת התראות'}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                notificationsEnabled
                  ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {notificationsEnabled
                ? <><Bell className="h-4 w-4" /> התראות פעילות</>
                : <><BellOff className="h-4 w-4" /> התראות כבויות</>
              }
              {/* Toggle pill */}
              <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${notificationsEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </button>

            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              תיק חדש
            </Button>
          </div>
        }
      />

      {/* Notifications-disabled banner */}
      {!notificationsEnabled && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <BellOff className="h-4 w-4 shrink-0" />
          <span>
            <strong>שליחת התראות גבייה כבויה.</strong> הפעל את המתג כדי לאפשר שליחת תזכורות WhatsApp ומייל לדיירים.
          </span>
          <button onClick={toggleNotifications} className="mr-auto text-amber-700 underline font-medium hover:text-amber-900">
            הפעל
          </button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="סה״כ חוב פתוח"   value={formatCurrency(totalDebt)} icon={DollarSign}    color="red" />
        <StatCard label="תיקים פתוחים"    value={openCount}                  icon={FolderOpen}    color="blue" />
        <StatCard label="הסלמה גבוהה"     value={highEscal}                  icon={AlertTriangle} color="amber" />
      </div>

      {/* ── Filter ── */}
      <FilterPills
        options={[
          { key: 'all',     label: 'הכל' },
          { key: 'open',    label: 'פתוחים' },
          { key: 'partial', label: 'שולם חלקית' },
          { key: 'closed',  label: 'נסגרו' },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* ── Cases list ── */}
      {cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400 opacity-50" />
            <p className="text-[var(--text-muted)]">
              {statusFilter === 'open' ? 'אין תיקי גבייה פתוחים 🎉' : 'אין תיקים'}
            </p>
            <button onClick={openCreate} className="mt-3 text-sm text-blue-600 underline hover:text-blue-800">
              פתח תיק חדש
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cases.map(c => {
            const level     = LEVEL_CONFIG[c.escalation_level] || LEVEL_CONFIG.none
            const status    = STATUS_CONFIG[c.status] || STATUS_CONFIG.open
            const expanded  = expandedId === c.id
            const caseNotifs = allNotifications.filter(n => n.case_id === c.id)
            const live      = unitInfo[c.unit_id] || {}
            const unitNumber   = live.number || c.unit_number
            const residentName = live.residentName || c.resident_name || '-'
            const debtPct   = ((c.total_debt || 0) / maxDebt) * 100
            const escalLevels = ['none','reminder','warning','legal_warning','legal_action']
            const escalIdx  = escalLevels.indexOf(c.escalation_level || 'none')
            const LevelIcon = level.icon

            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-white p-5 hover:shadow-md transition-all cursor-pointer ${
                  c.status === 'closed' ? 'border-green-200 opacity-75' :
                  (c.total_debt || 0) > 3000 ? 'border-red-200' : 'border-[var(--border)]'
                }`}
                onClick={() => setExpandedId(expanded ? null : c.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="shrink-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm ${
                      c.status === 'closed'
                        ? 'bg-gradient-to-br from-green-500 to-green-600'
                        : (c.total_debt || 0) > 2000
                          ? 'bg-gradient-to-br from-red-500 to-red-600'
                          : 'bg-gradient-to-br from-amber-500 to-amber-600'
                    }`}>
                      {unitNumber || '?'}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
                          דירה {unitNumber} — {residentName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                            <LevelIcon className="h-3 w-3" />
                            {level.label}
                          </span>
                          {/* Escalation dots */}
                          <span className="flex items-center gap-0.5">
                            {escalLevels.slice(1).map((_, i) => (
                              <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full ${
                                i < escalIdx
                                  ? escalIdx >= 3 ? 'bg-red-500' : 'bg-amber-500'
                                  : 'bg-gray-200'
                              }`} />
                            ))}
                          </span>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className={`text-xl font-extrabold ${
                          c.status === 'closed' ? 'text-green-600' :
                          (c.total_debt || 0) > 2000 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {formatCurrency(c.total_debt || 0)}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">{c.months_overdue || 0} חודשים</div>
                      </div>
                    </div>

                    {/* Debt bar */}
                    <div className={`h-1.5 w-full rounded-full overflow-hidden my-2 ${c.status === 'closed' ? 'bg-green-100' : 'bg-red-100'}`}>
                      <div
                        className={`h-full rounded-full ${c.status === 'closed' ? 'bg-gradient-to-l from-green-500 to-green-400' : 'bg-gradient-to-l from-red-500 to-red-400'}`}
                        style={{ width: Math.min(100, debtPct) + '%' }}
                      />
                    </div>

                    {/* Month chips */}
                    {c.unpaid_months?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.unpaid_months.slice(0, 4).map(m => {
                          const isObj = typeof m === 'object'
                          const mk = isObj ? m.month : m
                          return (
                            <span key={mk} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200">
                              {monthLabel(mk)}
                            </span>
                          )
                        })}
                        {c.unpaid_months.length > 4 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">+{c.unpaid_months.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 mt-1">
                    {expanded ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />}
                  </div>
                </div>

                {/* ── Action buttons ── */}
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                  {/* WhatsApp — disabled when toggle is off */}
                  <button
                    onClick={(e) => sendWhatsApp(e, c)}
                    disabled={!notificationsEnabled}
                    title={notificationsEnabled ? 'שלח תזכורת WhatsApp' : 'הפעל התראות כדי לשלוח'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      notificationsEnabled
                        ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    תזכורת
                    {!notificationsEnabled && <BellOff className="h-3 w-3 opacity-50" />}
                  </button>

                  {c.status !== 'closed' && (
                    <button
                      onClick={(e) => openPayment(e, c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-all"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      תשלום
                    </button>
                  )}

                  <button
                    onClick={(e) => openNote(e, c)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-all"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    הערה
                  </button>

                  <button
                    onClick={(e) => handleToggleClose(e, c)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      c.status === 'closed'
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {c.status === 'closed' ? <><X className="h-3.5 w-3.5" /> פתח מחדש</> : <><Check className="h-3.5 w-3.5" /> סגור תיק</>}
                  </button>

                  <div className="mr-auto flex items-center gap-1.5">
                    <button onClick={(e) => openEdit(e, c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--text-muted)] transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }} className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--text-muted)] hover:text-red-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Expanded details ── */}
                {expanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[var(--text-muted)] text-xs">טלפון:</span><p className="font-medium">{live.phone || c.resident_phone || '-'}</p></div>
                      <div><span className="text-[var(--text-muted)] text-xs">אימייל:</span><p className="font-medium truncate">{live.email || c.resident_email || '-'}</p></div>
                      {c.next_action_date && <div><span className="text-[var(--text-muted)] text-xs">פעולה הבאה:</span><p className="font-medium">{formatDate(c.next_action_date)}</p></div>}
                      {c.notes && <div className="col-span-2"><span className="text-[var(--text-muted)] text-xs">הערות:</span><p className="font-medium">{c.notes}</p></div>}
                    </div>

                    {/* History */}
                    {c.history?.length > 0 && (
                      <div>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">היסטוריה:</span>
                        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                          {[...c.history].reverse().map((h, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-[var(--text-muted)] shrink-0 w-20">{formatDate(h.date)}</span>
                              <span className="text-[var(--text-primary)]">{h.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notifications sent */}
                    {caseNotifs.length > 0 && (
                      <div>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">הודעות שנשלחו ({caseNotifs.length}):</span>
                        <div className="mt-2 space-y-1">
                          {caseNotifs.map(n => (
                            <div key={n.id} className="flex items-center gap-2 text-xs">
                              <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                              <span className="text-[var(--text-muted)]">{formatDate(n.created_at)}</span>
                              <span className="text-[var(--text-primary)]">{n.subject}</span>
                              <Badge variant={n.status === 'sent' ? 'success' : 'danger'}>{n.status === 'sent' ? 'נשלח' : 'נכשל'}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={!!caseDialog} onOpenChange={() => setCaseDialog(null)}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>{caseDialog === 'new' ? 'פתיחת תיק גבייה' : 'עריכת תיק גבייה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">דירה *</label>
              <select
                value={form.unit_id}
                onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              >
                <option value="">בחר דירה</option>
                {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="סכום חוב (₪)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              <FormField label="חודשים באיחור" type="number" value={form.months_overdue} onChange={e => setForm(f => ({ ...f, months_overdue: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">רמת הסלמה</label>
              <select
                value={form.escalation_level}
                onChange={e => {
                  const newLevel = e.target.value
                  const levelOrder = ['none','reminder','warning','legal_warning','legal_action']
                  const currentIdx = levelOrder.indexOf(form.escalation_level || 'none')
                  const newIdx = levelOrder.indexOf(newLevel)
                  // Warn if escalating (not de-escalating) and last action was < 14 days ago
                  if (newIdx > currentIdx && caseDialog && typeof caseDialog === 'object') {
                    const history = Array.isArray(caseDialog.history) ? caseDialog.history : []
                    const lastAction = history.length > 0 ? new Date(history[history.length - 1].date) : null
                    if (lastAction) {
                      const daysSince = Math.ceil((Date.now() - lastAction.getTime()) / (1000 * 60 * 60 * 24))
                      if (daysSince < 14) {
                        window.dispatchEvent(new CustomEvent('app-toast', {
                          detail: {
                            message: `⚠️ הסלמה מהירה: פעולה אחרונה לפני ${daysSince} ימים בלבד. מומלץ להמתין לפחות 14 ימים.`,
                            type: 'warning'
                          }
                        }))
                      }
                    }
                  }
                  setForm(f => ({ ...f, escalation_level: newLevel }))
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              >
                {ESCALATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {caseDialog !== 'new' && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">סטטוס</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">הערות</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                placeholder="הערות פנימיות..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setCaseDialog(null)}>ביטול</Button>
              <Button onClick={handleSaveCase} disabled={saving}>
                {saving ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ── */}
      <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>תיעוד תשלום</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              חוב נוכחי: <strong>{formatCurrency(payDialog?.total_debt || 0)}</strong>
            </div>
            <FormField
              label="סכום שהתקבל (₪) *"
              type="number"
              value={payForm.payment_amount}
              onChange={e => setPayForm(f => ({ ...f, payment_amount: e.target.value }))}
              placeholder="0"
            />
            <FormField
              label="תאריך תשלום"
              type="date"
              value={payForm.payment_date}
              onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">אמצעי תשלום</label>
              <select
                value={payForm.payment_method}
                onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              >
                {PAYMENT_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {payForm.payment_amount && parseFloat(payForm.payment_amount) >= (payDialog?.total_debt || 0) && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center gap-2">
                <Check className="h-3.5 w-3.5" />
                תשלום מלא — התיק יסגר אוטומטית
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setPayDialog(null)}>ביטול</Button>
              <Button onClick={handleSavePayment} disabled={saving}>
                {saving ? 'שומר...' : 'אשר תשלום'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Note Dialog ── */}
      <Dialog open={!!noteDialog} onOpenChange={() => setNoteDialog(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>הוספת הערה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={4}
              autoFocus
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              placeholder="הוסף הערה לתיק..."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setNoteDialog(null)}>ביטול</Button>
              <Button onClick={handleSaveNote} disabled={saving || !noteText.trim()}>
                {saving ? 'שומר...' : 'הוסף'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? `תיק גבייה — דירה ${unitInfo[deleteTarget.unit_id]?.number || deleteTarget.unit_number}` : ''}
      />
    </div>
  )
}
