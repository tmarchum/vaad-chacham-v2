import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormSelect } from '@/components/common/FormField'
import { formatCurrency, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_GROUPS, INCOME_GROUPS, findExpenseCategory, findIncomeCategory, CATEGORY_BG_COLORS, CATEGORY_GRADIENTS } from '@/lib/categories'
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Landmark, Link2, X as XIcon,
  CheckCircle2, AlertCircle, Filter, ChevronDown, Check, Tag,
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
  unmatched:  { label: 'לא משויך', variant: 'warning', icon: AlertCircle },
  suggested:  { label: 'הצעה',     variant: 'outline',  icon: AlertCircle },
  matched:    { label: 'משויך',     variant: 'success', icon: CheckCircle2 },
  ignored:    { label: 'התעלם',     variant: 'secondary', icon: XIcon },
  excluded:   { label: 'לא רלוונטי', variant: 'destructive', icon: XIcon },
}

const STATUS_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'unmatched', label: 'לא משויך' },
  { key: 'suggested', label: 'הצעות' },
  { key: 'matched', label: 'משויך' },
  { key: 'ignored', label: 'התעלם' },
  { key: 'excluded', label: 'לא רלוונטי' },
]

const TYPE_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'credit', label: 'זיכויים' },
  { key: 'debit', label: 'חיובים' },
]

