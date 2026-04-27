import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormSelect, FormTextarea } from '@/components/common/FormField'
import { SearchBar } from '@/components/common/SearchBar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { INCOME_CATEGORIES, INCOME_GROUPS, findIncomeCategory, CATEGORY_BG_COLORS } from '@/lib/categories'
import {
  ArrowDownLeft, Landmark, Pencil, CheckCircle2, Tag, Check, X as XIcon,
} from 'lucide-react'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'

export default function BankIncome() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx, update, refresh } = useCollection('bankTransactions')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [viewMode, setViewMode] = useState('month') // 'month' or 'year'
  const [search, setSearch] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [categoryDialog, setCategoryDialog] = useState(null)

  const monthKey = `${selectedYear}-${selectedMonth}`

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
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
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { message: `עודכנו ${matching.length} תנועות נוספות עם אותו תיאור`, type: 'success' }
        }))
      }
    }

    setCategoryDialog(null)
    refresh()
  }

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לצפות בהכנסות" />
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={ArrowDownLeft} iconColor="emerald" title="הכנסות" subtitle="זיכויים מתנועות בנק — דמי ועד ותשלומים נכנסים" />

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי תיאור..." />

      {/* Filters */}
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

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                <ArrowDownLeft className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">סה״כ הכנסות</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">מספר תנועות</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {incomeList.length === 0 ? (
        <EmptyState
          icon={ArrowDownLeft}
          title="אין הכנסות"
          description={`לא נמצאו הכנסות ל${HEBREW_MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`}
        />
      ) : (
        <div className="space-y-2 overflow-x-auto">
          {incomeList.map(tx => {
            const isMatched = tx.match_status === 'matched'
            const dotColor = isMatched ? 'bg-emerald-500' : 'bg-amber-500'
            const statusTextColor = isMatched ? 'text-emerald-700' : 'text-amber-700'
            const statusLabel = isMatched ? 'משויך' : 'לא משויך'

            return (
              <div
                key={tx.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                {/* Emerald gradient circle */}
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ArrowDownLeft className="h-5 w-5" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {tx.description || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>{tx.transaction_date ? formatDate(tx.transaction_date) : '-'}</span>
                    {tx.notes && (
                      <span className="truncate max-w-[200px]">{tx.notes}</span>
                    )}
                  </div>
                </div>

                {/* Category chip */}
                <div className="hidden sm:block shrink-0" onClick={e => e.stopPropagation()}>
                  {tx.category ? (() => {
                    const cat = findIncomeCategory(tx.category)
                    const catBg = cat ? (CATEGORY_BG_COLORS[cat.color] || '') : ''
                    return (
                      <button
                        onClick={() => setCategoryDialog(tx)}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 transition-opacity ${catBg || 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        {cat?.icon} {cat?.label || tx.category}
                      </button>
                    )
                  })() : (
                    <button
                      onClick={() => setCategoryDialog(tx)}
                      className="text-[10px] text-[var(--text-muted)] px-2 py-0.5 rounded-md border border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3" />
                      קטגוריה
                    </button>
                  )}
                </div>

                {/* Amount */}
                <div className="text-left min-w-[100px]">
                  <p className="text-[15px] font-bold text-emerald-600">
                    +{formatCurrency(tx.credit)}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 min-w-[80px]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-[12px] font-medium ${statusTextColor}`}>{statusLabel}</span>
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(tx)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={!!categoryDialog} onOpenChange={() => setCategoryDialog(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך קטגוריית הכנסה</DialogTitle>
          </DialogHeader>
          {categoryDialog && (
            <div className="space-y-3 mt-2">
              <div className="p-3 rounded-lg bg-[var(--surface-hover)] text-sm">
                <p className="font-medium truncate">{categoryDialog.description}</p>
                <p className="text-emerald-600 font-bold mt-1">+{formatCurrency(categoryDialog.credit)}</p>
              </div>
              {categoryDialog.category && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
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
                          const bgClass = CATEGORY_BG_COLORS[cat.color] || ''
                          return (
                            <button
                              key={cat.value}
                              onClick={() => handleSetCategory(categoryDialog.id, cat.value)}
                              className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-sm text-right ${
                                isActive
                                  ? `${bgClass} font-medium`
                                  : 'hover:bg-[var(--surface-hover)]'
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
              <div className="p-3 rounded-lg bg-[var(--surface-hover)] text-sm">
                <p className="font-medium">{editTx.description}</p>
                <p className="text-green-600 font-bold mt-1">+{formatCurrency(editTx.credit)}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{formatDate(editTx.transaction_date)}</p>
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
