import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { TabGroup } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { FormTextarea } from '@/components/common/FormField'
import { SearchBar } from '@/components/common/SearchBar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { INCOME_CATEGORIES, INCOME_GROUPS, findIncomeCategory } from '@/lib/categories'
import {
  ArrowDownLeft, Landmark, Pencil, Tag, Check, X as XIcon,
  CheckCircle2, AlertCircle, PieChart, ArrowLeftRight, ChevronLeft,
} from 'lucide-react'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'
import { toast } from '@/lib/toast'

const PALETTE = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--primary-dark)', 'var(--danger)', 'var(--text-muted)']

export default function BankIncome() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allTx, update, refresh, isLoading } = useCollection('bankTransactions', scope)
  const { byId: unitById } = useUnitDirectory(selectedBuilding?.id)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [viewMode, setViewMode] = useState('month') // 'month' or 'year'
  const [search, setSearch] = useState('')
  const [matchFilter, setMatchFilter] = useState('all') // all | matched | unmatched
  const [editTx, setEditTx] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [categoryDialog, setCategoryDialog] = useState(null)

  const monthKey = `${selectedYear}-${selectedMonth}`

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  // Credits only for this building, filtered by month or year
  const incomeList = useMemo(() => {
    let result = allTx.filter(tx => {
      if (tx.building_id !== selectedBuilding?.id) return false
      if (tx.match_status === 'excluded' || tx.match_status === 'suggested') return false
      if (Number(tx.credit) <= 0) return false
      if (viewMode === 'month') return tx.month === monthKey
      return tx.month?.startsWith(selectedYear)
    })

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(tx =>
        tx.description?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q)
      )
    }

    return result.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
  }, [allTx, selectedBuilding, monthKey, selectedYear, viewMode, search])

  const summary = useMemo(() => {
    const total = incomeList.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)
    return { total, count: incomeList.length }
  }, [incomeList])

  const openEdit = (tx) => {
    setEditTx(tx)
    setEditNotes(tx.notes || '')
  }

  const handleSaveNotes = async () => {
    if (!editTx) return
    await update(editTx.id, { notes: editNotes })
    setEditTx(null)
    refresh()
  }

  const handleSetCategory = async (txId, category) => {
    const tx = categoryDialog
    await update(txId, { category })

    // Auto-categorize all transactions with the same description across all months
    if (category && tx?.description) {
      const desc = tx.description.trim()
      const matching = allTx.filter(t =>
        t.id !== txId &&
        t.building_id === selectedBuilding?.id &&
        t.description?.trim() === desc &&
        !t.category
      )
      for (const m of matching) {
        await update(m.id, { category })
      }
      if (matching.length > 0) {
        toast(`עודכנו ${matching.length} תנועות נוספות עם אותו תיאור`)
      }
    }

    setCategoryDialog(null)
    refresh()
  }

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הכנסות</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לצפות בהכנסות" />
  }

  // ── View model (derived from already-loaded data) ──
  const monthLabel = HEBREW_MONTHS.find(m => m.value === selectedMonth)?.label || ''
  const periodLabel = viewMode === 'month' ? `${monthLabel} ${selectedYear}` : `שנת ${selectedYear}`
  const sumOf = (rows) => rows.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)
  const matchedRows = incomeList.filter(tx => tx.match_status === 'matched')
  const unmatchedRows = incomeList.filter(tx => tx.match_status !== 'matched')
  const matchedSum = sumOf(matchedRows)
  const unmatchedSum = sumOf(unmatchedRows)
  const matchedPct = summary.total > 0 ? Math.round((matchedSum / summary.total) * 100) : 0
  const uncategorized = incomeList.filter(tx => !tx.category)
  const biggest = [...incomeList].sort((a, b) => (Number(b.credit) || 0) - (Number(a.credit) || 0))[0]
  const visible = matchFilter === 'matched' ? matchedRows : matchFilter === 'unmatched' ? unmatchedRows : incomeList

  const byCat = Object.entries(incomeList.reduce((m, tx) => {
    const k = tx.category ? (findIncomeCategory(tx.category)?.label || tx.category) : 'לא מסווג'
    m[k] = (m[k] || 0) + (Number(tx.credit) || 0)
    return m
  }, {})).sort((a, b) => b[1] - a[1])
  const catRows = byCat.slice(0, 5)
  if (byCat.length > 5) catRows.push(['שונות', byCat.slice(5).reduce((a, [, v]) => a + v, 0)])

  const unitLabel = (tx) => {
    if (!tx.unit_id) return null
    const u = unitById[tx.unit_id]
    return u ? u.label : 'דירה משויכת'
  }

  const renderCategory = (tx) => {
    if (tx.category) {
      const cat = findIncomeCategory(tx.category)
      return (
        <button
          onClick={() => setCategoryDialog(tx)}
          className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          {cat?.icon} {cat?.label || tx.category}
        </button>
      )
    }
    return (
      <button
        onClick={() => setCategoryDialog(tx)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-[var(--outline-variant)] text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors whitespace-nowrap"
      >
        <Tag className="h-3 w-3" />
        קטגוריה
      </button>
    )
  }

  const statusBadge = (tx) => tx.match_status === 'matched'
    ? <Badge variant="success">משויך</Badge>
    : <Badge variant="warning">לא משויך</Badge>

  const editBtn = (tx) => (
    <button
      onClick={() => openEdit(tx)}
      title="עריכת הערות"
      className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הכנסות — {periodLabel}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">זיכויים מתנועות הבנק — דמי ועד ותשלומים נכנסים, משויכים לדירות • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabGroup tabs={[{ key: 'month', label: 'חודשי' }, { key: 'year', label: 'שנתי' }]} activeTab={viewMode} onChange={setViewMode} />
          {viewMode === 'month' && (
            <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} options={HEBREW_MONTHS} className="w-28" aria-label="חודש" />
          )}
          <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} options={yearOptions} className="w-24" aria-label="שנה" />
          <Link to="/bank-transactions" className="h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[13px] font-semibold inline-flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />שיוך בתנועות בנק
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={`סה״כ הכנסות ${viewMode === 'month' ? 'החודש' : 'השנה'}`} icon={ArrowDownLeft} color="emerald"
          value={formatCurrency(summary.total)}
          sub={`${summary.count} תנועות זכות`} />
        <StatCard label="משויכות לדירות" icon={CheckCircle2} color="blue"
          value={formatCurrency(matchedSum)}
          note={summary.total > 0 ? `${matchedPct}%` : null}
          sub={`${matchedRows.length} תנועות משויכות`}
          progress={matchedPct} />
        <StatCard label="לא משויכות" icon={AlertCircle} color={unmatchedRows.length ? 'amber' : 'emerald'}
          value={String(unmatchedRows.length)}
          note={unmatchedRows.length ? `(${formatCurrency(unmatchedSum)})` : null}
          sub={unmatchedRows.length ? 'זיכויים שעדיין לא שויכו לדירה' : 'כל הזיכויים משויכים ✓'}
          footer={unmatchedRows.length ? (
            <Link to="/bank-transactions" className="text-[var(--primary)] font-semibold hover:underline">לשיוך בתנועות בנק ←</Link>
          ) : null} />
        <StatCard label="ההכנסה הגדולה" icon={PieChart} color="slate"
          value={biggest ? formatCurrency(biggest.credit) : '—'}
          sub={biggest ? biggest.description : 'אין הכנסות בתקופה'}
          footer={uncategorized.length ? <span>{uncategorized.length} תנועות ללא קטגוריה</span> : null} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי תיאור או הערה..." />
            <TabGroup
              tabs={[
                { key: 'all', label: 'הכל', count: incomeList.length },
                { key: 'matched', label: 'משויכות', count: matchedRows.length },
                { key: 'unmatched', label: 'לא משויכות', count: unmatchedRows.length },
              ]}
              activeTab={matchFilter}
              onChange={setMatchFilter}
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={ArrowDownLeft}
                title="אין הכנסות"
                description={search ? 'לא נמצאו תוצאות לחיפוש' : `לא נמצאו הכנסות ל${periodLabel}`}
              />
            </div>
          ) : (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    <tr><th>תאריך</th><th>תיאור</th><th>דירה</th><th>קטגוריה</th><th className="!text-left">סכום</th><th>סטטוס</th><th></th></tr>
                  </thead>
                  <tbody>
                    {visible.map(tx => (
                      <tr key={tx.id}>
                        <td className="whitespace-nowrap text-[12px] font-semibold num-tabular">{tx.transaction_date ? formatDate(tx.transaction_date) : '—'}</td>
                        <td className="min-w-[200px]">
                          <span className="block text-[13px] font-semibold truncate max-w-[280px]">{tx.description || '—'}</span>
                          {tx.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{tx.notes}</span>}
                        </td>
                        <td className="whitespace-nowrap text-[12px]">
                          {unitLabel(tx) ? <span className="font-semibold num-tabular">{unitLabel(tx)}</span> : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                        <td className="whitespace-nowrap">{renderCategory(tx)}</td>
                        <td className="whitespace-nowrap !text-left">
                          <span className="text-[14px] font-bold num-tabular text-[var(--success)]">+{formatCurrency(tx.credit)}</span>
                        </td>
                        <td className="whitespace-nowrap">{statusBadge(tx)}</td>
                        <td className="whitespace-nowrap">{editBtn(tx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--border-light)]">
                {visible.map(tx => (
                  <div key={tx.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] line-clamp-2">{tx.description || '—'}</p>
                        <p className="text-[11px] text-[var(--text-muted)] num-tabular mt-0.5">
                          {tx.transaction_date ? formatDate(tx.transaction_date) : '—'}{unitLabel(tx) ? ` • ${unitLabel(tx)}` : ''}
                        </p>
                        {tx.notes && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">{tx.notes}</p>}
                      </div>
                      <span className="text-[14px] font-bold num-tabular shrink-0 text-[var(--success)]">+{formatCurrency(tx.credit)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(tx)}
                      {renderCategory(tx)}
                      <div className="mr-auto">{editBtn(tx)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>מציג {visible.length} תנועות</span>
                <span>סך הכל המוצג: <strong className="text-[var(--success)] num-tabular">{formatCurrency(sumOf(visible))}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-4 space-y-4">
          <div>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">פילוח הכנסות לפי קטגוריה</h2>
            <p className="text-[11px] text-[var(--text-muted)] num-tabular">{periodLabel} • סה״כ {formatCurrency(summary.total)}</p>
          </div>
          {catRows.length === 0 ? (
            <p className="text-center text-[12px] text-[var(--text-muted)] py-4">אין נתונים לתקופה</p>
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
          <Link to="/balance" className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)] text-[12px]">
            <span className="font-semibold text-[var(--text-primary)]">מאזן הכנסות מול הוצאות</span>
            <ChevronLeft className="h-4 w-4 text-[var(--primary)]" />
          </Link>
        </aside>
      </div>

      {/* Category Dialog */}
      <Dialog open={!!categoryDialog} onOpenChange={() => setCategoryDialog(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך קטגוריית הכנסה</DialogTitle>
          </DialogHeader>
          {categoryDialog && (
            <div className="space-y-3 mt-2">
              <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-sm">
                <p className="font-medium truncate">{categoryDialog.description}</p>
                <p className="text-[var(--success)] font-bold mt-1 num-tabular">+{formatCurrency(categoryDialog.credit)}</p>
              </div>
              {categoryDialog.category && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[var(--danger)] border-[var(--danger)]/30 hover:bg-[var(--danger-light)]"
                  onClick={() => handleSetCategory(categoryDialog.id, null)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                  הסר קטגוריה
                </Button>
              )}
              <div className="max-h-72 overflow-y-auto space-y-3">
                {INCOME_GROUPS.map(group => {
                  const groupCats = INCOME_CATEGORIES.filter(c => c.group === group.key)
                  if (groupCats.length === 0) return null
                  return (
                    <div key={group.key}>
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5 px-1">{group.label}</p>
                      <div className="space-y-0.5">
                        {groupCats.map(cat => {
                          const isActive = categoryDialog.category === cat.value
                          return (
                            <button
                              key={cat.value}
                              onClick={() => handleSetCategory(categoryDialog.id, cat.value)}
                              className={`w-full flex items-center gap-2.5 p-2 rounded-[var(--radius)] transition-colors text-sm text-right ${
                                isActive
                                  ? 'bg-[var(--surface-container)] text-[var(--primary-dark)] font-medium'
                                  : 'hover:bg-[var(--surface-secondary)]'
                              }`}
                            >
                              <span className="text-base">{cat.icon}</span>
                              <span className="flex-1">{cat.label}</span>
                              {isActive && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת הערות</DialogTitle>
          </DialogHeader>
          {editTx && (
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-sm">
                <p className="font-medium">{editTx.description}</p>
                <p className="text-[var(--success)] font-bold mt-1 num-tabular">+{formatCurrency(editTx.credit)}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 num-tabular">{formatDate(editTx.transaction_date)}</p>
              </div>
              <FormTextarea
                label="הערות"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="הוסף הערה..."
              />
              <div className="flex gap-3">
                <Button onClick={handleSaveNotes}>שמור</Button>
                <Button variant="outline" onClick={() => setEditTx(null)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
