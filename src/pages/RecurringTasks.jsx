import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, RefreshCw, CheckCircle2, Scale } from 'lucide-react'

const FREQUENCY_MAP = {
  monthly: { label: 'חודשי', variant: 'default', months: 1 },
  quarterly: { label: 'רבעוני', variant: 'info', months: 3 },
  annually: { label: 'שנתי', variant: 'warning', months: 12 },
}

const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'חודשי' },
  { value: 'quarterly', label: 'רבעוני' },
  { value: 'annually', label: 'שנתי' },
]

const FREQUENCY_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'monthly', label: 'חודשי' },
  { key: 'quarterly', label: 'רבעוני' },
  { key: 'annually', label: 'שנתי' },
]

const EMPTY_FORM = {
  buildingId: '',
  title: '',
  frequency: 'monthly',
  next_due_date: '',
  is_required_by_law: false,
  notes: '',
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr)
  due.setHours(0, 0, 0, 0)
  return due < today
}

function getNextDate(currentDateStr, frequency) {
  const months = FREQUENCY_MAP[frequency]?.months || 1
  const date = new Date(currentDateStr)
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

function RecurringTasks() {
  const { buildings } = useBuildingContext()
  const { data: allTasks, create, update, remove, isSaving } = useCollection('recurringTasks')

  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [frequencyFilter, setFrequencyFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailTask, setDetailTask] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

  const filtered = useMemo(() => {
    let result = allTasks

    if (buildingFilter !== 'all') {
      result = result.filter((t) => t.buildingId === buildingFilter)
    }

    if (frequencyFilter !== 'all') {
      result = result.filter((t) => t.frequency === frequencyFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q)
      )
    }

    // Sort: overdue first, then by next_due_date ascending
    result = [...result].sort((a, b) => {
      const aOverdue = isOverdue(a.next_due_date)
      const bOverdue = isOverdue(b.next_due_date)
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      const dateA = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity
      const dateB = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity
      return dateA - dateB
    })

    return result
  }, [allTasks, buildingFilter, frequencyFilter, search])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
      next_due_date: new Date().toISOString().slice(0, 10),
    })
    setFormOpen(true)
  }

  const openEdit = (task) => {
    setEditingId(task.id)
    setForm({
      buildingId: task.buildingId || '',
      title: task.title || '',
      frequency: task.frequency || 'monthly',
      next_due_date: task.next_due_date ? task.next_due_date.slice(0, 10) : '',
      is_required_by_law: task.is_required_by_law || false,
      notes: task.notes || '',
    })
    setFormOpen(true)
    setDetailTask(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = { ...form }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    setFormOpen(false)
  }

  const setField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const handleMarkDone = (task) => {
    const nextDate = getNextDate(task.next_due_date || new Date().toISOString().slice(0, 10), task.frequency)
    update(task.id, { next_due_date: nextDate })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">משימות חוזרות</h1>
          <p className="text-sm text-[var(--text-secondary)]">{filtered.length} משימות</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          משימה חדשה
        </Button>
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי כותרת או הערות..."
      />

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

      {/* Frequency filter pills */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-[var(--text-secondary)] self-center ml-2">תדירות:</span>
        {FREQUENCY_FILTERS.map((ff) => (
          <Button
            key={ff.key}
            variant={frequencyFilter === ff.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFrequencyFilter(ff.key)}
          >
            {ff.label}
          </Button>
        ))}
      </div>

      {/* Task cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="אין משימות חוזרות"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא נוספו משימות חוזרות עדיין'}
          actionLabel={!search ? 'הוסף משימה' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((task) => {
            const freq = FREQUENCY_MAP[task.frequency] || FREQUENCY_MAP.monthly
            const overdue = isOverdue(task.next_due_date)
            return (
              <Card
                key={task.id}
                className="cursor-pointer"
                onClick={() => setDetailTask(task)}
              >
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                      {task.title}
                    </h3>
                    <RefreshCw className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Badge variant={freq.variant}>{freq.label}</Badge>
                    {task.is_required_by_law && (
                      <Badge variant="info">
                        <Scale className="h-3 w-3 ml-1" />
                        נדרש בחוק
                      </Badge>
                    )}
                    {overdue && <Badge variant="danger">באיחור</Badge>}
                  </div>

                  <div className="text-xs text-[var(--text-secondary)] space-y-1">
                    <p>בניין: {buildingMap[task.buildingId]?.name || ''}</p>
                    {task.next_due_date && (
                      <p>תאריך ביצוע הבא: {formatDate(task.next_due_date)}</p>
                    )}
                  </div>

                  {/* Mark as done button */}
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkDone(task)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      סמן כבוצע
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={!!detailTask}
        onOpenChange={() => setDetailTask(null)}
        title={detailTask ? detailTask.title : ''}
        onEdit={() => openEdit(detailTask)}
      >
        {detailTask && (
          <>
            <DetailRow label="בניין" value={buildingMap[detailTask.buildingId]?.name} />
            <DetailRow
              label="תדירות"
              value={
                <Badge variant={FREQUENCY_MAP[detailTask.frequency]?.variant}>
                  {FREQUENCY_MAP[detailTask.frequency]?.label}
                </Badge>
              }
            />
            <DetailRow
              label="תאריך ביצוע הבא"
              value={detailTask.next_due_date ? formatDate(detailTask.next_due_date) : null}
            />
            <DetailRow
              label="נדרש בחוק"
              value={
                detailTask.is_required_by_law ? (
                  <Badge variant="info">כן</Badge>
                ) : (
                  'לא'
                )
              }
            />
            <DetailRow
              label="סטטוס"
              value={
                isOverdue(detailTask.next_due_date) ? (
                  <Badge variant="danger">באיחור</Badge>
                ) : (
                  <Badge variant="success">תקין</Badge>
                )
              }
            />
            <DetailRow label="הערות" value={detailTask.notes} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailTask)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleMarkDone(detailTask)
                  setDetailTask(null)
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                סמן כבוצע
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDetailTask(null)
                  setDeleteTarget(detailTask)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                מחיקה
              </Button>
            </div>
          </>
        )}
      </DetailModal>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? deleteTarget.title || 'משימה' : ''}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת משימה' : 'משימה חדשה'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormSelect
              label="בניין"
              value={form.buildingId}
              onChange={setField('buildingId')}
              options={buildingOptions}
              placeholder="בחר בניין"
              required
            />
            <FormField
              label="כותרת"
              value={form.title}
              onChange={setField('title')}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="תדירות"
                value={form.frequency}
                onChange={setField('frequency')}
                options={FREQUENCY_OPTIONS}
              />
              <FormField
                label="תאריך ביצוע הבא"
                type="date"
                value={form.next_due_date}
                onChange={setField('next_due_date')}
                required
              />
            </div>
            <FormBool
              label="נדרש בחוק"
              value={form.is_required_by_law}
              onChange={setField('is_required_by_law')}
            />
            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setField('notes')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'הוסף משימה'}</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RecurringTasks
