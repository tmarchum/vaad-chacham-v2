import { useState, useMemo, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { Select } from '@/components/ui/select'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SearchBar } from '@/components/common/SearchBar'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { notifyAnnouncement } from '@/lib/notify'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  Plus, Megaphone, FileText, AlertTriangle, Calendar, Pencil, Trash2, Wrench,
  Mail, Bell, Send, Timer, Clock, CalendarClock, PenSquare, Eye, Rocket,
  ChevronDown, ChevronUp, Users, Pin,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  general:     { label: 'כללי',    icon: Megaphone,     chip: 'bg-[var(--surface-container)] text-[var(--primary-dark)]' },
  maintenance: { label: 'תחזוקה', icon: Wrench,        chip: 'bg-[var(--warning-light)] text-[var(--warning)]' },
  urgent:      { label: 'דחוף',   icon: AlertTriangle, chip: 'bg-[var(--danger-light)] text-[var(--danger)]' },
  meeting:     { label: 'אסיפה',  icon: Calendar,      chip: 'bg-[var(--success-light)] text-[var(--success)]' },
}

const TYPE_OPTIONS = [
  { value: 'general',     label: 'כללי' },
  { value: 'maintenance', label: 'תחזוקה' },
  { value: 'urgent',      label: 'דחוף' },
  { value: 'meeting',     label: 'אסיפה' },
]

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'רגיל' },
  { value: 'high',   label: 'גבוה' },
  { value: 'urgent', label: 'דחוף' },
]

const MEETING_TYPE = {
  annual:    'אסיפה שנתית',
  committee: 'ישיבת ועד',
  emergency: 'אסיפה דחופה',
}

const MEETING_TYPE_OPTIONS = [
  { value: 'annual',    label: 'אסיפה שנתית' },
  { value: 'committee', label: 'ישיבת ועד' },
  { value: 'emergency', label: 'אסיפה דחופה' },
]

const EMPTY_ANNOUNCEMENT_FORM = {
  buildingId: '',
  title: '',
  content: '',
  type: 'general',
  priority: 'normal',
  expiresAt: '',
  author: 'ועד הבית',
}

const EMPTY_MINUTES_FORM = {
  buildingId: '',
  title: '',
  date: '',
  attendees: '',
  totalUnits: '',
  type: 'committee',
  summary: '',
  decisions: '',
  nextMeeting: '',
  author: 'ועד הבית',
}

