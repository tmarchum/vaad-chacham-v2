import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import {
  Plus, Megaphone, FileText, AlertTriangle, Calendar,
  Users, Pencil, Trash2, Wrench,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  general:     { label: 'כללי',    variant: 'default', icon: Megaphone },
  maintenance: { label: 'תחזוקה', variant: 'warning', icon: Wrench },
  urgent:      { label: 'דחוף',   variant: 'danger',  icon: AlertTriangle },
  meeting:     { label: 'אסיפה',  variant: 'info',    icon: Calendar },
}

const PRIORITY_CONFIG = {
  normal: { label: 'רגיל', variant: 'default' },
  high:   { label: 'גבוה', variant: 'warning' },
  urgent: { label: 'דחוף', variant: 'danger' },
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

const TYPE_FILTERS = [
  { key: 'all',         label: 'הכל' },
  { key: 'general',     label: 'כללי' },
  { key: 'maintenance', label: 'תחזוקה' },
  { key: 'urgent',      label: 'דחוף' },
  { key: 'meeting',     label: 'אסיפה' },
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

const TABS = [
  { key: 'announcements', label: 'הודעות' },
  { key: 'minutes',       label: 'פרוטוקולים' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpired(expiresAt) {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function truncate(str, len = 150) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function Announcements() {
  const { buildings } = useBuildingContext()
  const {
    data: allAnnouncements,
    create: createAnnouncement,
    update: updateAnnouncement,
    remove: removeAnnouncement,
    isSaving: isSavingAnnouncement,
  } = useCollection('announcements')
  const {
    data: allMinutes,
    create: createMinutes,
    update: updateMinutes,
    remove: removeMinutes,
    isSaving: isSavingMinutes,
  } = useCollection('meetingMinutes')

  // Shared state
  const [activeTab, setActiveTab] = useState('announcements')
  const [buildingFilter, setBuildingFilter] = useState('all')

  // Announcements state
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active') // 'active' | 'all'
  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT_FORM)
  const [deleteAnnouncementTarget, setDeleteAnnouncementTarget] = useState(null)
  const [expandedAnnouncements, setExpandedAnnouncements] = useState({})

  // Meeting minutes state
  const [minutesFormOpen, setMinutesFormOpen] = useState(false)
  const [editingMinutesId, setEditingMinutesId] = useState(null)
  const [minutesForm, setMinutesForm] = useState(EMPTY_MINUTES_FORM)
  const [deleteMinutesTarget, setDeleteMinutesTarget] = useState(null)
  const [expandedMinutes, setExpandedMinutes] = useState({})

  // Derived
  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  const filteredAnnouncements = useMemo(() => {
    let result = allAnnouncements

    if (buildingFilter !== 'all') {
      result = result.filter((a) => a.buildingId === buildingFilter)
    }
    if (typeFilter !== 'all') {
      result = result.filter((a) => a.type === typeFilter)
    }
    if (statusFilter === 'active') {
      result = result.filter((a) => !isExpired(a.expiresAt))
    }

    return [...result].sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return db - da
    })
  }, [allAnnouncements, buildingFilter, typeFilter, statusFilter])

  const filteredMinutes = useMemo(() => {
    let result = allMinutes

    if (buildingFilter !== 'all') {
      result = result.filter((m) => m.buildingId === buildingFilter)
    }

    return [...result].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    })
  }, [allMinutes, buildingFilter])

  // ---------------------------------------------------------------------------
  // Announcement handlers
  // ---------------------------------------------------------------------------

  const openCreateAnnouncement = () => {
    setEditingAnnouncementId(null)
    setAnnouncementForm({
      ...EMPTY_ANNOUNCEMENT_FORM,
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
    })
    setAnnouncementFormOpen(true)
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
    setAnnouncementFormOpen(true)
  }

  const handleSubmitAnnouncement = async (e) => {
    e.preventDefault()
    const data = {
      ...announcementForm,
      publishedAt: announcementForm.publishedAt || new Date().toISOString(),
    }
    if (editingAnnouncementId) {
      await updateAnnouncement(editingAnnouncementId, data)
    } else {
      await createAnnouncement(data)
    }
    setAnnouncementFormOpen(false)
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
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
      date: new Date().toISOString().slice(0, 16),
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

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            הודעות ופרוטוקולים
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {activeTab === 'announcements'
              ? `${filteredAnnouncements.length} הודעות`
              : `${filteredMinutes.length} פרוטוקולים`}
          </p>
        </div>
        <Button
          onClick={activeTab === 'announcements' ? openCreateAnnouncement : openCreateMinutes}
        >
          <Plus className="h-4 w-4" />
          {activeTab === 'announcements' ? 'הודעה חדשה' : 'פרוטוקול חדש'}
        </Button>
      </div>

      {/* Tabs */}
      <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Building filter pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={buildingFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBuildingFilter('all')}
        >
          כל הבניינים
        </Button>
        {buildings.map((b) => (
          <Button
            key={b.id}
            variant={buildingFilter === b.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBuildingFilter(b.id)}
          >
            {b.name}
          </Button>
        ))}
      </div>

      {/* ================================================================= */}
      {/* ANNOUNCEMENTS TAB                                                  */}
      {/* ================================================================= */}
      {activeTab === 'announcements' && (
        <>
          {/* Type filter pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>סוג:</span>
            {TYPE_FILTERS.map((tf) => (
              <Button
                key={tf.key}
                variant={typeFilter === tf.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(tf.key)}
              >
                {tf.label}
              </Button>
            ))}
          </div>

          {/* Active / All toggle */}
          <div className="flex gap-2 items-center">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>סטטוס:</span>
            <Button
              variant={statusFilter === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('active')}
            >
              פעיל
            </Button>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              הכל
            </Button>
          </div>

          {/* Cards */}
          {filteredAnnouncements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="אין הודעות"
              description="לא נמצאו הודעות התואמות את הסינון"
              actionLabel="הוסף הודעה"
              onAction={openCreateAnnouncement}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAnnouncements.map((ann) => {
                const typeInfo = TYPE_CONFIG[ann.type] || TYPE_CONFIG.general
                const priorityInfo = PRIORITY_CONFIG[ann.priority] || PRIORITY_CONFIG.normal
                const TypeIcon = typeInfo.icon
                const expired = isExpired(ann.expiresAt)
                const isExpanded = expandedAnnouncements[ann.id]

                return (
                  <Card key={ann.id}>
                    <CardContent className="pt-5 space-y-3">
                      {/* Top row: badges */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Badge variant={typeInfo.variant}>
                          <TypeIcon className="h-3 w-3 ml-1" />
                          {typeInfo.label}
                        </Badge>
                        <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>
                        {expired && <Badge variant="danger">פג תוקף</Badge>}
                      </div>

                      {/* Title */}
                      <h3
                        className="text-base font-bold leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {ann.title}
                      </h3>

                      {/* Content */}
                      {ann.content && (
                        <div>
                          <p
                            className="text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {isExpanded ? ann.content : truncate(ann.content, 150)}
                          </p>
                          {ann.content.length > 150 && (
                            <button
                              className="text-xs mt-1 underline"
                              style={{ color: 'var(--text-secondary)' }}
                              onClick={() => toggleExpandedAnnouncement(ann.id)}
                            >
                              {isExpanded ? 'הצג פחות' : 'הצג עוד'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Bottom meta */}
                      <div
                        className="text-xs space-y-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {ann.author && <p>{ann.author}</p>}
                        {ann.publishedAt && <p>{formatDate(ann.publishedAt)}</p>}
                        {ann.expiresAt && (
                          <p>בתוקף עד {formatDate(ann.expiresAt)}</p>
                        )}
                        {ann.buildingId && buildingMap[ann.buildingId] && (
                          <p style={{ color: 'var(--text-secondary)' }}>
                            {buildingMap[ann.buildingId].name}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditAnnouncement(ann)}
                          aria-label="ערוך"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          עריכה
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteAnnouncementTarget(ann)}
                          aria-label="מחק"
                          className="text-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          מחיקה
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* MEETING MINUTES TAB                                                */}
      {/* ================================================================= */}
      {activeTab === 'minutes' && (
        <>
          {filteredMinutes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="אין פרוטוקולים"
              description="לא נמצאו פרוטוקולים עדיין"
              actionLabel="הוסף פרוטוקול"
              onAction={openCreateMinutes}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMinutes.map((min) => {
                const meetingTypeLabel = MEETING_TYPE[min.type] || min.type
                const attendees = Number(min.attendees) || 0
                const totalUnits = Number(min.totalUnits) || 0
                const hasQuorum = totalUnits > 0 && attendees / totalUnits >= 0.5
                const isSummaryExpanded = expandedMinutes[`${min.id}_summary`]
                const isDecisionsExpanded = expandedMinutes[`${min.id}_decisions`]

                return (
                  <Card key={min.id}>
                    <CardContent className="pt-5 space-y-3">
                      {/* Title + date */}
                      <div>
                        <h3
                          className="text-base font-bold leading-snug"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {min.title}
                        </h3>
                        {min.date && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {formatDate(min.date)}
                          </p>
                        )}
                      </div>

                      {/* Type badge */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Badge variant="default">{meetingTypeLabel}</Badge>
                        {totalUnits > 0 && (
                          <Badge variant={hasQuorum ? 'success' : 'danger'}>
                            {hasQuorum ? 'יש מניין' : 'אין מניין'}
                          </Badge>
                        )}
                      </div>

                      {/* Attendees */}
                      {totalUnits > 0 && (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <Users className="h-3.5 w-3.5 inline ml-1" />
                          {attendees} מתוך {totalUnits} דיירים
                        </p>
                      )}

                      {/* Summary */}
                      {min.summary && (
                        <div>
                          <p
                            className="text-xs font-medium mb-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            סיכום:
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {isSummaryExpanded ? min.summary : truncate(min.summary, 150)}
                          </p>
                          {min.summary.length > 150 && (
                            <button
                              className="text-xs mt-1 underline"
                              style={{ color: 'var(--text-secondary)' }}
                              onClick={() =>
                                toggleExpandedMinutes(`${min.id}_summary`)
                              }
                            >
                              {isSummaryExpanded ? 'הצג פחות' : 'הצג עוד'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Decisions */}
                      {min.decisions && (
                        <div>
                          <p
                            className="text-xs font-medium mb-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            החלטות:
                          </p>
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {isDecisionsExpanded ? min.decisions : truncate(min.decisions, 150)}
                          </p>
                          {min.decisions.length > 150 && (
                            <button
                              className="text-xs mt-1 underline"
                              style={{ color: 'var(--text-secondary)' }}
                              onClick={() =>
                                toggleExpandedMinutes(`${min.id}_decisions`)
                              }
                            >
                              {isDecisionsExpanded ? 'הצג פחות' : 'הצג עוד'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Meta */}
                      <div
                        className="text-xs space-y-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {min.nextMeeting && (
                          <p>פגישה הבאה: {formatDate(min.nextMeeting)}</p>
                        )}
                        {min.author && <p>{min.author}</p>}
                        {min.buildingId && buildingMap[min.buildingId] && (
                          <p>{buildingMap[min.buildingId].name}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditMinutes(min)}
                          aria-label="ערוך"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          עריכה
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteMinutesTarget(min)}
                          aria-label="מחק"
                          className="text-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          מחיקה
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* Delete confirms                                                    */}
      {/* ================================================================= */}
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

      {/* ================================================================= */}
      {/* Create / Edit Announcement Dialog                                 */}
      {/* ================================================================= */}
      <Dialog open={announcementFormOpen} onOpenChange={setAnnouncementFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncementId ? 'עריכת הודעה' : 'הודעה חדשה'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitAnnouncement} className="space-y-4">
            <FormSelect
              label="בניין"
              value={announcementForm.buildingId}
              onChange={setAnnouncementField('buildingId')}
              options={buildingOptions}
              placeholder="בחר בניין"
              required
            />
            <FormField
              label="כותרת"
              value={announcementForm.title}
              onChange={setAnnouncementField('title')}
              required
            />
            <FormTextarea
              label="תוכן"
              value={announcementForm.content}
              onChange={setAnnouncementField('content')}
              rows={5}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="סוג"
                value={announcementForm.type}
                onChange={setAnnouncementField('type')}
                options={TYPE_OPTIONS}
              />
              <FormSelect
                label="עדיפות"
                value={announcementForm.priority}
                onChange={setAnnouncementField('priority')}
                options={PRIORITY_OPTIONS}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="תוקף עד"
                type="date"
                value={announcementForm.expiresAt}
                onChange={setAnnouncementField('expiresAt')}
              />
              <FormField
                label="מחבר"
                value={announcementForm.author}
                onChange={setAnnouncementField('author')}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSavingAnnouncement}>
                {isSavingAnnouncement ? 'שומר...' : editingAnnouncementId ? 'שמור שינויים' : 'פרסם הודעה'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAnnouncementFormOpen(false)}
              >
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Create / Edit Meeting Minutes Dialog                              */}
      {/* ================================================================= */}
      <Dialog open={minutesFormOpen} onOpenChange={setMinutesFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMinutesId ? 'עריכת פרוטוקול' : 'פרוטוקול חדש'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMinutes} className="space-y-4">
            <FormSelect
              label="בניין"
              value={minutesForm.buildingId}
              onChange={setMinutesField('buildingId')}
              options={buildingOptions}
              placeholder="בחר בניין"
              required
            />
            <FormField
              label="כותרת"
              value={minutesForm.title}
              onChange={setMinutesField('title')}
              required
            />
            <FormField
              label="תאריך ושעה"
              type="datetime-local"
              value={minutesForm.date}
              onChange={setMinutesField('date')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="מספר משתתפים"
                type="number"
                value={minutesForm.attendees}
                onChange={setMinutesField('attendees')}
              />
              <FormField
                label="סה״כ יחידות דיור"
                type="number"
                value={minutesForm.totalUnits}
                onChange={setMinutesField('totalUnits')}
              />
            </div>
            <FormSelect
              label="סוג אסיפה"
              value={minutesForm.type}
              onChange={setMinutesField('type')}
              options={MEETING_TYPE_OPTIONS}
            />
            <FormTextarea
              label="סיכום"
              value={minutesForm.summary}
              onChange={setMinutesField('summary')}
              rows={4}
            />
            <FormTextarea
              label="החלטות"
              value={minutesForm.decisions}
              onChange={setMinutesField('decisions')}
              rows={4}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="פגישה הבאה"
                type="date"
                value={minutesForm.nextMeeting}
                onChange={setMinutesField('nextMeeting')}
              />
              <FormField
                label="מחבר"
                value={minutesForm.author}
                onChange={setMinutesField('author')}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSavingMinutes}>
                {isSavingMinutes ? 'שומר...' : editingMinutesId ? 'שמור שינויים' : 'הוסף פרוטוקול'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMinutesFormOpen(false)}
              >
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Announcements
