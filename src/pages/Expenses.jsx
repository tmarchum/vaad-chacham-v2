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
import { Receipt, Plus, Pencil, Trash2, Landmark, Wallet, BarChart2, ChevronRight, ChevronLeft, CalendarDays, ArrowLeftRight, TrendingDown, AlertTriangle, PieChart, Download, Split, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TabGroup } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { EXPENSE_CATEGORIES, EXPENSE_GROUPS, findExpenseCategory, CATEGORY_BG_COLORS, CATEGORY_GRADIENTS, LEGACY_EXPENSE_MAP } from '@/lib/categories'
import { HEBREW_MONTHS as MONTH_NAMES } from '@/lib/constants'
import { toast } from '@/lib/toast'

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

// The neighbouring building this one shares costs with. Free text (it is not
// a managed building in this system), remembered from the last marked expense.
const DEFAULT_SHARED_WITH = 'משורר ישעיהו 16'

const EMPTY_FORM = {
  date: '',
  description: '',
  category: '',
  amount: '',
  vendor: '',
  buildingId: '',
  notes: '',
  is_shared: false,
  shared_with: '',
  shared_percent: 50,
}

function Expenses() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allExpenses, create, update, remove, bulkUpdate, isSaving, isLoading } = useCollection('expenses', scope)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [viewMode, setViewMode] = useState('month') // 'month' or 'year'
  const [search, setSearch] = useState('')
  // Data is already scoped to the sidebar's building.
  const buildingFilter = 'all'
  const [sourceFilter, setSourceFilter] = useState('all') // all | bank | manual | uncategorized
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailExpense, setDetailExpense] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

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

  // Whoever this building last shared a cost with — the sensible default for
  // the next one, instead of retyping the neighbour's name every time.
  const lastSharedWith = useMemo(() => {
    const marked = allExpenses
      .filter((e) => e.is_shared && e.shared_with)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return marked[0]?.shared_with || DEFAULT_SHARED_WITH
  }, [allExpenses])

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

    if (sourceFilter === 'bank') result = result.filter((exp) => exp.source === 'bank' || exp.bank_transaction_id)
    else if (sourceFilter === 'manual') result = result.filter((exp) => !(exp.source === 'bank' || exp.bank_transaction_id))
    else if (sourceFilter === 'uncategorized') result = result.filter((exp) => !exp.category || exp.category === 'אחר')
    else if (sourceFilter === 'shared') result = result.filter((exp) => exp.is_shared)

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
  }, [allExpenses, datePrefix, buildingFilter, search, sourceFilter])

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
      shared_with: lastSharedWith,
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
      is_shared: !!exp.is_shared,
      shared_with: exp.shared_with || lastSharedWith,
      shared_percent: exp.shared_percent ?? 50,
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
      // A cost is only "shared" if it says with whom and in what proportion.
      is_shared: !!form.is_shared,
      shared_with: form.is_shared ? (form.shared_with?.trim() || DEFAULT_SHARED_WITH) : null,
      shared_percent: form.is_shared ? Number(form.shared_percent) || 50 : 50,
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

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
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

  // ── Civic Blue ledger view model ──
  const monthIdx = Number(selectedMonth) - 1
  const stepPeriod = (delta) => {
    if (viewMode === 'year') { setSelectedYear(String(Number(selectedYear) + delta)); return }
    const d = new Date(Number(selectedYear), monthIdx + delta, 1)
    setSelectedMonth(String(d.getMonth() + 1).padStart(2, '0'))
    setSelectedYear(String(d.getFullYear()))
  }
  const periodRows = allExpenses.filter((e) => e.date?.startsWith(datePrefix))
  // Average over the 12 months before the selected month (months with data)
  const monthTotals = {}
  allExpenses.forEach((e) => { if (e.date) monthTotals[e.date.slice(0, 7)] = (monthTotals[e.date.slice(0, 7)] || 0) + (Number(e.amount) || 0) })
  const prevKeys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Number(selectedYear), monthIdx - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }).filter((k) => monthTotals[k])
  const monthlyAvg = prevKeys.length ? prevKeys.reduce((a, k) => a + monthTotals[k], 0) / prevKeys.length : 0
  const vsAvgPct = monthlyAvg > 0 ? Math.round((summary.total / monthlyAvg) * 100) : 0
  const biggest = [...periodRows].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0]
  const uncategorized = periodRows.filter((e) => !e.category || e.category === 'אחר')
  const uncategorizedSum = uncategorized.reduce((a, e) => a + (Number(e.amount) || 0), 0)
  // ── Shared-cost settlement ──
  // Costs this building paid in full but that serve the neighbour too. The
  // figure that matters at year end is their share of them.
  const sharedRows = periodRows.filter((e) => e.is_shared)
  const sharedTotal = sharedRows.reduce((a, e) => a + (Number(e.amount) || 0), 0)
  const theirShare = sharedRows.reduce((a, e) => a + (Number(e.amount) || 0) * ((Number(e.shared_percent) || 50) / 100), 0)
  const openShare = sharedRows.filter((e) => !e.shared_settled)
    .reduce((a, e) => a + (Number(e.amount) || 0) * ((Number(e.shared_percent) || 50) / 100), 0)
  const sharedParty = sharedRows.find((e) => e.shared_with)?.shared_with || lastSharedWith
  const toggleShared = async (exp) => {
    await update(exp.id, exp.is_shared
      ? { is_shared: false, shared_with: null }
      : { is_shared: true, shared_with: lastSharedWith, shared_percent: 50 })
  }

  const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b']
  const byCat = Object.entries(periodRows.reduce((m, e) => {
    const k = resolveCategory(e.category)?.label || 'לא מסווג'
    m[k] = (m[k] || 0) + (Number(e.amount) || 0)
    return m
  }, {})).sort((a, b) => b[1] - a[1])
  const catRows = byCat.slice(0, 6)
  if (byCat.length > 6) catRows.push(['שונות', byCat.slice(6).reduce((a, [, v]) => a + v, 0)])
  let acc = 0
  const donut = summary.total > 0
    ? `conic-gradient(${catRows.map(([, v], i) => { const from = acc; acc += (v / summary.total) * 360; return `${PALETTE[i]} ${from}deg ${acc}deg` }).join(', ')})`
    : 'conic-gradient(var(--surface-container) 0deg 360deg)'
  const periodLabel = viewMode === 'month' ? `${MONTH_NAMES[monthIdx]} ${selectedYear}` : `שנת ${selectedYear}`
  const isBank = (e) => e.source === 'bank' || !!e.bank_transaction_id
  const exportCsv = () => {
    const out = [['תאריך', 'תיאור', 'ספק', 'קטגוריה', 'סכום', 'מקור', 'משותפת עם', 'אחוז הצד השני', 'חלק הצד השני', 'הוסדר']]
    filtered.forEach((e) => out.push([
      e.date, e.description, e.vendor, resolveCategory(e.category)?.label || '', e.amount, isBank(e) ? 'בנק' : 'ידני',
      e.is_shared ? (e.shared_with || '') : '',
      e.is_shared ? `${Number(e.shared_percent) || 50}%` : '',
      e.is_shared ? Math.round((Number(e.amount) || 0) * ((Number(e.shared_percent) || 50) / 100) * 100) / 100 : '',
      e.is_shared ? (e.shared_settled ? 'כן' : 'לא') : '',
    ]))
    const csv = '﻿' + out.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: `hotzaot-${datePrefix}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ספר הוצאות הבניין — {periodLabel}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">מעקב תקציב שוטף, בקרה מול ממוצע, שיוך חשבוניות ותנועות בנק</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabGroup tabs={[{ key: 'month', label: 'חודשי' }, { key: 'year', label: 'שנתי' }]} activeTab={viewMode} onChange={setViewMode} />
          <div className="flex items-center h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)]">
            <button onClick={() => stepPeriod(-1)} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="הקודם"><ChevronRight className="h-4 w-4" /></button>
            <span className="flex items-center gap-1.5 px-2 text-[13px] font-semibold num-tabular"><CalendarDays className="h-4 w-4 text-[var(--primary)]" />{viewMode === 'month' ? `${MONTH_NAMES[monthIdx]} ${selectedYear}` : selectedYear}</span>
            <button onClick={() => stepPeriod(1)} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="הבא"><ChevronLeft className="h-4 w-4" /></button>
          </div>
          <Link to="/bank-transactions" className="h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[13px] font-semibold inline-flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />תנועות בנק
          </Link>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />ייצוא</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4" />הוצאה חדשה</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={viewMode === 'month' ? 'הוצאות החודש מול הממוצע' : `סה״כ הוצאות ${selectedYear}`} icon={PieChart} color="blue"
          value={formatCurrency(summary.total)}
          sub={viewMode === 'month' && monthlyAvg > 0 ? `${vsAvgPct}% מהממוצע החודשי (${formatCurrency(Math.round(monthlyAvg))})` : `${summary.count} הוצאות`}
          progress={viewMode === 'month' && monthlyAvg > 0 ? Math.min(100, vsAvgPct) : undefined} />
        <StatCard label="ממוצע הוצאות חודשי" icon={BarChart2} color="purple"
          value={monthlyAvg > 0 ? formatCurrency(Math.round(monthlyAvg)) : '—'}
          sub={prevKeys.length ? `מבוסס על ${prevKeys.length} חודשים אחרונים` : 'אין עדיין מספיק נתונים'}
          footer={viewMode === 'month' && monthlyAvg > 0 ? (
            <span className={`inline-flex items-center gap-1 font-semibold ${summary.total <= monthlyAvg ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              <TrendingDown className="h-3.5 w-3.5" />{summary.total <= monthlyAvg ? 'מתחת לממוצע' : 'מעל הממוצע'}
            </span>
          ) : null} />
        <StatCard label={`ההוצאה הגדולה ${viewMode === 'month' ? 'החודש' : 'השנה'}`} icon={Receipt} color="slate"
          value={biggest ? formatCurrency(biggest.amount) : '—'}
          sub={biggest ? (biggest.vendor || biggest.description) : 'אין הוצאות'}
          footer={biggest?.category ? <span className="px-2 py-0.5 rounded bg-[var(--surface-container)] text-[var(--primary-dark)] font-semibold">{resolveCategory(biggest.category)?.label}</span> : null} />
        <StatCard label="הוצאות הדורשות טיפול" icon={AlertTriangle} color={uncategorized.length ? 'amber' : 'emerald'}
          value={String(uncategorized.length)}
          note={uncategorized.length ? `(סך ${formatCurrency(uncategorizedSum)})` : null}
          sub={uncategorized.length ? 'ללא קטגוריה — לא ייכנסו לפילוח ולדוחות' : 'כל ההוצאות מסווגות ✓'}
          footer={uncategorized.length ? <button onClick={() => setSourceFilter('uncategorized')} className="text-[var(--primary)] font-semibold hover:underline">לשיוך עכשיו ←</button> : null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי ספק, תיאור או קטגוריה..." />
            <TabGroup
              tabs={[
                { key: 'all', label: 'הכל', count: periodRows.length },
                { key: 'bank', label: 'תנועות בנק', count: periodRows.filter(isBank).length },
                { key: 'manual', label: 'הזנה ידנית', count: periodRows.filter((e) => !isBank(e)).length },
                { key: 'uncategorized', label: '⚠ לא מסווגות', count: uncategorized.length },
                { key: 'shared', label: 'משותפות', count: sharedRows.length },
              ]}
              activeTab={sourceFilter}
              onChange={setSourceFilter}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Receipt} title="אין הוצאות" description={search ? 'לא נמצאו תוצאות לחיפוש' : `לא נרשמו הוצאות ל${viewMode === 'month' ? 'חודש' : 'שנה'} הנבחר/ת`}
              actionLabel={!search ? 'הוסף הוצאה' : undefined} onAction={!search ? openCreate : undefined} />
          ) : (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    <tr><th>תאריך</th><th>תיאור השירות</th><th>ספק</th><th>קטגוריה</th><th className="!text-left">סכום</th><th>מקור</th><th>משותפת</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((exp) => {
                      const cat = resolveCategory(exp.category)
                      const needs = !exp.category || exp.category === 'אחר'
                      return (
                        <tr key={exp.id} onClick={() => setDetailExpense(exp)} className={`cursor-pointer ${needs ? '!bg-[var(--warning-light)]/40' : ''}`}>
                          <td className="whitespace-nowrap text-[12px] font-semibold num-tabular">{exp.date ? formatDate(exp.date) : '—'}</td>
                          <td className="min-w-[180px]">
                            <span className="text-[13px] font-semibold">{exp.description || '—'}</span>
                            {exp.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{exp.notes}</span>}
                          </td>
                          <td className="whitespace-nowrap text-[12px]">{exp.vendor || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {needs ? (
                              <select
                                value=""
                                onChange={(e) => e.target.value && update(exp.id, { category: e.target.value })}
                                className="h-8 rounded-[var(--radius)] border border-amber-300 bg-[var(--warning-light)] px-2 text-[11px] font-semibold text-[var(--warning)]"
                              >
                                <option value="">⚠ לא מסווג — שייך</option>
                                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold">{cat?.icon} {cat?.label}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap !text-left"><span className="text-[14px] font-bold num-tabular">{formatCurrency(exp.amount || 0)}</span></td>
                          <td className="whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                            {isBank(exp) ? <span className="inline-flex items-center gap-1"><Landmark className="h-3.5 w-3.5 text-[var(--primary)]" />בנק</span> : 'ידני'}
                          </td>
                          {/* Mark one expense at a time as shared with the
                              neighbouring building — one click, no dialog. */}
                          <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleShared(exp)}
                              title={exp.is_shared ? `משותפת עם ${exp.shared_with || ''} — לחץ לביטול` : 'סמן כהוצאה משותפת'}
                              className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border text-[11px] font-semibold transition-colors ${
                                exp.is_shared
                                  ? 'border-[var(--primary)]/30 bg-[var(--surface-container)] text-[var(--primary-dark)]'
                                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30'
                              }`}
                            >
                              <Split className="h-3.5 w-3.5" />
                              {exp.is_shared ? `${Number(exp.shared_percent) || 50}%` : 'סמן'}
                            </button>
                          </td>
                          <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-0.5">
                              <button onClick={() => openEdit(exp)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeleteTarget(exp)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>מציג {filtered.length} הוצאות</span>
                <span>סך הכל המוצג: <strong className="text-[var(--primary)] num-tabular">{formatCurrency(filtered.reduce((a, e) => a + (Number(e.amount) || 0), 0))}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <aside className="lg:col-span-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-4 space-y-4 lg:sticky lg:top-4">
          <div>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">פילוח לפי קטגוריות</h2>
            <p className="text-[11px] text-[var(--text-muted)]">{periodLabel} • סה״כ {formatCurrency(summary.total)}</p>
          </div>
          <div className="flex justify-center py-2">
            <div className="relative h-44 w-44 rounded-full" style={{ background: donut }}>
              <div className="absolute inset-6 rounded-full bg-[var(--surface)] flex flex-col items-center justify-center text-center">
                <span className="text-[11px] text-[var(--text-muted)]">סה״כ הוצאות</span>
                <span className="text-[20px] font-bold num-tabular text-[var(--text-primary)]">{formatCurrency(summary.total)}</span>
              </div>
            </div>
          </div>
          {catRows.length === 0 ? (
            <p className="text-center text-[12px] text-[var(--text-muted)]">אין נתונים לתקופה</p>
          ) : (
            <div className="space-y-3">
              {catRows.map(([label, value], i) => {
                const pct = summary.total ? Math.round((value / summary.total) * 1000) / 10 : 0
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PALETTE[i] }} /><span className="truncate font-medium text-[var(--text-primary)]">{label}</span></span>
                      <span className="shrink-0 num-tabular"><strong>{formatCurrency(value)}</strong> <span className="text-[var(--text-muted)]">({pct}%)</span></span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Shared-cost settlement — what the neighbouring building owes for
              costs this one paid in full. */}
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Split className="h-4 w-4 text-[var(--primary)]" />
              <h3 className="text-[13px] font-bold text-[var(--text-primary)]">התחשבנות הוצאות משותפות</h3>
            </div>
            {sharedRows.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] leading-4">
                לא סומנו הוצאות משותפות ל{viewMode === 'month' ? 'חודש' : 'שנה'} זו. סמן הוצאה בטור "משותפת" בטבלה כדי שתיכנס להתחשבנות.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-[var(--text-muted)]">מול {sharedParty} • {sharedRows.length} הוצאות</p>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">סך ההוצאות המשותפות</span>
                    <strong className="num-tabular">{formatCurrency(sharedTotal)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">החלק שלהם</span>
                    <strong className="num-tabular text-[var(--primary)]">{formatCurrency(Math.round(theirShare))}</strong>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--border)] pt-1.5">
                    <span className="text-[var(--text-secondary)]">טרם הוסדר</span>
                    <strong className={`num-tabular ${openShare > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>{formatCurrency(Math.round(openShare))}</strong>
                  </div>
                </div>
                <button
                  onClick={() => setSourceFilter('shared')}
                  className="w-full text-[11px] font-semibold text-[var(--primary)] hover:underline text-right"
                >
                  הצג את ההוצאות המשותפות ←
                </button>
                {openShare > 0 && (
                  <button
                    onClick={async () => {
                      const open = sharedRows.filter((e) => !e.shared_settled)
                      if (!window.confirm(`לסמן ${open.length} הוצאות משותפות כמוסדרות? הסכום ${formatCurrency(Math.round(openShare))} ייצא מ"טרם הוסדר".`)) return
                      await bulkUpdate(open.map((e) => e.id), { shared_settled: true }, { silent: true })
                      toast(`${open.length} הוצאות משותפות סומנו כמוסדרות`)
                    }}
                    className="w-full h-[34px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />סמן כהוסדר
                  </button>
                )}
              </>
            )}
          </div>

          <Link to="/expense-analysis" className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)] text-[12px]">
            <span className="font-semibold text-[var(--text-primary)]">ניתוח הוצאות מעמיק (AI)</span>
            <ChevronLeft className="h-4 w-4 text-[var(--primary)]" />
          </Link>
        </aside>
      </div>

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
            {detailExpense.is_shared && (
              <>
                <DetailRow label="משותפת עם" value={detailExpense.shared_with} />
                <DetailRow
                  label="חלק הצד השני"
                  value={`${Number(detailExpense.shared_percent) || 50}% — ${formatCurrency(Math.round((Number(detailExpense.amount) || 0) * ((Number(detailExpense.shared_percent) || 50) / 100)))}`}
                />
                <DetailRow label="סטטוס התחשבנות" value={detailExpense.shared_settled ? 'הוסדר' : 'טרם הוסדר'} />
              </>
            )}
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
            {/* Shared cost — marked per expense so year-end settlement is a
                figure, not a reconstruction. */}
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.is_shared}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    is_shared: e.target.checked,
                    shared_with: prev.shared_with || lastSharedWith,
                  }))}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-[13px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                  <Split className="h-4 w-4 text-[var(--primary)]" />הוצאה משותפת עם בניין שכן
                </span>
              </label>
              {form.is_shared && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="משותפת עם"
                    value={form.shared_with}
                    onChange={setField('shared_with')}
                  />
                  <FormField
                    label="אחוז הצד השני"
                    type="number"
                    value={form.shared_percent}
                    onChange={setField('shared_percent')}
                  />
                  <p className="col-span-2 text-[11px] text-[var(--text-muted)]">
                    מתוך {form.amount ? formatCurrency(Number(form.amount)) : 'הסכום'} —
                    חלקם {form.amount ? formatCurrency(Math.round(Number(form.amount) * ((Number(form.shared_percent) || 50) / 100))) : '—'}.
                    ההוצאה נשארת במלואה בספרי הבניין; רק ההתחשבנות מתעדכנת.
                  </p>
                </div>
              )}
            </div>

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