const TITLE_MAX = 80
const DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpired(expiresAt) {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function expiresSoon(expiresAt) {
  if (!expiresAt) return false
  const ms = new Date(expiresAt).getTime() - Date.now()
  return ms >= 0 && ms <= 2 * DAY
}

function useIsWide() {
  const query = '(min-width: 1280px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-[var(--primary)]' : 'bg-[var(--outline-variant)]',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      <span className={cn(
        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
        checked ? 'right-0.5' : 'right-[18px]'
      )} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Composer — the same form inline (wide screens) and inside the dialog
// ---------------------------------------------------------------------------

function AnnouncementComposer({
  form, setField, isEditing, sendEmail, setSendEmail, onSubmit, onCancel,
  isSaving, buildingName, reach, inline,
}) {
  const typeInfo = TYPE_CONFIG[form.type] || TYPE_CONFIG.general
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">סיווג הודעה</label>
        <div className="grid grid-cols-4 gap-1.5">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setField('type')(t.value)}
              className={cn(
                'h-[34px] rounded-[var(--radius)] border text-[12px] font-semibold transition-colors',
                form.type === t.value
                  ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                  : 'bg-[var(--surface)] border-[var(--outline-variant)] text-[var(--text-secondary)] hover:border-[var(--primary)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12px] font-semibold text-[var(--text-secondary)]">כותרת ההודעה</label>
          <span className="text-[11px] text-[var(--text-muted)] num-tabular">{form.title.length} / {TITLE_MAX}</span>
        </div>
        <input
          value={form.title}
          onChange={setField('title')}
          maxLength={TITLE_MAX}
          required
          placeholder="לדוגמה: החלפת תאורת חירום בלובי"
          className="h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">תוכן ההודעה</label>
        <textarea
          value={form.content}
          onChange={setField('content')}
          rows={inline ? 4 : 5}
          required
          placeholder="דיירים יקרים, ..."
          className="w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 py-2 text-[13px] leading-6 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">בתוקף עד</label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={setField('expiresAt')}
            className="h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">עדיפות</label>
          <Select value={form.priority} onChange={setField('priority')} options={PRIORITY_OPTIONS} />
        </div>
      </div>

      {!isEditing && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-[var(--text-secondary)]">ערוצי הפצה לדיירים</p>
          <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)]">
            <Bell className="h-5 w-5 text-[var(--primary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold">התראת פוש באפליקציה</p>
              <p className="text-[11px] text-[var(--text-muted)]">נשלחת אוטומטית לכל דייר רשום</p>
            </div>
            <Toggle checked disabled />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] border border-[var(--border)]">
            <Mail className="h-5 w-5 text-[var(--text-secondary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold">דואר אלקטרוני</p>
              <p className="text-[11px] text-[var(--text-muted)]">לכל דייר עם כתובת מייל מעודכנת</p>
            </div>
            <Toggle checked={sendEmail} onChange={setSendEmail} />
          </div>
        </div>
      )}

      {inline && (form.title || form.content) && (
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)] mb-2">
            <Eye className="h-4 w-4 text-[var(--primary)]" />כך זה ייראה בטלפון של הדייר
          </p>
          <div className="mx-auto max-w-[280px] rounded-[22px] border-[6px] border-[var(--text-primary)] bg-[var(--surface-secondary)] p-2.5">
            <div className="rounded-xl bg-[var(--surface)] p-3 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
                <span className="flex items-center gap-1 font-semibold text-[var(--primary)]"><Megaphone className="h-3 w-3" />ועד1 • {buildingName || 'הבניין'}</span>
                <span>עכשיו</span>
              </div>
              <p className="text-[12px] font-bold text-[var(--text-primary)] line-clamp-1">{form.title || 'כותרת ההודעה'}</p>
              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">{form.content}</p>
              <span className={cn('inline-block mt-2 px-1.5 py-0.5 rounded text-[10px] font-semibold', typeInfo.chip)}>{typeInfo.label}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={isSaving} className="flex-1">
          <Rocket className="h-4 w-4" />
          {isSaving ? 'שומר...' : isEditing ? 'שמור שינויים' : `פרסם ושלח${reach ? ` לכל הבניין (${reach} דירות)` : ''}`}
        </Button>
        {(onCancel && (!inline || isEditing)) && (
          <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function Announcements() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const {
    data: allAnnouncements,
    create: createAnnouncement,
    update: updateAnnouncement,
    remove: removeAnnouncement,
    isSaving: isSavingAnnouncement,
    isLoading,
  } = useCollection('announcements', scope)
  const {
    data: allMinutes,
    create: createMinutes,
    update: updateMinutes,
    remove: removeMinutes,
    isSaving: isSavingMinutes,
  } = useCollection('meetingMinutes', scope)
  const dir = useUnitDirectory(selectedBuilding?.id)
  const isWide = useIsWide()
  const composerRef = useRef(null)

  const [activeTab, setActiveTab] = useState('active') // active | minutes | archive
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT_FORM)
  const [sendNotifyEmail, setSendNotifyEmail] = useState(true)
  const [deleteAnnouncementTarget, setDeleteAnnouncementTarget] = useState(null)
  const [expandedAnnouncements, setExpandedAnnouncements] = useState({})

  const [minutesFormOpen, setMinutesFormOpen] = useState(false)
  const [editingMinutesId, setEditingMinutesId] = useState(null)
  const [minutesForm, setMinutesForm] = useState(EMPTY_MINUTES_FORM)
  const [deleteMinutesTarget, setDeleteMinutesTarget] = useState(null)
  const [expandedMinutes, setExpandedMinutes] = useState({})

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )
  const defaultBuildingId = selectedBuilding?.id || buildings[0]?.id || ''
  const reach = dir.units.length

  // Keep the inline composer pointed at the current building.
  useEffect(() => {
    if (!editingAnnouncementId) {
      setAnnouncementForm((prev) => ({ ...prev, buildingId: defaultBuildingId }))
    }
  }, [defaultBuildingId, editingAnnouncementId])

  // ── Derived ───────────────────────────────────────────────────────────────
  const sortedAnnouncements = useMemo(() => (
    [...allAnnouncements].sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return db - da
    })
  ), [allAnnouncements])

  const activeList = useMemo(() => sortedAnnouncements.filter((a) => !isExpired(a.expiresAt)), [sortedAnnouncements])
  const archiveList = useMemo(() => sortedAnnouncements.filter((a) => isExpired(a.expiresAt)), [sortedAnnouncements])

  const visibleAnnouncements = useMemo(() => {
    let result = activeTab === 'archive' ? archiveList : activeList
    if (typeFilter !== 'all') result = result.filter((a) => a.type === typeFilter)
    const q = search.trim()
    if (q) result = result.filter((a) => `${a.title || ''} ${a.content || ''}`.includes(q))
    // Urgent first within the active feed.
    if (activeTab === 'active') {
      result = [...result].sort((a, b) => (b.priority === 'urgent') - (a.priority === 'urgent'))
    }
    return result
  }, [activeTab, activeList, archiveList, typeFilter, search])

  const sortedMinutes = useMemo(() => {
    const q = search.trim()
    return [...allMinutes]
      .filter((m) => !q || `${m.title || ''} ${m.summary || ''} ${m.decisions || ''}`.includes(q))
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0
        const db = b.date ? new Date(b.date).getTime() : 0
        return db - da
      })
  }, [allMinutes, search])

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = sortedAnnouncements.filter((a) => {
      if (!a.publishedAt) return false
      const d = new Date(a.publishedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = sortedAnnouncements.filter((a) => {
      if (!a.publishedAt) return false
      const d = new Date(a.publishedAt)
      return d.getMonth() === prevMonthDate.getMonth() && d.getFullYear() === prevMonthDate.getFullYear()
    }).length
    const urgent = activeList.filter((a) => a.priority === 'urgent' || a.type === 'urgent').length
    const soon = activeList.filter((a) => expiresSoon(a.expiresAt))
    const upcoming = allMinutes
      .map((m) => m.nextMeeting)
      .filter((d) => d && new Date(d) >= new Date(now.toDateString()))
      .sort()[0]
    return { thisMonth, prevMonth, urgent, soon, upcoming }
  }, [sortedAnnouncements, activeList, allMinutes])

  // ---------------------------------------------------------------------------
  // Announcement handlers
  // ---------------------------------------------------------------------------

  const resetComposer = () => {
    setEditingAnnouncementId(null)
    setSendNotifyEmail(true)
    setAnnouncementForm({ ...EMPTY_ANNOUNCEMENT_FORM, buildingId: defaultBuildingId })
  }

  const openCreateAnnouncement = () => {
    resetComposer()
    if (isWide) {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      composerRef.current?.querySelector('input')?.focus()
    } else {
      setAnnouncementFormOpen(true)
    }
  }

  const openEditAnnouncement = (ann) => {
    setEditingAnnouncementId(ann.id)
    setAnnouncementForm({
      buildingId: ann.buildingId || '',
      title: ann.title || '',
      content: ann.content || '',
      type: ann.type || 'general',
      priority: ann.priority || 'normal',
      expiresAt: ann.expiresAt ? ann.expiresAt.slice(0, 10) : '',
      author: ann.author || 'ועד הבית',
    })
    if (isWide) composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else setAnnouncementFormOpen(true)
  }

  const handleSubmitAnnouncement = async (e) => {
    e.preventDefault()
    const isNew = !editingAnnouncementId
    const form = { ...announcementForm, buildingId: announcementForm.buildingId || defaultBuildingId }
    const data = {
      ...form,
      publishedAt: form.publishedAt || new Date().toISOString(),
    }
    let createdId = null
    if (editingAnnouncementId) {
      await updateAnnouncement(editingAnnouncementId, data)
    } else {
      const created = await createAnnouncement(data)
      createdId = created?.id || null
    }
    setAnnouncementFormOpen(false)
    const wantEmail = sendNotifyEmail
    resetComposer()

    // Push notification to the building's residents (works even for residents
    // without an email; no-op until FCM is configured).
    if (isNew && createdId) notifyAnnouncement(createdId)

    // ── Send email notifications to residents on new publish ─────────────
    if (isNew && createdId && wantEmail && form.buildingId) {
      try {
        // unit_residents has no building_id — go through the building's units.
        const { data: bUnits } = await supabase.from('units').select('id').eq('building_id', form.buildingId)
        const unitIds = (bUnits || []).map((u) => u.id)
        const { data: residents } = unitIds.length
          ? await supabase
            .from('unit_residents')
            .select('email')
            .in('unit_id', unitIds)
            .eq('archived', false)
            .not('email', 'is', null)
            .neq('email', '')
          : { data: [] }

        if (residents && residents.length > 0) {
          const building = buildings.find((b) => b.id === form.buildingId)
          const buildingName = building?.name || 'הבניין'
          const typeLabel = TYPE_CONFIG[form.type]?.label || 'הודעה'
          const subject = `[${buildingName}] ${typeLabel}: ${form.title}`
          const html = `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9ff; border-radius: 8px;">
  <div style="background: #2563eb; padding: 24px; border-radius: 8px 8px 0 0; text-align: center; margin: -20px -20px 20px -20px;">
    <h1 style="color: white; margin: 0; font-size: 22px;">${buildingName}</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">${typeLabel}</p>
  </div>
  <h2 style="color: #0b1c30; font-size: 18px; margin: 0 0 12px;">${form.title}</h2>
  <p style="color: #565e74; font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${form.content}</p>
  ${form.expiresAt ? `<p style="color: #737686; font-size: 13px; margin-top: 16px;">בתוקף עד: ${new Date(form.expiresAt).toLocaleDateString('he-IL')}</p>` : ''}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="color: #737686; font-size: 12px; text-align: center;">ועד1 — מערכת ניהול ועד בית</p>
</div>`

          let sent = 0
          await Promise.allSettled(
            residents.map(async (r) => {
              try {
                await supabase.functions.invoke('send-notification', {
                  body: { to: r.email, subject, html, buildingId: form.buildingId, channel: 'email' },
                })
                sent++
              } catch { /* */ }
            })
          )
          toast(`הודעה נשלחה ל-${sent} דיירים במייל ✓`)
        }
      } catch { /* silent — notification failure doesn't block publish */ }
    }
  }

  const setAnnouncementField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setAnnouncementForm((prev) => ({ ...prev, [field]: val }))
  }

  const handleDeleteAnnouncement = () => {
    if (deleteAnnouncementTarget) {
      removeAnnouncement(deleteAnnouncementTarget.id)
      setDeleteAnnouncementTarget(null)
    }
  }

  const toggleExpandedAnnouncement = (id) => {
    setExpandedAnnouncements((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ---------------------------------------------------------------------------
  // Meeting minutes handlers
  // ---------------------------------------------------------------------------

  const openCreateMinutes = () => {
    setEditingMinutesId(null)
    setMinutesForm({
      ...EMPTY_MINUTES_FORM,
      buildingId: defaultBuildingId,
      date: new Date().toISOString().slice(0, 16),
      totalUnits: reach || '',
    })
    setMinutesFormOpen(true)
  }

  const openEditMinutes = (min) => {
    setEditingMinutesId(min.id)
    setMinutesForm({
      buildingId: min.buildingId || '',
      title: min.title || '',
      date: min.date ? min.date.slice(0, 16) : '',
      attendees: min.attendees ?? '',
      totalUnits: min.totalUnits ?? '',
      type: min.type || 'committee',
      summary: min.summary || '',
      decisions: min.decisions || '',
      nextMeeting: min.nextMeeting ? min.nextMeeting.slice(0, 10) : '',
      author: min.author || 'ועד הבית',
    })
    setMinutesFormOpen(true)
  }

  const handleSubmitMinutes = async (e) => {
    e.preventDefault()
    const data = {
      ...minutesForm,
      attendees: Number(minutesForm.attendees) || 0,
      totalUnits: Number(minutesForm.totalUnits) || 0,
    }
    if (editingMinutesId) {
      await updateMinutes(editingMinutesId, data)
    } else {
      await createMinutes(data)
    }
    setMinutesFormOpen(false)
  }

  const setMinutesField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setMinutesForm((prev) => ({ ...prev, [field]: val }))
  }

  const handleDeleteMinutes = () => {
    if (deleteMinutesTarget) {
      removeMinutes(deleteMinutesTarget.id)
      setDeleteMinutesTarget(null)
    }
  }

  const toggleExpandedMinutes = (id) => {
    setExpandedMinutes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
        <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
      </div>
    </div>
  )

  const composerProps = {
    form: announcementForm,
    setField: setAnnouncementField,
    isEditing: !!editingAnnouncementId,
    sendEmail: sendNotifyEmail,
    setSendEmail: setSendNotifyEmail,
    onSubmit: handleSubmitAnnouncement,
    isSaving: isSavingAnnouncement,
    buildingName: selectedBuilding?.name,
    reach,
  }

  const monthDelta = stats.thisMonth - stats.prevMonth

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הודעות ועד ופרוטוקולים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            שידור הודעות דחופות ושוטפות לדיירים ושיתוף פרוטוקולי ישיבות{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={openCreateMinutes}><PenSquare className="h-4 w-4" />פרוטוקול ישיבה</Button>
          <Button onClick={openCreateAnnouncement}><Plus className="h-4 w-4" />הודעה חדשה</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="הודעות פעילות כעת" icon={Megaphone} color="blue"
          value={String(activeList.length)}
          footer={stats.urgent
            ? <span className="inline-flex items-center gap-1 font-semibold text-[var(--danger)]"><Pin className="h-3.5 w-3.5" />{stats.urgent} דחופות בראש הלוח</span>
            : <span>אין הודעות דחופות פתוחות</span>} />
        <StatCard label="פורסמו החודש" icon={Send} color="emerald"
          value={String(stats.thisMonth)}
          footer={<span className={cn('font-semibold', monthDelta >= 0 ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]')}>
            {monthDelta >= 0 ? '+' : ''}{monthDelta} לעומת החודש שעבר
          </span>} />
        <StatCard label="דירות שמקבלות הודעות" icon={Users} color="purple"
          value={String(reach)}
          sub={`${dir.units.filter((u) => u.name).length} דירות עם דייר רשום`}
          progress={reach ? Math.round((dir.units.filter((u) => u.name).length / reach) * 100) : 0} />
        <StatCard label="פגות תוקף ב-48 שעות" icon={Timer} color={stats.soon.length ? 'amber' : 'slate'}
          value={String(stats.soon.length)}
          footer={stats.soon[0]
            ? <span className="inline-flex items-center gap-1 text-[var(--warning)] font-semibold truncate"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{stats.soon[0].title}</span>
            : stats.upcoming
              ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />ישיבה הבאה: {formatDate(stats.upcoming)}</span>
              : <span>אין הודעות שעומדות לפוג</span>} />
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pb-1 border-b border-[var(--border)]">
        <TabGroup
          tabs={[
            { key: 'active', label: 'הודעות פעילות', count: activeList.length },
            { key: 'minutes', label: 'פרוטוקולים וישיבות', count: allMinutes.length },
            { key: 'archive', label: 'ארכיון', count: archiveList.length },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <div className="flex items-center gap-2 md:ms-auto">
          {activeTab !== 'minutes' && (
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[{ value: 'all', label: 'כל הסוגים' }, ...TYPE_OPTIONS]}
              className="w-[130px]"
            />
          )}
          <SearchBar value={search} onChange={setSearch} placeholder="סינון ברשימה..." className="w-full md:w-[220px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Feed */}
        <div className="xl:col-span-7 space-y-4">
          {activeTab !== 'minutes' && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[16px] font-bold">{activeTab === 'archive' ? 'הודעות שפג תוקפן' : 'פיד עדכונים פעיל'}</h2>
                <span className="text-[12px] text-[var(--text-muted)] num-tabular">מציג {visibleAnnouncements.length} עדכונים • לפי תאריך (אחרונים)</span>
              </div>

              {visibleAnnouncements.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title={activeTab === 'archive' ? 'הארכיון ריק' : 'אין הודעות פעילות'}
                  description={activeTab === 'archive' ? 'הודעות שפג תוקפן יופיעו כאן' : 'פרסמו הודעה ראשונה לדיירי הבניין'}
                  actionLabel={activeTab === 'archive' ? undefined : 'הודעה חדשה'}
                  onAction={activeTab === 'archive' ? undefined : openCreateAnnouncement}
                />
              ) : visibleAnnouncements.map((ann) => {
                const typeInfo = TYPE_CONFIG[ann.type] || TYPE_CONFIG.general
                const TypeIcon = typeInfo.icon
                const expired = isExpired(ann.expiresAt)
                const urgent = ann.priority === 'urgent' || ann.type === 'urgent'
                const soon = expiresSoon(ann.expiresAt)
                const expanded = !!expandedAnnouncements[ann.id]
                const long = (ann.content || '').length > 180
                return (
                  <article
                    key={ann.id}
                    className={cn(
                      'rounded-[var(--radius)] border bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden',
                      urgent && !expired ? 'border-[var(--danger)]/40 border-t-4 border-t-[var(--danger)]' : 'border-[var(--border)]',
                      editingAnnouncementId === ann.id && 'ring-2 ring-[var(--primary)]'
                    )}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', typeInfo.chip)}>
                            <TypeIcon className="h-3 w-3" />{typeInfo.label}
                          </span>
                          {urgent && !expired && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--danger-light)] text-[var(--danger)]">
                              <Pin className="h-3 w-3" />נעוץ — דחוף
                            </span>
                          )}
                          {ann.priority === 'high' && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--warning-light)] text-[var(--warning)]">עדיפות גבוהה</span>
                          )}
                          {expired && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--text-muted)]">פג תוקף</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditAnnouncement(ann)} aria-label="עריכה">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteAnnouncementTarget(ann)} aria-label="מחיקה">
                            <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                          </Button>
                        </div>
                      </div>
                      <h3 className="text-[16px] leading-6 font-bold text-[var(--text-primary)]">{ann.title}</h3>
                      {ann.content && (
                        <p className={cn('text-[13px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap mt-1', !expanded && 'line-clamp-3')}>
                          {ann.content}
                        </p>
                      )}
                      {long && (
                        <button onClick={() => toggleExpandedAnnouncement(ann.id)} className="mt-1 text-[12px] font-semibold text-[var(--primary)] inline-flex items-center gap-0.5">
                          {expanded ? <>הצג פחות<ChevronUp className="h-3.5 w-3.5" /></> : <>קרא עוד<ChevronDown className="h-3.5 w-3.5" /></>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 sm:px-5 py-2.5 border-t border-[var(--border-light)] bg-[var(--surface-secondary)]/60 text-[12px] text-[var(--text-secondary)] num-tabular">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />פורסם: {ann.publishedAt ? formatDate(ann.publishedAt) : '—'}</span>
                      {ann.expiresAt && (
                        <span className={cn('inline-flex items-center gap-1', soon && 'text-[var(--warning)] font-semibold')}>
                          <CalendarClock className="h-3.5 w-3.5" />תוקף: {formatDate(ann.expiresAt)}
                        </span>
                      )}
                      {ann.author && <span className="ms-auto text-[var(--text-muted)]">{ann.author}</span>}
                    </div>
                  </article>
                )
              })}
            </>
          )}

          {activeTab === 'minutes' && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[16px] font-bold">פרוטוקולי אסיפות וישיבות</h2>
                <Button variant="outline" size="sm" onClick={openCreateMinutes}><Plus className="h-4 w-4" />פרוטוקול חדש</Button>
              </div>
              {sortedMinutes.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="אין פרוטוקולים"
                  description="תעדו כאן ישיבות ועד ואסיפות דיירים"
                  actionLabel="הוסף פרוטוקול"
                  onAction={openCreateMinutes}
                />
              ) : sortedMinutes.map((min) => {
                const attendees = Number(min.attendees) || 0
                const totalUnits = Number(min.totalUnits) || 0
                const hasQuorum = totalUnits > 0 && attendees / totalUnits >= 0.5
                const quorumPct = totalUnits > 0 ? Math.min(100, Math.round((attendees / totalUnits) * 100)) : 0
                const expanded = !!expandedMinutes[min.id]
                return (
                  <article key={min.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--primary-dark)]">
                            <FileText className="h-3 w-3" />{MEETING_TYPE[min.type] || min.type}
                          </span>
                          {totalUnits > 0 && (
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold',
                              hasQuorum ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--danger-light)] text-[var(--danger)]')}>
                              {hasQuorum ? 'יש מניין' : 'אין מניין'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditMinutes(min)} aria-label="עריכה"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteMinutesTarget(min)} aria-label="מחיקה"><Trash2 className="h-4 w-4 text-[var(--danger)]" /></Button>
                        </div>
                      </div>
                      <h3 className="text-[16px] leading-6 font-bold">{min.title}</h3>
                      {min.summary && (
                        <p className={cn('text-[13px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap mt-1', !expanded && 'line-clamp-2')}>{min.summary}</p>
                      )}
                      {totalUnits > 0 && (
                        <div className="mt-3 p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)]/60">
                          <div className="flex items-center justify-between text-[12px] mb-1.5 num-tabular">
                            <span className="text-[var(--text-secondary)]">נוכחות: <b className="text-[var(--text-primary)]">{attendees}/{totalUnits}</b> דירות</span>
                            <span className={cn('font-semibold', hasQuorum ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>{quorumPct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                            <div className={cn('h-full rounded-full', hasQuorum ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} style={{ width: `${quorumPct}%` }} />
                          </div>
                        </div>
                      )}
                      {expanded && min.decisions && (
                        <div className="mt-3">
                          <p className="text-[12px] font-semibold text-[var(--text-muted)]">החלטות</p>
                          <p className="text-[13px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">{min.decisions}</p>
                        </div>
                      )}
                      {(min.decisions || (min.summary || '').length > 120) && (
                        <button onClick={() => toggleExpandedMinutes(min.id)} className="mt-2 text-[12px] font-semibold text-[var(--primary)] inline-flex items-center gap-0.5">
                          {expanded ? <>הצג פחות<ChevronUp className="h-3.5 w-3.5" /></> : <>פרוטוקול מלא והחלטות<ChevronDown className="h-3.5 w-3.5" /></>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 sm:px-5 py-2.5 border-t border-[var(--border-light)] bg-[var(--surface-secondary)]/60 text-[12px] text-[var(--text-secondary)] num-tabular">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{min.date ? formatDate(min.date) : '—'}</span>
                      {min.nextMeeting && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />ישיבה הבאה: {formatDate(min.nextMeeting)}</span>}
                      {min.author && <span className="ms-auto text-[var(--text-muted)]">{min.author}</span>}
                    </div>
                  </article>
                )
              })}
            </>
          )}
        </div>

        {/* Composer panel (wide screens) */}
        {isWide && (
          <aside ref={composerRef} className="xl:col-span-5 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] scroll-mt-20">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
              <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]"><PenSquare className="h-[18px] w-[18px]" /></span>
              <div className="flex-1">
                <h2 className="text-[16px] font-bold">{editingAnnouncementId ? 'עריכת הודעה' : 'יצירת הודעה חדשה לדיירים'}</h2>
                {selectedBuilding && <p className="text-[11px] text-[var(--text-muted)]">תישלח לדיירי {selectedBuilding.name}</p>}
              </div>
            </div>
            <div className="p-4">
              <AnnouncementComposer {...composerProps} inline onCancel={resetComposer} />
            </div>
          </aside>
        )}
      </div>

      {/* Delete confirms */}
      <DeleteConfirm
        open={!!deleteAnnouncementTarget}
        onOpenChange={() => setDeleteAnnouncementTarget(null)}
        onConfirm={handleDeleteAnnouncement}
        itemName={deleteAnnouncementTarget?.title || 'הודעה'}
      />
      <DeleteConfirm
        open={!!deleteMinutesTarget}
        onOpenChange={() => setDeleteMinutesTarget(null)}
        onConfirm={handleDeleteMinutes}
        itemName={deleteMinutesTarget?.title || 'פרוטוקול'}
      />

      {/* Composer dialog (narrow screens) */}
      <Dialog open={announcementFormOpen && !isWide} onOpenChange={(o) => { setAnnouncementFormOpen(o); if (!o) resetComposer() }}>
        <DialogContent className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAnnouncementId ? 'עריכת הודעה' : 'הודעה חדשה'}</DialogTitle>
          </DialogHeader>
          <AnnouncementComposer {...composerProps} onCancel={() => { setAnnouncementFormOpen(false); resetComposer() }} />
        </DialogContent>
      </Dialog>

      {/* Create / Edit Meeting Minutes Dialog */}
      <Dialog open={minutesFormOpen} onOpenChange={setMinutesFormOpen}>
        <DialogContent className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMinutesId ? 'עריכת פרוטוקול' : 'פרוטוקול חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMinutes} className="space-y-4">
            {buildings.length > 1 && (
              <FormSelect
                label="בניין"
                value={minutesForm.buildingId}
                onChange={setMinutesField('buildingId')}
                options={buildingOptions}
                placeholder="בחר בניין"
                required
              />
            )}
            <FormField label="כותרת" value={minutesForm.title} onChange={setMinutesField('title')} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="תאריך ושעה" type="datetime-local" value={minutesForm.date} onChange={setMinutesField('date')} />
              <FormSelect label="סוג ישיבה" value={minutesForm.type} onChange={setMinutesField('type')} options={MEETING_TYPE_OPTIONS} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="דירות שהשתתפו" type="number" value={minutesForm.attendees} onChange={setMinutesField('attendees')} />
              <FormField label="סה״כ דירות בבניין" type="number" value={minutesForm.totalUnits} onChange={setMinutesField('totalUnits')} />
            </div>
            <FormTextarea label="סיכום" value={minutesForm.summary} onChange={setMinutesField('summary')} rows={4} />
            <FormTextarea label="החלטות" value={minutesForm.decisions} onChange={setMinutesField('decisions')} rows={4} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="ישיבה הבאה" type="date" value={minutesForm.nextMeeting} onChange={setMinutesField('nextMeeting')} />
              <FormField label="רשם/ה" value={minutesForm.author} onChange={setMinutesField('author')} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSavingMinutes}>
                {isSavingMinutes ? 'שומר...' : editingMinutesId ? 'שמור שינויים' : 'הוסף פרוטוקול'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMinutesFormOpen(false)}>ביטול</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Announcements
