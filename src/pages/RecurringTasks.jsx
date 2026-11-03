import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { TabGroup } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, RefreshCw, CheckCircle2, Scale, CalendarClock, AlertTriangle, History } from 'lucide-react'
import { toast } from '@/lib/toast'

const FREQUENCY_MAP = {
  weekly: { label: 'שבועי', variant: 'default', months: 0, weeks: 1 },
  monthly: { label: 'חודשי', variant: 'default', months: 1 },
  quarterly: { label: 'רבעוני', variant: 'info', months: 3 },
  biannually: { label: 'חצי שנתי', variant: 'info', months: 6 },
  annually: { label: 'שנתי', variant: 'warning', months: 12 },
}

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'quarterly', label: 'רבעוני' },
  { value: 'biannually', label: 'חצי שנתי' },
  { value: 'annually', label: 'שנתי' },
]

const FREQUENCY_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'weekly', label: 'שבועי' },
  { key: 'monthly', label: 'חודשי' },
  { key: 'quarterly', label: 'רבעוני' },
  { key: 'biannually', label: 'חצי שנתי' },
  { key: 'annually', label: 'שנתי' },
]

const TASK_CATEGORIES = [
  { value: 'maintenance', label: 'תחזוקה' },
  { value: 'safety', label: 'בטיחות' },
  { value: 'regulatory', label: 'רגולציה' },
  { value: 'cleaning', label: 'ניקיון' },
  { value: 'financial', label: 'כספים' },
  { value: 'other', label: 'אחר' },
]

const EMPTY_FORM = {
  buildingId: '',
  title: '',
  frequency: 'monthly',
  next_due_date: '',
  is_required_by_law: false,
  notes: '',
  category: '',
  law_reference: '',
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr)
  due.setHours(0, 0, 0, 0)
  return due < today
}

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

// Due within the next 7 days (not overdue)
function isDueThisWeek(task) {
  if (!task.next_due_date) return false
  const d = daysUntil(task.next_due_date)
  return d >= 0 && d <= 7
}

function getNextDate(currentDateStr, frequency) {
  const freq = FREQUENCY_MAP[frequency]
  const date = new Date(currentDateStr)
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7)
  } else {
    date.setMonth(date.getMonth() + (freq?.months || 1))
  }
  return date.toISOString().slice(0, 10)
}

