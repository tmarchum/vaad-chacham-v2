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
import { Plus, Pencil, Trash2, Wrench, AlertTriangle, CheckCircle, Clock, Cog, ShieldOff, CalendarClock } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: 'מעלית', label: 'מעלית' },
  { value: 'אינסטלציה', label: 'אינסטלציה' },
  { value: 'חשמל', label: 'חשמל' },
  { value: 'בטיחות', label: 'בטיחות' },
  { value: 'מיזוג', label: 'מיזוג אוויר' },
  { value: 'גנרטור', label: 'גנרטור' },
  { value: 'אחר', label: 'אחר' },
]

const CATEGORY_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'מעלית', label: 'מעלית' },
  { key: 'אינסטלציה', label: 'אינסטלציה' },
  { key: 'חשמל', label: 'חשמל' },
  { key: 'בטיחות', label: 'בטיחות' },
  { key: 'מיזוג', label: 'מיזוג' },
  { key: 'גנרטור', label: 'גנרטור' },
  { key: 'אחר', label: 'אחר' },
]

const EMPTY_FORM = {
  buildingId: '',
  name: '',
  category: '',
  manufacturer: '',
  model: '',
  installDate: '',
  warrantyEnd: '',
  lastService: '',
  nextService: '',
  status: 'active',
  notes: '',
}

