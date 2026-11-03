import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { TabGroup } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, ShieldCheck, Clock, AlertTriangle, CheckCircle2, CalendarClock, ListChecks } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'ביטוח', label: 'ביטוח' },
  { value: 'רישיון', label: 'רישיון' },
  { value: 'בדיקת חשמל', label: 'בדיקת חשמל' },
  { value: 'בדיקת מעלית', label: 'בדיקת מעלית' },
  { value: 'בדיקת גז', label: 'בדיקת גז' },
  { value: 'כיבוי אש', label: 'כיבוי אש' },
  { value: 'נגישות', label: 'נגישות' },
  { value: 'אחר', label: 'אחר' },
]

// "Expiring soon" window for the KPI / tab
const EXPIRING_DAYS = 30

const EMPTY_FORM = {
  buildingId: '',
  title: '',
  type: '',
  issue_date: '',
  expiry_date: '',
  notes: '',
  document_number: '',
}

function getComplianceStatus(expiryDate) {
  if (!expiryDate) return { label: 'ממתין', variant: 'warning', key: 'pending' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  if (expiry < today) return { label: 'פג תוקף', variant: 'danger', key: 'expired' }
  return { label: 'בתוקף', variant: 'success', key: 'valid' }
}

function daysUntil(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

function isExpiringSoon(item) {
  if (!item.expiry_date) return false
  const d = daysUntil(item.expiry_date)
  return d >= 0 && d <= EXPIRING_DAYS
}

function Compliance() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allCompliance, create, update, remove, isSaving, isLoading } = useCollection('compliance', scope)

  const [search, setSearch] = useState('')
  // Data is already scoped to the sidebar's building.
  const buildingFilter = 'all'
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailItem, setDetailItem] = useState(null)
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
    let result = allCompliance

    if (buildingFilter !== 'all') {
      result = result.filter((c) => c.buildingId === buildingFilter)
    }

    if (statusFilter === 'expiring') {
      result = result.filter(isExpiringSoon)
    } else if (statusFilter !== 'all') {
      result = result.filter((c) => getComplianceStatus(c.expiry_date).key === statusFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.type?.toLowerCase().includes(q) ||
          c.document_number?.toLowerCase().includes(q)
      )
    }

    return result
  }, [allCompliance, buildingFilter, statusFilter, search])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      buildingId: buildingFilter !== 'all' ? buildingFilter : (selectedBuilding?.id || buildings[0]?.id || ''),
    })
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      buildingId: item.buildingId || '',
      title: item.title || '',
      type: item.type || '',
      issue_date: item.issue_date ? item.issue_date.slice(0, 10) : '',
      expiry_date: item.expiry_date ? item.expiry_date.slice(0, 10) : '',
      notes: item.notes || '',
      document_number: item.document_number || '',
    })
    setFormOpen(true)
    setDetailItem(null)
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

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תקינה ורגולציה</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  // ── Civic Blue view model ──
  const counts = { valid: 0, expiring: 0, expired: 0, pending: 0 }
  allCompliance.forEach((c) => {
    counts[getComplianceStatus(c.expiry_date).key] += 1
    if (isExpiringSoon(c)) counts.expiring += 1
  })
  const total = allCompliance.length
  const compliancePct = total ? Math.round((counts.valid / total) * 100) : 0
  const upcoming = allCompliance
    .filter((c) => c.expiry_date)
    .map((c) => ({ ...c, _days: daysUntil(c.expiry_date) }))
    .sort((a, b) => a._days - b._days)
    .slice(0, 6)
  const byType = Object.entries(allCompliance.reduce((m, c) => {
    const k = c.type || 'לא מסווג'
    m[k] = m[k] || { total: 0, bad: 0 }
    m[k].total += 1
    if (getComplianceStatus(c.expiry_date).key === 'expired') m[k].bad += 1
    return m
  }, {})).sort((a, b) => b[1].total - a[1].total)

  const renderStatus = (item) => {
    const st = getComplianceStatus(item.expiry_date)
    const soon = isExpiringSoon(item)
    const cls = st.key === 'expired'
      ? 'bg-[var(--danger-light)] text-[var(--danger)]'
      : st.key === 'pending' || soon
        ? 'bg-[var(--warning-light)] text-[var(--warning)]'
        : 'bg-[var(--success-light)] text-[var(--success)]'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>
        {soon ? 'פג בקרוב' : st.label}
      </span>
    )
  }
  const renderCountdown = (item) => {
    if (!item.expiry_date) return <span className="text-[11px] text-[var(--text-muted)]">לא הוגדר תוקף</span>
    const d = daysUntil(item.expiry_date)
    return (
      <span className={`text-[11px] num-tabular ${d < 0 ? 'text-[var(--danger)] font-semibold' : d <= EXPIRING_DAYS ? 'text-[var(--warning)] font-semibold' : 'text-[var(--text-muted)]'}`}>
        {d > 0 ? `בעוד ${d} ימים` : d === 0 ? 'היום' : `לפני ${Math.abs(d)} ימים`}
      </span>
    )
  }
  const rowActions = (item) => (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => openEdit(item)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => setDeleteTarget(item)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תקינה ורגולציה</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            בדיקות תקופתיות, אישורים ורישיונות עם תאריכי תוקף{selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />רישום חדש</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="אישורים בתוקף" icon={ShieldCheck} color="emerald"
          value={String(counts.valid)} note={`מתוך ${total}`}
          sub={counts.pending ? `${counts.pending} ממתינים להגדרת תוקף` : 'כל הרישומים עם תאריך תוקף'} />
        <StatCard label={`פגים ב-${EXPIRING_DAYS} הימים הקרובים`} icon={Clock} color={counts.expiring ? 'amber' : 'slate'}
          value={String(counts.expiring)}
          sub={counts.expiring ? 'כדאי לתאם חידוש כבר עכשיו' : 'אין חידושים דחופים'}
          footer={counts.expiring ? <button onClick={() => setStatusFilter('expiring')} className="text-[var(--primary)] font-semibold hover:underline">להצגת הרשימה ←</button> : null} />
        <StatCard label="פג תוקף" icon={AlertTriangle} color={counts.expired ? 'red' : 'emerald'}
          value={String(counts.expired)}
          sub={counts.expired ? 'דורש טיפול מיידי' : 'אין אישורים שפג תוקפם ✓'}
          footer={counts.expired ? <button onClick={() => setStatusFilter('expired')} className="text-[var(--primary)] font-semibold hover:underline">לטיפול עכשיו ←</button> : null} />
        <StatCard label="אחוז עמידה בתקינה" icon={CheckCircle2} color="blue"
          value={total ? `${compliancePct}%` : '—'}
          sub={total ? `${counts.valid} מתוך ${total} רישומים בתוקף` : 'לא נוספו רישומים'}
          progress={total ? compliancePct : undefined} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי כותרת, סוג או מספר מסמך..." />
            <TabGroup
              tabs={[
                { key: 'all', label: 'הכל', count: total },
                { key: 'valid', label: 'בתוקף', count: counts.valid },
                { key: 'expiring', label: 'פג בקרוב', count: counts.expiring },
                { key: 'expired', label: 'פג תוקף', count: counts.expired },
                { key: 'pending', label: 'ממתין', count: counts.pending },
              ]}
              activeTab={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={ShieldCheck}
                title="אין רישומי תקינה"
                description={search || statusFilter !== 'all' ? 'לא נמצאו תוצאות לסינון' : 'לא נוספו רישומי תקינה עדיין'}
                actionLabel={!search && statusFilter === 'all' ? 'הוסף רישום' : undefined}
                onAction={!search && statusFilter === 'all' ? openCreate : undefined}
              />
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((item) => (
                  <div key={item.id} onClick={() => setDetailItem(item)}
                    className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {item.type || 'ללא סוג'}{item.document_number ? ` • מסמך ${item.document_number}` : ''}
                        </p>
                      </div>
                      {renderStatus(item)}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-light)]">
                      <div className="flex flex-col">
                        <span className="text-[12px] font-semibold num-tabular">{item.expiry_date ? formatDate(item.expiry_date) : '—'}</span>
                        {renderCountdown(item)}
                      </div>
                      {rowActions(item)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>רישום</th><th>סוג</th><th>מספר מסמך</th><th>הונפק</th><th>בתוקף עד</th><th>סטטוס</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((item) => {
                        const st = getComplianceStatus(item.expiry_date)
                        return (
                          <tr key={item.id} onClick={() => setDetailItem(item)} className={`cursor-pointer ${st.key === 'expired' ? '!bg-[var(--danger-light)]/40' : ''}`}>
                            <td className="min-w-[180px]">
                              <span className="text-[13px] font-semibold">{item.title || '—'}</span>
                              {item.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{item.notes}</span>}
                            </td>
                            <td className="whitespace-nowrap">
                              {item.type
                                ? <span className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold">{item.type}</span>
                                : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">{item.document_number || <span className="text-[var(--text-muted)]">—</span>}</td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">{item.issue_date ? formatDate(item.issue_date) : '—'}</td>
                            <td className="whitespace-nowrap">
                              <span className="block text-[12px] font-semibold num-tabular">{item.expiry_date ? formatDate(item.expiry_date) : '—'}</span>
                              {renderCountdown(item)}
                            </td>
                            <td className="whitespace-nowrap">{renderStatus(item)}</td>
                            <td className="whitespace-nowrap">{rowActions(item)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>מציג {filtered.length} מתוך {total} רישומים</span>
                  <span>עמידה בתקינה: <strong className="text-[var(--primary)] num-tabular">{compliancePct}%</strong></span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <aside className="xl:col-span-4 space-y-4 xl:sticky xl:top-20">
          <SectionCard icon={CalendarClock} title="חידושים קרובים" subtitle="לפי תאריך תוקף" bodyClassName="p-2">
            {upcoming.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-6">אין רישומים עם תאריך תוקף</p>
            ) : (
              <ul className="divide-y divide-[var(--border-light)]">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => setDetailItem(item)} className="w-full flex items-center justify-between gap-3 px-2 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-right">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><ShieldCheck className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] num-tabular">{formatDate(item.expiry_date)}</p>
                        </div>
                      </div>
                      {renderCountdown(item)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={ListChecks} title="פילוח לפי סוג" subtitle={`${byType.length} סוגי בדיקות`} bodyClassName="p-4 space-y-3">
            {byType.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)]">אין נתונים</p>
            ) : byType.map(([type, v]) => {
              const okPct = v.total ? Math.round(((v.total - v.bad) / v.total) * 100) : 0
              return (
                <div key={type}>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-medium text-[var(--text-primary)]">{type}</span>
                    <span className="shrink-0 num-tabular text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">{v.total}</strong>
                      {v.bad > 0 && <span className="text-[var(--danger)]"> • {v.bad} פג</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                    <div className={`h-full rounded-full ${v.bad ? 'bg-[var(--warning)]' : 'bg-[var(--success)]'}`} style={{ width: `${okPct}%` }} />
                  </div>
                </div>
              )
            })}
          </SectionCard>
        </aside>
      </div>


      {/* Detail Modal */}
      <DetailModal
        open={!!detailItem}
        onOpenChange={() => setDetailItem(null)}
        title={detailItem ? detailItem.title : ''}
        onEdit={() => openEdit(detailItem)}
      >
        {detailItem && (
          <>
            <DetailRow label="בניין" value={buildingMap[detailItem.buildingId]?.name} />
            <DetailRow label="סוג" value={detailItem.type} />
            <DetailRow label="מספר מסמך" value={detailItem.document_number} />
            <DetailRow label="תאריך הנפקה" value={detailItem.issue_date ? formatDate(detailItem.issue_date) : null} />
            <DetailRow label="תאריך תוקף" value={detailItem.expiry_date ? formatDate(detailItem.expiry_date) : null} />
            <DetailRow
              label="סטטוס"
              value={
                <Badge variant={getComplianceStatus(detailItem.expiry_date).variant}>
                  {getComplianceStatus(detailItem.expiry_date).label}
                </Badge>
              }
            />
            <DetailRow label="הערות" value={detailItem.notes} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailItem)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDetailItem(null)
                  setDeleteTarget(detailItem)
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
        itemName={deleteTarget ? deleteTarget.title || 'רישום' : ''}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת רישום' : 'רישום חדש'}</DialogTitle>
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
            <FormSelect
              label="סוג"
              value={form.type}
              onChange={setField('type')}
              options={TYPE_OPTIONS}
              placeholder="בחר סוג"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="תאריך הנפקה"
                type="date"
                value={form.issue_date}
                onChange={setField('issue_date')}
              />
              <FormField
                label="תאריך תוקף"
                type="date"
                value={form.expiry_date}
                onChange={setField('expiry_date')}
              />
            </div>
            <FormField
              label="מספר מסמך"
              value={form.document_number}
              onChange={setField('document_number')}
            />
            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setField('notes')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'הוסף רישום'}</Button>
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

export default Compliance