function RecurringTasks() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allTasks, create, update, remove, isSaving, isLoading } = useCollection('recurringTasks', scope)
  const issuesCollection = useCollection('issues', scope)

  const [search, setSearch] = useState('')
  // Data is already scoped to the sidebar's building.
  const buildingFilter = 'all'
  const [statusFilter, setStatusFilter] = useState('all') // all | overdue | week | law
  const [frequencyFilter, setFrequencyFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailTask, setDetailTask] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [confirmMarkDone, setConfirmMarkDone] = useState(null)

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

    if (statusFilter === 'overdue') result = result.filter((t) => isOverdue(t.next_due_date))
    else if (statusFilter === 'week') result = result.filter(isDueThisWeek)
    else if (statusFilter === 'law') result = result.filter((t) => t.is_required_by_law)

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
  }, [allTasks, buildingFilter, frequencyFilter, statusFilter, search])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      buildingId: buildingFilter !== 'all' ? buildingFilter : (selectedBuilding?.id || buildings[0]?.id || ''),
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
      category: task.category || '',
      law_reference: task.law_reference || '',
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

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const handleCreateIssue = async (task) => {
    if (!selectedBuilding) return
    await issuesCollection.create({
      title: task.title,
      description: `נוצר אוטומטית ממשימה תקופתית פגת תוקף: ${task.title}`,
      building_id: selectedBuilding.id || task.building_id,
      priority: task.is_required_by_law ? 'high' : 'medium',
      status: 'open',
      reported_at: new Date().toISOString(),
    })
    toast('תקלה נוצרה בהצלחה')
  }

  const handleMarkDone = async (task) => {
    const nextDate = getNextDate(task.next_due_date || new Date().toISOString().slice(0, 10), task.frequency)
    const history = Array.isArray(task.completion_history) ? [...task.completion_history] : []
    history.push({ completed_at: new Date().toISOString(), previous_due: task.next_due_date })
    await update(task.id, { next_due_date: nextDate, completion_history: history })
    setConfirmMarkDone(null)
    if (detailTask?.id === task.id) setDetailTask(null)
  }

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">משימות חוזרות</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  // ── Civic Blue view model ──
  const overdueTasks = allTasks.filter((t) => isOverdue(t.next_due_date))
  const weekTasks = allTasks.filter(isDueThisWeek)
  const lawTasks = allTasks.filter((t) => t.is_required_by_law)
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const completions = allTasks.flatMap((t) =>
    (Array.isArray(t.completion_history) ? t.completion_history : []).map((h) => ({ ...h, task: t }))
  ).filter((h) => h.completed_at)
  const doneThisMonth = completions.filter((h) => String(h.completed_at).startsWith(monthPrefix)).length
  const recentDone = [...completions].sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 5)
  const agenda = allTasks
    .filter((t) => isOverdue(t.next_due_date) || isDueThisWeek(t))
    .sort((a, b) => (a.next_due_date || '').localeCompare(b.next_due_date || ''))
    .slice(0, 6)
  const onTimePct = allTasks.length ? Math.round(((allTasks.length - overdueTasks.length) / allTasks.length) * 100) : 0

  const statusChip = (task) => {
    if (isOverdue(task.next_due_date)) return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--danger-light)] text-[var(--danger)]">באיחור</span>
    if (isDueThisWeek(task)) return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--warning-light)] text-[var(--warning)]">השבוע</span>
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--success-light)] text-[var(--success)]">תקין</span>
  }
  const dueLine = (task) => {
    if (!task.next_due_date) return <span className="text-[11px] text-[var(--text-muted)]">לא הוגדר</span>
    const d = daysUntil(task.next_due_date)
    return (
      <span className={`text-[11px] num-tabular ${d < 0 ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-muted)]'}`}>
        {d > 0 ? `בעוד ${d} ימים` : d < 0 ? `לפני ${Math.abs(d)} ימים` : 'היום'}
      </span>
    )
  }
  const freqChip = (task) => {
    const freq = FREQUENCY_MAP[task.frequency] || FREQUENCY_MAP.monthly
    return <span className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold whitespace-nowrap">{freq.label}</span>
  }
  const rowActions = (task) => (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {isOverdue(task.next_due_date) && (
        <button onClick={() => handleCreateIssue(task)} title="צור תקלה" className="h-7 px-2 rounded-[var(--radius)] border border-[var(--danger)]/30 text-[11px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-light)] inline-flex items-center gap-1 whitespace-nowrap">
          <Plus className="h-3 w-3" />צור תקלה
        </button>
      )}
      <button onClick={() => setConfirmMarkDone(task)} title="סמן כבוצע" className="p-1.5 rounded-[var(--radius)] text-[var(--success)] hover:bg-[var(--success-light)]"><CheckCircle2 className="h-3.5 w-3.5" /></button>
      <button onClick={() => openEdit(task)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => setDeleteTarget(task)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
  const filterActive = search || statusFilter !== 'all' || frequencyFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">משימות חוזרות</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            לוח תחזוקה מתוזמן — בדיקות, ניקיון וטיפולים תקופתיים{selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />משימה חדשה</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="לביצוע השבוע" icon={CalendarClock} color={weekTasks.length ? 'amber' : 'slate'}
          value={String(weekTasks.length)}
          sub={weekTasks.length ? 'מועד ביצוע ב-7 הימים הקרובים' : 'אין משימות לשבוע הקרוב'}
          footer={weekTasks.length ? <button onClick={() => setStatusFilter('week')} className="text-[var(--primary)] font-semibold hover:underline">להצגה ←</button> : null} />
        <StatCard label="משימות באיחור" icon={AlertTriangle} color={overdueTasks.length ? 'red' : 'emerald'}
          value={String(overdueTasks.length)}
          sub={overdueTasks.length ? 'עבר מועד הביצוע' : 'הכל בזמן ✓'}
          footer={overdueTasks.length ? <button onClick={() => setStatusFilter('overdue')} className="text-[var(--primary)] font-semibold hover:underline">לטיפול עכשיו ←</button> : null} />
        <StatCard label="בוצעו החודש" icon={CheckCircle2} color="emerald"
          value={String(doneThisMonth)}
          sub={completions.length ? `${completions.length} ביצועים מתועדים בסך הכל` : 'עדיין לא סומנו ביצועים'} />
        <StatCard label="עמידה בלוח הזמנים" icon={Scale} color="blue"
          value={allTasks.length ? `${onTimePct}%` : '—'}
          note={lawTasks.length ? `${lawTasks.length} נדרשות בחוק` : null}
          sub={`${allTasks.length} משימות פעילות`}
          progress={allTasks.length ? onTimePct : undefined} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי כותרת או הערות..." />
            <div className="flex flex-wrap items-center gap-2">
              <TabGroup
                tabs={[
                  { key: 'all', label: 'הכל', count: allTasks.length },
                  { key: 'overdue', label: 'באיחור', count: overdueTasks.length },
                  { key: 'week', label: 'השבוע', count: weekTasks.length },
                  { key: 'law', label: 'נדרש בחוק', count: lawTasks.length },
                ]}
                activeTab={statusFilter}
                onChange={setStatusFilter}
              />
              <TabGroup
                tabs={FREQUENCY_FILTERS.map((f) => ({ ...f, label: f.key === 'all' ? 'כל התדירויות' : f.label }))}
                activeTab={frequencyFilter}
                onChange={setFrequencyFilter}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={RefreshCw}
                title="אין משימות חוזרות"
                description={filterActive ? 'לא נמצאו תוצאות לסינון' : 'לא נוספו משימות חוזרות עדיין'}
                actionLabel={!filterActive ? 'הוסף משימה' : undefined}
                onAction={!filterActive ? openCreate : undefined}
              />
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((task) => (
                  <div key={task.id} onClick={() => setDetailTask(task)}
                    className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {freqChip(task)}
                          {task.is_required_by_law && <Badge variant="info"><Scale className="h-3 w-3 ml-1" />נדרש בחוק</Badge>}
                        </div>
                      </div>
                      {statusChip(task)}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
                      <div className="flex flex-col">
                        <span className="text-[12px] font-semibold num-tabular">{task.next_due_date ? formatDate(task.next_due_date) : '—'}</span>
                        {dueLine(task)}
                      </div>
                      {rowActions(task)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>משימה</th><th>קטגוריה</th><th>תדירות</th><th>ביצוע הבא</th><th>סטטוס</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((task) => {
                        const overdue = isOverdue(task.next_due_date)
                        const cat = TASK_CATEGORIES.find((c) => c.value === task.category)?.label || task.category
                        return (
                          <tr key={task.id} onClick={() => setDetailTask(task)} className={`cursor-pointer ${overdue ? '!bg-[var(--danger-light)]/40' : ''}`}>
                            <td className="min-w-[200px]">
                              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                                {task.title}
                                {task.is_required_by_law && <Scale className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" aria-label="נדרש בחוק" />}
                              </span>
                              {task.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{task.notes}</span>}
                            </td>
                            <td className="whitespace-nowrap text-[12px]">{cat || <span className="text-[var(--text-muted)]">—</span>}</td>
                            <td className="whitespace-nowrap">{freqChip(task)}</td>
                            <td className="whitespace-nowrap">
                              <span className="block text-[12px] font-semibold num-tabular">{task.next_due_date ? formatDate(task.next_due_date) : '—'}</span>
                              {dueLine(task)}
                            </td>
                            <td className="whitespace-nowrap">{statusChip(task)}</td>
                            <td className="whitespace-nowrap">{rowActions(task)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>מציג {filtered.length} מתוך {allTasks.length} משימות</span>
                  <span>באיחור: <strong className="text-[var(--danger)] num-tabular">{overdueTasks.length}</strong></span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <aside className="xl:col-span-4 space-y-4 xl:sticky xl:top-20">
          <SectionCard icon={CalendarClock} title="סדר יום תחזוקה" subtitle="באיחור ו-7 הימים הקרובים" bodyClassName="p-2">
            {agenda.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-6">אין משימות פתוחות לשבוע הקרוב ✓</p>
            ) : (
              <ul className="divide-y divide-[var(--border-light)]">
                {agenda.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                    <button onClick={() => setDetailTask(task)} className="flex items-center gap-2.5 min-w-0 text-right">
                      <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><RefreshCw className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[var(--text-primary)] truncate">{task.title}</span>
                        {dueLine(task)}
                      </span>
                    </button>
                    <button onClick={() => setConfirmMarkDone(task)} title="סמן כבוצע" className="p-1.5 rounded-[var(--radius)] text-[var(--success)] hover:bg-[var(--success-light)] shrink-0"><CheckCircle2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={History} title="ביצועים אחרונים" subtitle="מתוך היסטוריית המשימות" bodyClassName="p-4">
            {recentDone.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)]">עדיין לא סומנו ביצועים</p>
            ) : (
              <ul className="space-y-2.5">
                {recentDone.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--success)] shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--text-primary)] truncate">{h.task.title}</span>
                      <span className="text-[11px] text-[var(--text-muted)] num-tabular">בוצע {formatDate(h.completed_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>


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
            {detailTask.category && (
              <DetailRow label="קטגוריה" value={TASK_CATEGORIES.find(c => c.value === detailTask.category)?.label || detailTask.category} />
            )}
            {detailTask.law_reference && (
              <DetailRow label="הפניה לחוק" value={detailTask.law_reference} />
            )}
            {Array.isArray(detailTask.completion_history) && detailTask.completion_history.length > 0 && (
              <div className="pt-3">
                <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">היסטוריית ביצועים אחרונה</p>
                <div className="space-y-1">
                  {[...detailTask.completion_history].reverse().slice(0, 3).map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
                      <span>בוצע: {formatDate(entry.completed_at)}</span>
                      {entry.previous_due && <span className="text-[var(--text-muted)]">(מועד מקורי: {formatDate(entry.previous_due)})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailTask)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmMarkDone(detailTask)}
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

      {/* Mark Done Confirm Dialog */}
      <Dialog open={!!confirmMarkDone} onOpenChange={() => setConfirmMarkDone(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>סמן כבוצע</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-[var(--text-secondary)]">
            {confirmMarkDone && (
              <p>האם לסמן את המשימה <strong>{confirmMarkDone.title}</strong> כבוצעת? תאריך הביצוע הבא יעודכן אוטומטית.</p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={() => handleMarkDone(confirmMarkDone)} disabled={isSaving}>
              <CheckCircle2 className="h-4 w-4" />
              {isSaving ? 'שומר...' : 'כן, בוצע'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmMarkDone(null)}>ביטול</Button>
          </div>
        </DialogContent>
      </Dialog>

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
            <FormSelect
              label="קטגוריה"
              value={form.category}
              onChange={setField('category')}
              options={TASK_CATEGORIES}
              placeholder="בחר קטגוריה"
            />
            <FormField
              label="הפניה לחוק (אופציונלי)"
              value={form.law_reference}
              onChange={setField('law_reference')}
              placeholder="לדוגמה: תקנות הבטיחות..."
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
