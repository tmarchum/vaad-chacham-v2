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
import { formatCurrency, formatDate } from '@/lib/utils'
import { Receipt, Plus, Pencil, Trash2 } from 'lucide-react'

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' },
  { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },
  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },
  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' },
  { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' },
  { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' },
  { value: '12', label: 'דצמבר' },
]

const CATEGORIES = [
  { value: 'תחזוקה', label: 'תחזוקה' },
  { value: 'חשמל', label: 'חשמל' },
  { value: 'מים', label: 'מים' },
  { value: 'ניקיון', label: 'ניקיון' },
  { value: 'ביטוח', label: 'ביטוח' },
  { value: 'משפטי', label: 'משפטי' },
  { value: 'אחר', label: 'אחר' },
]

const CATEGORY_VARIANTS = {
  'תחזוקה': 'default',
  'חשמל': 'warning',
  'מים': 'info',
  'ניקיון': 'success',
  'ביטוח': 'danger',
  'משפטי': 'default',
  'אחר': 'default',
}

const EMPTY_FORM = {
  date: '',
  description: '',
  category: '',
  amount: '',
  vendor: '',
  buildingId: '',
  notes: '',
}

function Expenses() {
  const { buildings } = useBuildingContext()
  const { data: allExpenses, create, update, remove, isSaving } = useCollection('expenses')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailExpense, setDetailExpense] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  const buildingOptions = useMemo(
    () => [
      { value: '', label: 'ללא בניין' },
      ...buildings.map((b) => ({ value: b.id, label: b.name })),
    ],
    [buildings]
  )

  const monthKey = `${selectedYear}-${selectedMonth}`

  const filtered = useMemo(() => {
    let result = allExpenses

    // Month filter — match by date string prefix
    result = result.filter((exp) => {
      if (!exp.date) return false
      return exp.date.startsWith(monthKey)
    })

    // Building filter
    if (buildingFilter !== 'all') {
      result = result.filter((exp) => exp.buildingId === buildingFilter)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (exp) =>
          exp.description?.toLowerCase().includes(q) ||
          exp.vendor?.toLowerCase().includes(q) ||
          exp.category?.toLowerCase().includes(q)
      )
    }

    // Sort by date descending
    result = [...result].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    return result
  }, [allExpenses, monthKey, buildingFilter, search])

  // Summary
  const summary = useMemo(() => {
    const monthExpenses = allExpenses.filter((exp) => {
      if (!exp.date) return false
      if (!exp.date.startsWith(monthKey)) return false
      if (buildingFilter !== 'all' && exp.buildingId !== buildingFilter) return false
      return true
    })
    const total = monthExpenses.reduce((s, exp) => s + (Number(exp.amount) || 0), 0)
    return { total, count: monthExpenses.length }
  }, [allExpenses, monthKey, buildingFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      date: new Date().toISOString().slice(0, 10),
      buildingId: buildingFilter !== 'all' ? buildingFilter : '',
    })
    setFormOpen(true)
  }

  const openEdit = (exp) => {
    setEditingId(exp.id)
    setForm({
      date: exp.date || '',
      description: exp.description || '',
      category: exp.category || '',
      amount: exp.amount ?? '',
      vendor: exp.vendor || '',
      buildingId: exp.buildingId || '',
      notes: exp.notes || '',
    })
    setFormOpen(true)
    setDetailExpense(null)
  }

  const [formErrors, setFormErrors] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.buildingId) errs.buildingId = 'חובה לבחור בניין'
    if (!form.description?.trim()) errs.description = 'חובה להזין תיאור'
    if (!form.amount || isNaN(Number(form.amount))) errs.amount = 'חובה להזין סכום'
    if (!form.date) errs.date = 'חובה להזין תאריך'
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setFormErrors({})
    const data = {
      ...form,
      amount: form.amount !== '' ? Number(form.amount) : null,
    }
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">הוצאות</h1>
          <p className="text-sm text-[var(--text-secondary)]">{filtered.length} הוצאות</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          הוצאה חדשה
        </Button>
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי תיאור, ספק או קטגוריה..."
      />

      {/* Month/Year selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <FormSelect
          label="חודש"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          options={HEBREW_MONTHS}
          className="w-36"
        />
        <FormSelect
          label="שנה"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={yearOptions}
          className="w-28"
        />
      </div>

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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-[var(--text-secondary)]">סה״כ הוצאות החודש</p>
            <p className="text-2xl font-bold text-[var(--danger)]">{formatCurrency(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-[var(--text-secondary)]">מספר הוצאות</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="אין הוצאות"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא נרשמו הוצאות לחודש הנבחר'}
          actionLabel={!search ? 'הוסף הוצאה' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">תאריך</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">תיאור</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">קטגוריה</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">סכום</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">ספק</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">בניין</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                    onClick={() => setDetailExpense(exp)}
                  >
                    <td className="p-3">{exp.date ? formatDate(exp.date) : '-'}</td>
                    <td className="p-3">{exp.description || '-'}</td>
                    <td className="p-3">
                      {exp.category && (
                        <Badge variant={CATEGORY_VARIANTS[exp.category] || 'default'}>
                          {exp.category}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">{formatCurrency(exp.amount || 0)}</td>
                    <td className="p-3">{exp.vendor || '-'}</td>
                    <td className="p-3">{buildingMap[exp.buildingId]?.name || '-'}</td>
                    <td className="p-3">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(exp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(exp)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={!!detailExpense}
        onOpenChange={() => setDetailExpense(null)}
        title={detailExpense ? 'פרטי הוצאה' : ''}
        onEdit={() => openEdit(detailExpense)}
      >
        {detailExpense && (
          <>
            <DetailRow label="תאריך" value={detailExpense.date ? formatDate(detailExpense.date) : '-'} />
            <DetailRow label="תיאור" value={detailExpense.description} />
            <DetailRow label="קטגוריה" value={detailExpense.category} />
            <DetailRow label="סכום" value={formatCurrency(detailExpense.amount || 0)} />
            <DetailRow label="ספק" value={detailExpense.vendor} />
            <DetailRow label="בניין" value={buildingMap[detailExpense.buildingId]?.name} />
            <DetailRow label="הערות" value={detailExpense.notes} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailExpense)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDetailExpense(null)
                  setDeleteTarget(detailExpense)
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
        itemName={deleteTarget ? (deleteTarget.description || 'הוצאה') : ''}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="תאריך *"
              type="date"
              value={form.date}
              onChange={setField('date')}
              error={formErrors.date}
            />
            <FormField
              label="תיאור *"
              value={form.description}
              onChange={setField('description')}
              error={formErrors.description}
            />
            <FormSelect
              label="קטגוריה"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORIES}
              placeholder="בחר קטגוריה"
            />
            <FormField
              label="סכום *"
              type="number"
              value={form.amount}
              onChange={setField('amount')}
              error={formErrors.amount}
            />
            <FormField
              label="ספק"
              value={form.vendor}
              onChange={setField('vendor')}
            />
            <FormSelect
              label="בניין *"
              value={form.buildingId}
              onChange={setField('buildingId')}
              options={buildingOptions}
              placeholder="בחר בניין"
              error={formErrors.buildingId}
            />
            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setField('notes')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'צור הוצאה'}</Button>
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

export default Expenses
