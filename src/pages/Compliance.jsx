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
import { PageHeader } from '@/components/common/PageHeader'
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'

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

const STATUS_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'valid', label: 'בתוקף' },
  { key: 'expired', label: 'פג תוקף' },
  { key: 'pending', label: 'ממתין' },
]

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

function Compliance() {
  const { buildings } = useBuildingContext()
  const { data: allCompliance, create, update, remove, isSaving } = useCollection('compliance')

  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
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

    if (statusFilter !== 'all') {
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
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
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

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        iconColor="emerald"
        title="תקינה ורגולציה"
        subtitle={`${filtered.length} רישומים`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            רישום חדש
          </Button>
        }
      />

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי כותרת, סוג או מספר מסמך..."
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

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-[var(--text-secondary)] self-center ml-2">סטטוס:</span>
        {STATUS_FILTERS.map((sf) => (
          <Button
            key={sf.key}
            variant={statusFilter === sf.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(sf.key)}
          >
            {sf.label}
          </Button>
        ))}
      </div>

      {/* Compliance cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="אין רישומי תקינה"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא נוספו רישומי תקינה עדיין'}
          actionLabel={!search ? 'הוסף רישום' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const status = getComplianceStatus(item.expiry_date)
            return (
              <Card
                key={item.id}
                className="cursor-pointer"
                onClick={() => setDetailItem(item)}
              >
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                      {item.title}
                    </h3>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {item.type && (
                    <Badge variant="default" className="mb-2">{item.type}</Badge>
                  )}

                  <div className="text-xs text-[var(--text-secondary)] space-y-1 mt-2">
                    <p>בניין: {buildingMap[item.buildingId]?.name || ''}</p>
                    {item.expiry_date && <p>תוקף: {formatDate(item.expiry_date)}</p>}
                    {item.document_number && <p>מספר מסמך: {item.document_number}</p>}
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