function getServiceStatus(nextService) {
  if (!nextService) return { label: 'לא הוגדר', variant: 'default', key: 'unknown' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next = new Date(nextService)
  const diff = Math.floor((next - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { label: 'באיחור', variant: 'danger', key: 'overdue' }
  if (diff <= 30) return { label: `בעוד ${diff} ימים`, variant: 'warning', key: 'soon' }
  return { label: 'תקין', variant: 'success', key: 'ok' }
}

function BuildingAssets() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allAssets, create, update, remove, isSaving, isLoading } = useCollection('buildingAssets', scope)

  const [search, setSearch] = useState('')
  // Data is already scoped to the sidebar's building.
  const buildingFilter = 'all'
  const [categoryFilter, setCategoryFilter] = useState('all')
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

  // Assets scoped to building filter for summary cards
  const scopedAssets = useMemo(() => {
    if (buildingFilter !== 'all') return allAssets.filter((a) => a.buildingId === buildingFilter)
    return allAssets
  }, [allAssets, buildingFilter])

  // Summary stats
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30 = new Date(today)
    in30.setDate(in30.getDate() + 30)

    let soon = 0
    let warrantyExpired = 0
    let overdueService = 0

    scopedAssets.forEach((a) => {
      if (a.nextService) {
        const next = new Date(a.nextService)
        const diff = Math.floor((next - today) / (1000 * 60 * 60 * 24))
        if (diff < 0) overdueService++
        else if (diff <= 30) soon++
      }
      if (a.warrantyEnd && new Date(a.warrantyEnd) < today) {
        warrantyExpired++
      }
    })

    return { total: scopedAssets.length, soon, warrantyExpired, overdueService }
  }, [scopedAssets])

  const filtered = useMemo(() => {
    let result = allAssets

    if (buildingFilter !== 'all') {
      result = result.filter((a) => a.buildingId === buildingFilter)
    }

    if (categoryFilter !== 'all') {
      result = result.filter((a) => a.category === categoryFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q) ||
          a.manufacturer?.toLowerCase().includes(q) ||
          a.model?.toLowerCase().includes(q)
      )
    }

    return result
  }, [allAssets, buildingFilter, categoryFilter, search])

  // Upcoming services within 90 days, sorted ascending
  // Uses scopedAssets so the building filter pill is respected
  const upcomingServices = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in90 = new Date(today)
    in90.setDate(in90.getDate() + 90)

    return scopedAssets
      .filter((a) => {
        if (!a.nextService) return false
        const next = new Date(a.nextService)
        return next >= today && next <= in90
      })
      .sort((a, b) => new Date(a.nextService) - new Date(b.nextService))
  }, [scopedAssets])

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
      name: item.name || '',
      category: item.category || '',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      installDate: item.installDate ? item.installDate.slice(0, 10) : '',
      warrantyEnd: item.warrantyEnd ? item.warrantyEnd.slice(0, 10) : '',
      lastService: item.lastService ? item.lastService.slice(0, 10) : '',
      nextService: item.nextService ? item.nextService.slice(0, 10) : '',
      status: item.status || 'active',
      notes: item.notes || '',
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

  const handleServiceDone = async (item) => {
    const today = new Date().toISOString().slice(0, 10)
    // Calculate interval from last service to next service
    let nextServiceDate = today
    if (item.lastService && item.nextService) {
      const last = new Date(item.lastService)
      const next = new Date(item.nextService)
      const intervalDays = Math.round((next - last) / (1000 * 60 * 60 * 24))
      const newNext = new Date()
      newNext.setDate(newNext.getDate() + intervalDays)
      nextServiceDate = newNext.toISOString().slice(0, 10)
    }
    const history = Array.isArray(item.service_history) ? [...item.service_history] : []
    history.push({
      serviced_at: new Date().toISOString(),
      previous_service: item.lastService || item.last_service,
      notes: '',
    })
    await update(item.id, {
      lastService: today,
      nextService: nextServiceDate,
      service_history: history,
    })
  }

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ציוד ומערכות בניין</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  // ── Civic Blue view model ──
  const todayMid = new Date()
  todayMid.setHours(0, 0, 0, 0)
  const isWarrantyExpired = (a) => !!a.warrantyEnd && new Date(a.warrantyEnd) < todayMid
  const catCounts = scopedAssets.reduce((m, a) => { const k = a.category || 'אחר'; m[k] = (m[k] || 0) + 1; return m }, {})
  const catEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1])
  const healthyPct = stats.total ? Math.round(((stats.total - stats.overdueService) / stats.total) * 100) : 0
  const statusChip = (item) => {
    const st = getServiceStatus(item.nextService)
    const cls = {
      ok: 'bg-[var(--success-light)] text-[var(--success)]',
      soon: 'bg-[var(--warning-light)] text-[var(--warning)]',
      overdue: 'bg-[var(--danger-light)] text-[var(--danger)]',
      unknown: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
    }[st.key]
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap num-tabular ${cls}`}>{st.label}</span>
  }
  const warrantyChip = (item) => {
    if (!item.warrantyEnd) return <span className="text-[11px] text-[var(--text-muted)]">—</span>
    return isWarrantyExpired(item)
      ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--danger-light)] text-[var(--danger)]">פגה</span>
      : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--success-light)] text-[var(--success)]">עד {formatDate(item.warrantyEnd)}</span>
  }
  const rowActions = (item) => (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => handleServiceDone(item)} title="סמן כמתוחזק" className="p-1.5 rounded-[var(--radius)] text-[var(--success)] hover:bg-[var(--success-light)]"><CheckCircle className="h-3.5 w-3.5" /></button>
      <button onClick={() => openEdit(item)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => setDeleteTarget(item)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
  const filterActive = search || categoryFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ציוד ומערכות בניין</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            מרשם נכסים — מעליות, משאבות, מערכות חשמל ובטיחות, אחריות וטיפולים{selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />הוסף ציוד</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="סה״כ ציוד רשום" icon={Cog} color="blue"
          value={String(stats.total)}
          sub={catEntries.length ? `${catEntries.length} קטגוריות` : 'לא נרשם ציוד'}
          progress={stats.total ? healthyPct : undefined} />
        <StatCard label="טיפול תוך 30 יום" icon={Clock} color={stats.soon ? 'amber' : 'slate'}
          value={String(stats.soon)}
          sub={stats.soon ? 'כדאי לתאם טכנאי' : 'אין טיפולים קרובים'} />
        <StatCard label="טיפול באיחור" icon={AlertTriangle} color={stats.overdueService ? 'red' : 'emerald'}
          value={String(stats.overdueService)}
          sub={stats.overdueService ? 'עבר מועד הטיפול המתוכנן' : 'כל הציוד מטופל בזמן ✓'} />
        <StatCard label="אחריות פגה" icon={ShieldOff} color={stats.warrantyExpired ? 'amber' : 'emerald'}
          value={String(stats.warrantyExpired)}
          sub={stats.warrantyExpired ? 'תיקונים יחויבו במלואם' : 'אין פריטים שאחריותם פגה'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Register */}
        <div className="xl:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם, קטגוריה, יצרן או דגם..." />
            <TabGroup
              tabs={CATEGORY_FILTERS.map((cf) => ({ ...cf, count: cf.key === 'all' ? scopedAssets.length : (catCounts[cf.key] || 0) }))}
              activeTab={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={Wrench}
                title="אין ציוד"
                description={filterActive ? 'לא נמצאו תוצאות לסינון' : 'לא נוסף ציוד עדיין'}
                actionLabel={!filterActive ? 'הוסף ציוד' : undefined}
                onAction={!filterActive ? openCreate : undefined}
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
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Cog className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{item.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {[item.category, item.manufacturer, item.model].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                      </div>
                      {statusChip(item)}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
                      <div className="text-[11px] text-[var(--text-muted)]">
                        טיפול הבא: <span className="font-semibold text-[var(--text-primary)] num-tabular">{item.nextService ? formatDate(item.nextService) : '—'}</span>
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
                      <tr><th>ציוד</th><th>קטגוריה</th><th>יצרן / דגם</th><th>טיפול אחרון</th><th>טיפול הבא</th><th>אחריות</th><th>סטטוס</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((item) => {
                        const st = getServiceStatus(item.nextService)
                        return (
                          <tr key={item.id} onClick={() => setDetailItem(item)} className={`cursor-pointer ${st.key === 'overdue' ? '!bg-[var(--danger-light)]/40' : ''}`}>
                            <td className="min-w-[160px]">
                              <span className="text-[13px] font-semibold">{item.name || '—'}</span>
                              {item.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{item.notes}</span>}
                            </td>
                            <td className="whitespace-nowrap">
                              {item.category
                                ? <span className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold">{item.category}</span>
                                : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="whitespace-nowrap text-[12px]">{[item.manufacturer, item.model].filter(Boolean).join(' · ') || <span className="text-[var(--text-muted)]">—</span>}</td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">{item.lastService ? formatDate(item.lastService) : <span className="text-[var(--text-muted)]">—</span>}</td>
                            <td className={`whitespace-nowrap text-[12px] font-semibold num-tabular ${st.key === 'overdue' ? 'text-[var(--danger)]' : st.key === 'soon' ? 'text-[var(--warning)]' : ''}`}>{item.nextService ? formatDate(item.nextService) : '—'}</td>
                            <td className="whitespace-nowrap">{warrantyChip(item)}</td>
                            <td className="whitespace-nowrap">{statusChip(item)}</td>
                            <td className="whitespace-nowrap">{rowActions(item)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>מציג {filtered.length} מתוך {scopedAssets.length} פריטים</span>
                  <span>מטופלים בזמן: <strong className="text-[var(--primary)] num-tabular">{healthyPct}%</strong></span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <aside className="xl:col-span-4 space-y-4 xl:sticky xl:top-20">
          <SectionCard icon={CalendarClock} title="לוח תחזוקה קרובה" subtitle="טיפולים ב-90 הימים הקרובים" bodyClassName="p-2">
            {upcomingServices.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-6">אין טיפולים מתוכננים ב-90 הימים הקרובים</p>
            ) : (
              <ul className="divide-y divide-[var(--border-light)]">
                {upcomingServices.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => setDetailItem(item)} className="w-full flex items-center justify-between gap-3 px-2 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-right">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Wrench className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{item.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] num-tabular">{item.category ? `${item.category} • ` : ''}{formatDate(item.nextService)}</p>
                        </div>
                      </div>
                      {statusChip(item)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={Cog} title="פילוח לפי קטגוריה" subtitle={`${stats.total} פריטים`} bodyClassName="p-4 space-y-3">
            {catEntries.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)]">אין נתונים</p>
            ) : catEntries.map(([cat, n]) => {
              const pct = stats.total ? Math.round((n / stats.total) * 100) : 0
              return (
                <button key={cat} onClick={() => setCategoryFilter(CATEGORY_FILTERS.some((c) => c.key === cat) ? cat : 'all')} className="block w-full text-right">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-medium text-[var(--text-primary)]">{cat}</span>
                    <span className="shrink-0 num-tabular"><strong>{n}</strong> <span className="text-[var(--text-muted)]">({pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
          </SectionCard>
        </aside>
      </div>


      {/* Detail Modal */}
      <DetailModal
        open={!!detailItem}
        onOpenChange={() => setDetailItem(null)}
        title={detailItem ? detailItem.name : ''}
        onEdit={() => openEdit(detailItem)}
      >
        {detailItem && (
          <>
            <DetailRow label="בניין" value={buildingMap[detailItem.buildingId]?.name} />
            <DetailRow label="קטגוריה" value={detailItem.category} />
            <DetailRow label="יצרן" value={detailItem.manufacturer} />
            <DetailRow label="דגם" value={detailItem.model} />
            <DetailRow label="תאריך התקנה" value={detailItem.installDate ? formatDate(detailItem.installDate) : null} />
            <DetailRow label="סיום אחריות" value={detailItem.warrantyEnd ? formatDate(detailItem.warrantyEnd) : null} />
            <DetailRow label="טיפול אחרון" value={detailItem.lastService ? formatDate(detailItem.lastService) : null} />
            <DetailRow label="טיפול הבא" value={detailItem.nextService ? formatDate(detailItem.nextService) : null} />
            <DetailRow
              label="סטטוס טיפול"
              value={
                <Badge variant={getServiceStatus(detailItem.nextService).variant}>
                  {getServiceStatus(detailItem.nextService).label}
                </Badge>
              }
            />
            <DetailRow label="הערות" value={detailItem.notes} />
            {detailItem.service_history?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-1">היסטוריית טיפולים:</p>
                <div className="space-y-1">
                  {[...detailItem.service_history].reverse().slice(0, 5).map((h, i) => (
                    <div key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                      <span className="text-[var(--text-muted)]">{new Date(h.serviced_at).toLocaleDateString('he-IL')}</span>
                      <span>טיפול בוצע</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
        itemName={deleteTarget ? deleteTarget.name || 'ציוד' : ''}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת ציוד' : 'הוספת ציוד'}</DialogTitle>
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
              label="שם"
              value={form.name}
              onChange={setField('name')}
              required
            />
            <FormSelect
              label="קטגוריה"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
              placeholder="בחר קטגוריה"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="יצרן"
                value={form.manufacturer}
                onChange={setField('manufacturer')}
              />
              <FormField
                label="דגם"
                value={form.model}
                onChange={setField('model')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="תאריך התקנה"
                type="date"
                value={form.installDate}
                onChange={setField('installDate')}
              />
              <FormField
                label="סיום אחריות"
                type="date"
                value={form.warrantyEnd}
                onChange={setField('warrantyEnd')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="טיפול אחרון"
                type="date"
                value={form.lastService}
                onChange={setField('lastService')}
              />
              <FormField
                label="טיפול הבא"
                type="date"
                value={form.nextService}
                onChange={setField('nextService')}
              />
            </div>
            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setField('notes')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'הוסף ציוד'}</Button>
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

export default BuildingAssets
