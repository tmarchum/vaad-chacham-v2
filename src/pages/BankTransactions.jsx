import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormSelect } from '@/components/common/FormField'
import { formatCurrency, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import {
  ArrowDownLeft, ArrowUpRight, Landmark, Link2, X as XIcon,
  CheckCircle2, AlertCircle, Filter, ChevronDown,
} from 'lucide-react'

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' }, { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' }, { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' }, { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' }, { value: '12', label: 'דצמבר' },
]

const MATCH_STATUS = {
  unmatched: { label: 'לא משויך', variant: 'warning', icon: AlertCircle },
  matched:   { label: 'משויך',     variant: 'success', icon: CheckCircle2 },
  ignored:   { label: 'התעלם',     variant: 'secondary', icon: XIcon },
}

const STATUS_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'unmatched', label: 'לא משויך' },
  { key: 'matched', label: 'משויך' },
  { key: 'ignored', label: 'התעלם' },
]

export default function BankTransactions() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx, update, refresh } = useCollection('bankTransactions')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')
  const { data: allPayments, create: createPayment } = useCollection('payments')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [matchDialog, setMatchDialog] = useState(null) // transaction to match
  const [paymentSummaryOpen, setPaymentSummaryOpen] = useState(false)

  const monthKey = `${selectedYear}-${selectedMonth}`

  // Building units (sorted by number)
  const units = useMemo(() =>
    allUnits.filter(u => u.building_id === selectedBuilding?.id).sort(sortByUnitNumber),
    [allUnits, selectedBuilding]
  )

  // Residents map: unit_id -> resident name
  const residentMap = useMemo(() => {
    const map = {}
    allResidents.forEach(r => {
      if (r.is_primary || !map[r.unit_id]) {
        map[r.unit_id] = `${r.first_name || ''} ${r.last_name || ''}`.trim()
      }
    })
    return map
  }, [allResidents])

  // Transactions for this building and month
  const transactions = useMemo(() => {
    return allTx
      .filter(tx =>
        tx.building_id === selectedBuilding?.id &&
        tx.month === monthKey
      )
      .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
  }, [allTx, selectedBuilding, monthKey])

  // Filtered transactions
  const filteredTx = useMemo(() =>
    statusFilter === 'all'
      ? transactions
      : transactions.filter(tx => tx.match_status === statusFilter),
    [transactions, statusFilter]
  )

  // Summary
  const summary = useMemo(() => {
    const totalCredit = transactions.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)
    const totalDebit = transactions.reduce((s, tx) => s + (Number(tx.debit) || 0), 0)
    const matched = transactions.filter(tx => tx.match_status === 'matched').length
    const unmatched = transactions.filter(tx => tx.match_status === 'unmatched').length
    return { totalCredit, totalDebit, matched, unmatched, total: transactions.length }
  }, [transactions])

  // Payment tracking: which units paid this month
  const paymentTracking = useMemo(() => {
    const monthPayments = allPayments.filter(p =>
      p.building_id === selectedBuilding?.id && p.month === monthKey
    )
    const matchedTx = transactions.filter(tx => tx.match_status === 'matched' && tx.unit_id)

    return units.map(unit => {
      const fee = calcUnitFee(unit, selectedBuilding)
      const resident = residentMap[unit.id] || 'ללא דייר'
      const payment = monthPayments.find(p => p.unit_id === unit.id)
      const txForUnit = matchedTx.filter(tx => tx.unit_id === unit.id)
      const totalPaid = txForUnit.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)

      let status = 'unpaid'
      if (payment?.status === 'paid' || totalPaid >= fee) status = 'paid'
      else if (totalPaid > 0 && totalPaid < fee) status = 'partial'

      return { unit, resident, fee, totalPaid, status, payment, txCount: txForUnit.length }
    })
  }, [units, transactions, allPayments, selectedBuilding, monthKey, residentMap])

  // Match a transaction to a unit
  const handleMatch = async (unitId) => {
    if (!matchDialog) return
    await update(matchDialog.id, {
      unit_id: unitId,
      match_status: 'matched',
      month: monthKey,
    })
    setMatchDialog(null)
    refresh()
  }

  // Ignore a transaction
  const handleIgnore = async (tx) => {
    await update(tx.id, { match_status: 'ignored' })
    refresh()
  }

  // Unmatch a transaction
  const handleUnmatch = async (tx) => {
    await update(tx.id, { unit_id: null, match_status: 'unmatched' })
    refresh()
  }

  // Auto-match: try to match unmatched credits to units by resident name
  const handleAutoMatch = async () => {
    const unmatched = transactions.filter(tx => tx.match_status === 'unmatched' && Number(tx.credit) > 0)
    let matched = 0

    for (const tx of unmatched) {
      const desc = (tx.description || '').toLowerCase()
      // Try to find a unit whose resident name appears in the transaction description
      for (const unit of units) {
        const name = residentMap[unit.id]
        if (!name) continue
        const parts = name.split(' ').filter(p => p.length > 2)
        if (parts.some(part => desc.includes(part.toLowerCase()))) {
          await update(tx.id, { unit_id: unit.id, match_status: 'matched', month: monthKey })
          matched++
          break
        }
      }
    }

    if (matched > 0) {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: `שויכו ${matched} תנועות אוטומטית`, type: 'success' }
      }))
    } else {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: { message: 'לא נמצאו התאמות אוטומטיות', type: 'warning' }
      }))
    }
    refresh()
  }

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לצפות בתנועות" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">תנועות בנק</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            צפייה בתנועות, שיוך לדירות ומעקב תשלומים
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAutoMatch} className="gap-2">
            <Link2 className="h-4 w-4" />
            שיוך אוטומטי
          </Button>
          <Button variant="outline" onClick={() => setPaymentSummaryOpen(true)} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            סיכום תשלומים
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <FormSelect
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          options={HEBREW_MONTHS}
          className="w-32"
        />
        <FormSelect
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={yearOptions}
          className="w-24"
        />
        <div className="flex gap-1 mr-auto">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                statusFilter === f.key
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-[var(--text-secondary)]">סה"כ זכות</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(summary.totalCredit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-[var(--text-secondary)]">סה"כ חובה</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalDebit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-[var(--text-secondary)]">משויכות</p>
            <p className="text-lg font-bold text-blue-600">{summary.matched} / {summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-[var(--text-secondary)]">ממתינות לשיוך</p>
            <p className="text-lg font-bold text-amber-600">{summary.unmatched}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions list */}
      {filteredTx.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="אין תנועות"
          description={`לא נמצאו תנועות ל${HEBREW_MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`}
        />
      ) : (
        <div className="space-y-2">
          {filteredTx.map(tx => {
            const isCredit = Number(tx.credit) > 0
            const amount = isCredit ? tx.credit : tx.debit
            const status = MATCH_STATUS[tx.match_status] || MATCH_STATUS.unmatched
            const StatusIcon = status.icon
            const matchedUnit = tx.unit_id ? units.find(u => u.id === tx.unit_id) : null
            const matchedResident = matchedUnit ? residentMap[matchedUnit.id] : null

            return (
              <Card key={tx.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isCredit ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      {isCredit
                        ? <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        : <ArrowUpRight className="h-4 w-4 text-red-600" />
                      }
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span>{new Date(tx.transaction_date).toLocaleDateString('he-IL')}</span>
                        {tx.transaction_time && <span>{tx.transaction_time}</span>}
                        {tx.source && <span>| {tx.source}</span>}
                      </div>
                    </div>

                    {/* Match info */}
                    <div className="flex items-center gap-2">
                      {matchedUnit && (
                        <Badge variant="outline" className="text-xs">
                          דירה {matchedUnit.number} {matchedResident ? `- ${matchedResident}` : ''}
                        </Badge>
                      )}
                      <Badge variant={status.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>

                    {/* Amount */}
                    <p className={`text-sm font-bold min-w-[80px] text-left ${
                      isCredit ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isCredit ? '+' : '-'}{formatCurrency(amount)}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      {tx.match_status === 'unmatched' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setMatchDialog(tx)} title="שייך לדירה">
                            <Link2 className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleIgnore(tx)} title="התעלם">
                            <XIcon className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {tx.match_status === 'matched' && (
                        <Button size="sm" variant="outline" onClick={() => handleUnmatch(tx)} title="בטל שיוך">
                          <XIcon className="h-3 w-3" />
                        </Button>
                      )}
                      {tx.match_status === 'ignored' && (
                        <Button size="sm" variant="outline" onClick={() => handleUnmatch(tx)} title="החזר">
                          <Link2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Match Dialog */}
      <Dialog open={!!matchDialog} onOpenChange={() => setMatchDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך תנועה לדירה</DialogTitle>
          </DialogHeader>
          {matchDialog && (
            <div className="space-y-3 mt-2">
              <div className="p-3 rounded-lg bg-[var(--surface-hover)] text-sm">
                <p className="font-medium">{matchDialog.description}</p>
                <p className="text-green-600 font-bold mt-1">
                  {formatCurrency(matchDialog.credit || matchDialog.debit)}
                </p>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">בחר דירה:</p>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {units.filter(unit => {
                  // Hide units that already have a matched transaction this month
                  const alreadyMatched = transactions.some(tx =>
                    tx.match_status === 'matched' && tx.unit_id === unit.id
                  )
                  return !alreadyMatched
                }).map(unit => (
                  <button
                    key={unit.id}
                    onClick={() => handleMatch(unit.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-sm"
                  >
                    <span>דירה {unit.number} — {residentMap[unit.id] || 'ללא דייר'}</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatCurrency(calcUnitFee(unit, selectedBuilding))}/חודש
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Summary Dialog */}
      <Dialog open={paymentSummaryOpen} onOpenChange={setPaymentSummaryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              סיכום תשלומים — {HEBREW_MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                <p className="text-xs text-[var(--text-secondary)]">שילמו</p>
                <p className="text-lg font-bold text-green-600">
                  {paymentTracking.filter(p => p.status === 'paid').length}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <p className="text-xs text-[var(--text-secondary)]">חלקי</p>
                <p className="text-lg font-bold text-amber-600">
                  {paymentTracking.filter(p => p.status === 'partial').length}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                <p className="text-xs text-[var(--text-secondary)]">לא שילמו</p>
                <p className="text-lg font-bold text-red-600">
                  {paymentTracking.filter(p => p.status === 'unpaid').length}
                </p>
              </div>
            </div>

            {/* Unit list */}
            <div className="max-h-80 overflow-y-auto space-y-1">
              {paymentTracking.map(({ unit, resident, fee, totalPaid, status }) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      status === 'paid' ? 'bg-green-500' :
                      status === 'partial' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">דירה {unit.number}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{resident}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${
                      status === 'paid' ? 'text-green-600' :
                      status === 'partial' ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(totalPaid)} / {formatCurrency(fee)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {status === 'paid' ? 'שולם' : status === 'partial' ? 'חלקי' : 'לא שולם'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
