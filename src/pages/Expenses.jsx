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
import { Receipt, Plus, Pencil, Trash2, Landmark, Wallet, BarChart2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { EXPENSE_CATEGORIES, EXPENSE_GROUPS, findExpenseCategory, CATEGORY_BG_COLORS, CATEGORY_GRADIENTS, LEGACY_EXPENSE_MAP } from '@/lib/categories'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'

// Grouped categories for the select dropdown
const CATEGORIES = EXPENSE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))

// Resolve category to display (handles legacy values)
function resolveCategory(val) {
  if (!val) return null
  const direct = findExpenseCategory(val)
  if (direct) return direct
  const mapped = LEGACY_EXPENSE_MAP[val]
  if (mapped) return findExpenseCategory(mapped)
  return { value: val, label: val, color: 'slate', icon: '📋' }
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
  const { buildings, selectedBuilding } = useBuildingContext()
  const { data: allExpenses, create, update, remove, isSaving, isLoading } = useCollection('expenses',
    selectedBuilding ? { building_id: selectedBuilding.id } : {}
  )

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [viewMode, setViewMode] = useState('month') // 'month' or 'year'
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

  const datePrefix = viewMode === 'month' ? monthKey : selectedYear

  const filtered = useMemo(() => {
    let result = allExpenses

    // Date filter — month or year
    result = result.filter((exp) => {
      if (!exp.date) return false
      return exp.date.startsWith(datePrefix)
    })

    // Building filter (secondary — query already scoped by selectedBuilding)
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
  }, [allExpenses, datePrefix, buildingFilter, search])

  // Summary
  const summary = useMemo(() => {
    const periodExpenses = allExpenses.filter((exp) => {
      if (!exp.date) return false
      if (!exp.date.startsWith(datePrefix)) return false
      if (buildingFilter !== 'all' && exp.buildingId !== buildingFilter) return false
      return true
    })
    const total = periodExpenses.reduce((s, exp) => s + (Number(exp.amount) || 0), 0)
    return { total, count: periodExpenses.length }
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

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Wallet} iconColor="emerald" title="הוצאות" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Wallet}
        iconColor="emerald"
        title="הוצאות"
        subtitle={`${filtered.length} הוצאות`}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" />הוצאה חדשה</Button>}
      />

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי תיאור, ספק או קטגוריה..."
      />

      {/* Month/Year selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              viewMode === 'month'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >חודשי</button>
          <button
            onClick={() => setViewMode('year')}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              viewMode === 'year'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >שנתי</button>
        </div>
        {viewMode === 'month' && (
          <FormSelect
            label="חודש"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            options={HEBREW_MONTHS}
            className="w-36"
          />
        )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label={viewMode === 'month' ? 'סה״כ הוצאות החודש' : `סה״כ הוצאות ${selectedYear}`}
          value={formatCurrency(summary.total)}
          color="red"
          icon={Wallet}
        />
        <StatCard label="מספר הוצאות" value={String(summary.count)} color="blue" icon={BarChart2} />
      </div>

      {/* Expense Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="אין הוצאות"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא נרשמו הוצאות לחודש הנבחר'}
          actionLabel={!search ? 'הוסף הוצאה' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => {
            const cat = resolveCategory(exp.category)
            const gradient = cat
              ? (CATEGORY_GRADIENTS[cat.color] || 'from-slate-500 to-slate-600')
              : 'from-slate-400 to-slate-500'
            const categoryIcon = cat?.icon || '📋'
            const categoryLabel = cat?.label || exp.category || ''
            const categoryBg = cat ? (CATEGORY_BG_COLORS[cat.color] || '') : ''

            return (
              <div
                key={exp.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                onClick={() => setDetailExpense(exp)}
              >
                {/* Category gradient circle */}
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-lg shrink-0 shadow-sm`}>
                  {categoryIcon}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {exp.description || '-'}
                    </span>
                    {exp.bank_transaction_id && (
                      <Badge variant="info" className="gap-1 text-[10px] px-1.5 py-0">
                        <Landmark className="h-3 w-3" />
                        בנק
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {exp.vendor && <span className="text-xs text-[var(--text-muted)]">{exp.vendor}</span>}
                    {buildingMap[exp.buildingId]?.name && (
                      <span className="text-xs text-[var(--text-muted)]">{buildingMap[exp.buildingId].name}</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-left min-w-[100px]">
                  <div className="text-[15px] font-bold text-[var(--text-primary)]">
                    {formatCurrency(exp.amount || 0)}
                  </div>
                </div>

                {/* Category chip */}
                {categoryLabel && (
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border ${categoryBg || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    {categoryLabel}
                  </span>
                )}

                {/* Date */}
                <span className="text-xs text-[var(--text-muted)] min-w-[70px] shrink-0">
                  {exp.date ? formatDate(exp.date) : '-'}
                </span>

                {/* Hover-reveal actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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
              </div>
            )
          })}
        </div>
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
