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
import {
  ArrowDownLeft, Landmark, Pencil, CheckCircle2,
} from 'lucide-react'

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' }, { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' }, { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' }, { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' }, { value: '12', label: 'דצמבר' },
]

export default function BankIncome() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx, update, refresh } = useCollection('bankTransactions')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [search, setSearch] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [editNotes, setEditNotes] = useState('')

  const monthKey = `${selectedYear}-${selectedMonth}`

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  // Credits only for this building and month
  const incomeList = useMemo(() => {
    let result = allTx.filter(tx =>
      tx.building_id === selectedBuilding?.id &&
      tx.month === monthKey &&
      Number(tx.credit) > 0
    )

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(tx =>
        tx.description?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q)
      )
    }

    return result.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
  }, [allTx, selectedBuilding, monthKey, search])

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

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לצפות בהכנסות" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">הכנסות</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          זיכויים מתנועות בנק — דמי ועד ותשלומים נכנסים
        </p>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי תיאור..." />

      {/* Filters */}
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

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-[var(--text-secondary)]">סה״כ הכנסות החודש</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-[var(--text-secondary)]">מספר תנועות</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.count}</p>
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
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">תאריך</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">תיאור</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">סכום</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">שיוך</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">הערות</th>
                  <th className="text-right p-3 font-medium text-[var(--text-secondary)]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {incomeList.map(tx => {
                  const isMatched = tx.match_status === 'matched'
                  return (
                    <tr key={tx.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="p-3">{tx.transaction_date ? formatDate(tx.transaction_date) : '-'}</td>
                      <td className="p-3">{tx.description || '-'}</td>
                      <td className="p-3 font-bold text-green-600">+{formatCurrency(tx.credit)}</td>
                      <td className="p-3">
                        {isMatched ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            משויך
                          </Badge>
                        ) : (
                          <Badge variant="warning">לא משויך</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                        {tx.notes || '-'}
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(tx)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Notes Dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-sm">
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
