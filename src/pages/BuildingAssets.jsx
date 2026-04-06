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
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Wrench, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

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
  const { data: allAssets, create, update, remove, isSaving } = useCollection('buildingAssets')

  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
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
  const upcomingServices = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in90 = new Date(today)
    in90.setDate(in90.getDate() + 90)

    return allAssets
      .filter((a) => {
        if (!a.nextService) return false
        const next = new Date(a.nextService)
        return next >= today && next <= in90
      })
      .sort((a, b) => new Date(a.nextService) - new Date(b.nextService))
  }, [allAssets])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
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

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const handleServiceDone = (item) => {
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
    update(item.id, { lastService: today, nextService: nextServiceDate })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ציוד ומערכות בניין</h1>
          <p className="text-sm text-[var(--text-secondary)]">{filtered.length} פריטים</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          הוסף ציוד
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-[var(--primary-bg)] p-2">
                <Wrench className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                <p className="text-xs text-[var(--text-secondary)]">סה"כ ציוד</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-50 p-2">
                <Clock className="h-5 w-5 text-[var(--warning)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.soon}</p>
                <p className="text-xs text-[var(--text-secondary)]">טיפול תוך 30 יום</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 p-2">
                <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.warrantyExpired}</p>
                <p className="text-xs text-[var(--text-secondary)]">אחריות פגה</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-50 p-2">
                <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.overdueService}</p>
                <p className="text-xs text-[var(--text-secondary)]">טיפול באיחור</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי שם, קטגוריה, יצרן או דגם..."
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

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-[var(--text-secondary)] self-center ml-2">קטגוריה:</span>
        {CATEGORY_FILTERS.map((cf) => (
          <Button
            key={cf.key}
            variant={categoryFilter === cf.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(cf.key)}
          >
            {cf.label}
          </Button>
        ))}
      </div>

      {/* Asset cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="אין ציוד"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא נוסף ציוד עדיין'}
          actionLabel={!search ? 'הוסף ציוד' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const serviceStatus = getServiceStatus(item.nextService)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const warrantyExpired = item.warrantyEnd && new Date(item.warrantyEnd) < today
            return (
              <Card
                key={item.id}
                className="cursor-pointer"
                onClick={() => setDetailItem(item)}
              >
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                      {item.name}
                    </h3>
                    {item.category && (
                      <Badge variant="default">{item.category}</Badge>
                    )}
                  </div>

                  {(item.manufacturer || item.model) && (
                    <p className="text-xs text-[var(--text-secondary)] mb-2">
                      {[item.manufacturer, item.model].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  <div className="text-xs text-[var(--text-secondary)] space-y-1 mt-2">
                    {item.installDate && (
                      <p>הותקן: {formatDate(item.installDate)}</p>
                    )}
                    {item.warrantyEnd && (
                      <div>
                        {warrantyExpired ? (
                          <Badge variant="danger">אחריות פגה</Badge>
                        ) : (
                          <Badge variant="success">אחריות בתוקף</Badge>
                        )}
                      </div>
                    )}
                    {item.lastService && (
                      <p>טיפול אחרון: {formatDate(item.lastService)}</p>
                    )}
                    {item.nextService && (
                      <p>טיפול הבא: {formatDate(item.nextService)}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <Badge variant={serviceStatus.variant}>{serviceStatus.label}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleServiceDone(item)
                      }}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      סמן כמתוחזק
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

      {/* Upcoming Services Timeline */}
      {upcomingServices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">לוח תחזוקה קרובה</h2>
          <Card>
            <CardContent className="pt-5">
              <div className="space-y-2">
                {upcomingServices.map((item) => {
                  const serviceStatus = getServiceStatus(item.nextService)
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0"
                    >
                      {item.category && (
                        <Badge variant="default" className="shrink-0">{item.category}</Badge>
                      )}
                      <span className="flex-1 text-sm text-[var(--text-primary)] font-medium truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] shrink-0">
                        {formatDate(item.nextService)}
                      </span>
                      <Badge variant={serviceStatus.variant} className="shrink-0">
                        {serviceStatus.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default BuildingAssets