export default function BankTransactions() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allTx, update: updateTx, refresh } = useCollection('bankTransactions')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')
  const { data: allPayments, create: createPayment, update: updatePayment, refresh: refreshPayments } = useCollection('payments')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [matchDialog, setMatchDialog] = useState(null) // transaction to match
  const [paymentSummaryOpen, setPaymentSummaryOpen] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState(null) // transaction to categorize

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
  const filteredTx = useMemo(() => {
    let result = transactions
    if (statusFilter !== 'all') {
      result = result.filter(tx => tx.match_status === statusFilter)
    }
    if (typeFilter === 'credit') {
      result = result.filter(tx => Number(tx.credit) > 0)
    } else if (typeFilter === 'debit') {
      result = result.filter(tx => Number(tx.debit) > 0)
    }
    return result
  }, [transactions, statusFilter, typeFilter])

  // Summary (exclude 'excluded' and 'suggested' from totals)
  const summary = useMemo(() => {
    const activeTx = transactions.filter(tx => tx.match_status !== 'excluded' && tx.match_status !== 'suggested')
    const totalCredit = activeTx.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)
    const totalDebit = activeTx.reduce((s, tx) => s + (Number(tx.debit) || 0), 0)
    const matched = transactions.filter(tx => tx.match_status === 'matched').length
    const unmatched = transactions.filter(tx => tx.match_status === 'unmatched').length
    const suggested = transactions.filter(tx => tx.match_status === 'suggested').length
    return { totalCredit, totalDebit, matched, unmatched, suggested, total: transactions.length }
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

  // Sync payment record — totalPaid is passed directly to avoid stale closure
  const syncPayment = async (unitId, month, totalPaid) => {
    const unit = units.find(u => u.id === unitId)
    const fee = calcUnitFee(unit, selectedBuilding)
    const status = totalPaid >= fee ? 'paid' : totalPaid > 0 ? 'partial' : 'pending'

    const existingPayment = allPayments.find(p =>
      (p.unit_id || p.unitId) === unitId && p.month === month
    )

    if (existingPayment) {
      await updatePayment(existingPayment.id, {
        amount: totalPaid,
        status,
        paid_at: totalPaid > 0 ? new Date().toISOString().split('T')[0] : null,
        method: 'הוראת קבע',
      })
    } else if (totalPaid > 0) {
      await createPayment({
        building_id: selectedBuilding.id,
        unit_id: unitId,
        amount: totalPaid,
        month,
        status,
        paid_at: new Date().toISOString().split('T')[0],
        method: 'הוראת קבע',
      })
    }
    refreshPayments()
  }

  // Extract name parts from a transaction description for matching
  const GENERIC_WORDS = ['זיכוי', 'מיידי', 'מבנק', 'העברה', 'תשלום', 'הפקדה', 'שיק', 'צק']
  const extractNameParts = (desc) => {
    if (!desc) return []
    // Remove common prefixes like "זיכוי מבל"ל מ", "זיכוי מדיסקונט מ"
    const cleaned = desc
      .replace(/זיכוי\s+מ[^\s]*\s+מ/g, '')
      .replace(/[,."'\/\\]/g, ' ')
      .replace(/\d{5,}/g, '') // remove long numbers (reference IDs)
      .trim()
    return cleaned.split(/\s+/).filter(p => p.length > 2 && !GENERIC_WORDS.includes(p))
  }

  // Match a transaction to a unit + auto-match related transactions by name
  const handleMatch = async (unitId) => {
    if (!matchDialog) return
    await updateTx(matchDialog.id, {
      unit_id: unitId,
      match_status: 'matched',
      month: monthKey,
    })

    // Track all matched credits per month so we can compute totals
    // Start with existing matched transactions from state (still valid, we only added new ones)
    const creditsByMonth = {}
    allTx.filter(tx =>
      tx.building_id === selectedBuilding?.id &&
      tx.match_status === 'matched' &&
      tx.unit_id === unitId
    ).forEach(tx => {
      const m = tx.month || monthKey
      creditsByMonth[m] = (creditsByMonth[m] || 0) + (Number(tx.credit) || 0)
    })
    // Add the transaction we just matched
    creditsByMonth[monthKey] = (creditsByMonth[monthKey] || 0) + (Number(matchDialog.credit) || 0)

    // Auto-match other unmatched transactions with same name parts
    // Only if we have at least 2 meaningful name parts (not generic descriptions)
    const nameParts = extractNameParts(matchDialog.description)

    if (nameParts.length >= 2) {
      const unit = allUnits.find(u => u.id === unitId)
      const building = selectedBuilding
      const fee = unit && building ? calcUnitFee(unit, building) : 0

      const unmatchedCredits = allTx.filter(tx =>
        tx.building_id === selectedBuilding?.id &&
        tx.match_status === 'unmatched' &&
        Number(tx.credit) > 0 &&
        tx.id !== matchDialog.id
      )

      let autoCount = 0
      for (const tx of unmatchedCredits) {
        const credit = Number(tx.credit) || 0
        // Skip if amount is more than 2x the unit's fee
        if (fee > 0 && credit > fee * 2) continue
        const txParts = extractNameParts(tx.description)
        if (txParts.length < 2) continue // Skip generic descriptions
        const overlap = nameParts.filter(p =>
          p.length >= 3 && txParts.some(tp => tp.length >= 3 && (tp.includes(p) || p.includes(tp)))
        )
        if (overlap.length >= 2) {
          await updateTx(tx.id, { unit_id: unitId, match_status: 'matched' })
          const m = tx.month || monthKey
          creditsByMonth[m] = (creditsByMonth[m] || 0) + credit
          autoCount++
        }
      }

      if (autoCount > 0) {
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { message: `שויכו ${autoCount} תנועות נוספות אוטומטית`, type: 'success' }
        }))
      }
    }

    setMatchDialog(null)
    await refresh()

    // Sync payments for all affected months with pre-computed totals
    for (const [month, total] of Object.entries(creditsByMonth)) {
      await syncPayment(unitId, month, total)
    }
  }

  // Ignore a transaction
  const handleIgnore = async (tx) => {
    await updateTx(tx.id, { match_status: 'ignored' })
    refresh()
  }

  // Exclude a transaction (not relevant — returned check, fee, etc.)
  const handleExclude = async (tx) => {
    await updateTx(tx.id, { match_status: 'excluded', unit_id: null })
    refresh()
  }

  // Approve a suggestion — convert to matched and sync payment
  const handleApproveSuggestion = async (tx) => {
    await updateTx(tx.id, { match_status: 'matched' })

    // Compute total for this unit+month and sync payment
    const unitId = tx.unit_id
    const creditsByMonth = {}
    allTx.filter(t =>
      t.building_id === selectedBuilding?.id &&
      t.match_status === 'matched' &&
      t.unit_id === unitId
    ).forEach(t => {
      const m = t.month || monthKey
      creditsByMonth[m] = (creditsByMonth[m] || 0) + (Number(t.credit) || 0)
    })
    // Add this tx
    const m = tx.month || monthKey
    creditsByMonth[m] = (creditsByMonth[m] || 0) + (Number(tx.credit) || 0)

    await refresh()
    for (const [month, total] of Object.entries(creditsByMonth)) {
      await syncPayment(unitId, month, total)
    }
  }

  // Reject a suggestion — revert to unmatched
  const handleRejectSuggestion = async (tx) => {
    await updateTx(tx.id, { match_status: 'unmatched', unit_id: null })
    refresh()
  }

  // Unmatch a transaction
  const handleUnmatch = async (tx) => {
    const unitId = tx.unit_id
    await updateTx(tx.id, { unit_id: null, match_status: 'unmatched' })

    // Recalculate total for this unit, minus the unmatched tx
    if (unitId) {
      const remaining = allTx.filter(t =>
        t.building_id === selectedBuilding?.id &&
        t.match_status === 'matched' &&
        t.unit_id === unitId &&
        t.month === monthKey &&
        t.id !== tx.id
      ).reduce((s, t) => s + (Number(t.credit) || 0), 0)
      await refresh()
      await syncPayment(unitId, monthKey, remaining)
    } else {
      await refresh()
    }
  }

  // Auto-match: try to match unmatched credits to units by resident name
  const handleAutoMatch = async () => {
    const unmatched = transactions.filter(tx => tx.match_status === 'unmatched' && Number(tx.credit) > 0)
    let matched = 0

    for (const tx of unmatched) {
      const desc = (tx.description || '').toLowerCase()
      const fee = calcUnitFee(tx, selectedBuilding)
      // Skip high-amount transactions (likely not regular payments)
      if (Number(tx.credit) > 1500) continue
      // Try to find a unit whose resident name appears in the transaction description
      for (const unit of units) {
        const name = residentMap[unit.id]
        if (!name) continue
        const parts = name.split(' ').filter(p => p.length >= 3)
        const matchingParts = parts.filter(part => desc.includes(part.toLowerCase()))
        // Require at least 2 matching name parts (first + last name)
        if (parts.length >= 2 && matchingParts.length >= 2) {
          const unitFee = calcUnitFee(unit, selectedBuilding)
          if (Number(tx.credit) > unitFee * 2) continue
          await updateTx(tx.id, { unit_id: unit.id, match_status: 'matched', month: monthKey })
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

  // Assign a category to a transaction
  const handleSetCategory = async (txId, category) => {
    await updateTx(txId, { category })
    setCategoryDialog(null)
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
      <PageHeader
        icon={ArrowLeftRight}
        iconColor="indigo"
        title="תנועות בנק"
        subtitle="צפייה בתנועות, שיוך לדירות ומעקב תשלומים"
        actions={
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
        }
      />

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
        <div className="flex gap-1 mr-auto flex-wrap">
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
          <span className="mx-1 border-r border-[var(--border)]" />
          {TYPE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                typeFilter === f.key
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
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                <ArrowDownLeft className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">סה"כ זכות</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(summary.totalCredit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm">
                <ArrowUpRight className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">סה"כ חובה</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalDebit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">משויכות</p>
                <p className="text-lg font-bold text-blue-600">{summary.matched} / {summary.total}</p>
                <div className="h-1 w-full rounded-full bg-slate-100 mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: summary.total > 0 ? `${Math.round((summary.matched / summary.total) * 100)}%` : '0%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm">
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">ממתינות לשיוך</p>
                <p className="text-lg font-bold text-amber-600">{summary.unmatched}</p>
              </div>
            </div>
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
            const matchedUnit = tx.unit_id ? units.find(u => u.id === tx.unit_id) : null
            const matchedResident = matchedUnit ? residentMap[matchedUnit.id] : null

            // Gradient colors based on type
            const circleGradient = isCredit
              ? 'from-emerald-500 to-emerald-600'
              : 'from-red-500 to-red-600'

            // Status dot colors
            const dotColorMap = {
              matched: 'bg-emerald-500',
              suggested: 'bg-blue-500',
              unmatched: 'bg-amber-500',
              ignored: 'bg-slate-400',
              excluded: 'bg-red-400',
            }
            const dotColor = dotColorMap[tx.match_status] || dotColorMap.unmatched

            // Status text colors
            const statusTextColorMap = {
              matched: 'text-emerald-700',
              suggested: 'text-blue-700',
              unmatched: 'text-amber-700',
              ignored: 'text-slate-600',
              excluded: 'text-red-600',
            }
            const statusTextColor = statusTextColorMap[tx.match_status] || statusTextColorMap.unmatched

            return (
              <div
                key={tx.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
              >
                {/* Type circle */}
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${circleGradient} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                  {isCredit
                    ? <ArrowDownLeft className="h-5 w-5" />
                    : <ArrowUpRight className="h-5 w-5" />
                  }
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {tx.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>{new Date(tx.transaction_date).toLocaleDateString('he-IL')}</span>
                    {tx.transaction_time && <span>{tx.transaction_time}</span>}
                    {tx.source && <span>{tx.source}</span>}
                  </div>
                </div>

                {/* Match info */}
                {matchedUnit && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="text-xs font-medium text-emerald-700">
                      דירה {matchedUnit.number}
                    </span>
                    {matchedResident && (
                      <span className="text-xs text-emerald-600">- {matchedResident}</span>
                    )}
                  </div>
                )}

                {/* Category chip */}
                <div className="hidden sm:block shrink-0" onClick={e => e.stopPropagation()}>
                  {tx.category ? (() => {
                    const cat = isCredit ? findIncomeCategory(tx.category) : findExpenseCategory(tx.category)
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
                <div className="text-left min-w-[90px]">
                  <p className={`text-[15px] font-bold ${
                    isCredit ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {isCredit ? '+' : '-'}{formatCurrency(amount)}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 min-w-[80px]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-[12px] font-medium ${statusTextColor}`}>{status.label}</span>
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {tx.match_status === 'unmatched' && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => setMatchDialog(tx)} title="שייך לדירה">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleIgnore(tx)} title="התעלם">
                        <XIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleExclude(tx)} title="לא רלוונטי">
                        <XIcon className="h-3.5 w-3.5 text-[var(--danger)]" />
                      </Button>
                    </>
                  )}
                  {tx.match_status === 'suggested' && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => handleApproveSuggestion(tx)} title="אשר הצעה">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleRejectSuggestion(tx)} title="דחה הצעה">
                        <XIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setMatchDialog(tx)} title="שייך לדירה אחרת">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {tx.match_status === 'matched' && (
                    <Button size="icon" variant="ghost" onClick={() => handleUnmatch(tx)} title="בטל שיוך">
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(tx.match_status === 'ignored' || tx.match_status === 'excluded') && (
                    <Button size="icon" variant="ghost" onClick={() => handleUnmatch(tx)} title="החזר">
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
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
                {units.map(unit => {
                  const fee = calcUnitFee(unit, selectedBuilding)
                  const matchedTxForUnit = transactions.filter(tx =>
                    tx.match_status === 'matched' && tx.unit_id === unit.id
                  )
                  const alreadyPaid = matchedTxForUnit.reduce((s, tx) => s + (Number(tx.credit) || 0), 0)
                  const remaining = fee - alreadyPaid
                  const isPaid = alreadyPaid >= fee

                  return (
                    <button
                      key={unit.id}
                      onClick={() => handleMatch(unit.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-sm ${
                        isPaid ? 'opacity-40' : ''
                      }`}
                    >
                      <span>
                        דירה {unit.number} — {residentMap[unit.id] || 'ללא דייר'}
                        {alreadyPaid > 0 && !isPaid && (
                          <span className="text-xs text-amber-500 mr-1">
                            (שולם {formatCurrency(alreadyPaid)}, חסר {formatCurrency(remaining)})
                          </span>
                        )}
                        {isPaid && (
                          <span className="text-xs text-green-500 mr-1">(שולם מלא)</span>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {formatCurrency(fee)}/חודש
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={!!categoryDialog} onOpenChange={() => setCategoryDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך קטגוריה</DialogTitle>
          </DialogHeader>
          {categoryDialog && (() => {
            const isCredit = Number(categoryDialog.credit) > 0
            const categories = isCredit ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
            const groups = isCredit ? INCOME_GROUPS : EXPENSE_GROUPS
            return (
              <div className="space-y-3 mt-2">
                <div className="p-3 rounded-lg bg-[var(--surface-hover)] text-sm">
                  <p className="font-medium truncate">{categoryDialog.description}</p>
                  <p className={`font-bold mt-1 ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : '-'}{formatCurrency(categoryDialog.credit || categoryDialog.debit)}
                  </p>
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
                  {groups.map(group => {
                    const groupCats = categories.filter(c => c.group === group.key)
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
            )
          })()}
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
                      {status === 'paid' ? 'שולם' : status === 'partial' ? `חלקי (פער: ${formatCurrency(fee - totalPaid)})` : 'לא שולם'}
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
