import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { TabGroup } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SearchBar } from '@/components/common/SearchBar'
import { formatCurrency, calcUnitFee, sortByUnitNumber } from '@/lib/utils'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_GROUPS, INCOME_GROUPS, findExpenseCategory, findIncomeCategory } from '@/lib/categories'
import {
  ArrowDownLeft, ArrowUpRight, Landmark, Link2, X as XIcon,
  CheckCircle2, AlertCircle, Check, Tag, Ban, Undo2, Users, ChevronLeft, Repeat,
} from 'lucide-react'
import { HEBREW_MONTH_OPTIONS as HEBREW_MONTHS } from '@/lib/constants'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'
import { loadPatterns, learnPattern, learnFromExisting, unitForTransaction, describePattern, deactivatePattern } from '@/lib/incomePatterns'

const MATCH_STATUS = {
  unmatched:  { label: 'לא משויך', variant: 'warning', icon: AlertCircle },
  suggested:  { label: 'הצעה',     variant: 'info',    icon: AlertCircle },
  matched:    { label: 'משויך',     variant: 'success', icon: CheckCircle2 },
  ignored:    { label: 'התעלם',     variant: 'neutral', icon: XIcon },
  excluded:   { label: 'לא רלוונטי', variant: 'danger', icon: XIcon },
}

const PAY_STATUS = {
  paid:    { label: 'שולם', variant: 'success' },
  partial: { label: 'חלקי', variant: 'warning' },
  unpaid:  { label: 'לא שולם', variant: 'danger' },
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
  const { user } = useAuth()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allTx, update: updateTx, bulkUpdate: bulkUpdateTx, refresh, isLoading } = useCollection('bankTransactions', scope)
  const { data: allUnits } = useCollection('units', scope)
  const directory = useUnitDirectory(selectedBuilding?.id)
  const { data: allPayments, create: createPayment, update: updatePayment, refresh: refreshPayments } = useCollection('payments', scope)

  const now = new Date()
  const confirm = useConfirm()
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [matchDialog, setMatchDialog] = useState(null) // transaction to match
  // Learned rules for recurring nameless credits (see src/lib/incomePatterns.js)
  const [patterns, setPatterns] = useState([])
  const reloadPatterns = useCallback(async () => {
    setPatterns(await loadPatterns(selectedBuilding?.id))
  }, [selectedBuilding?.id])
  useEffect(() => { reloadPatterns() }, [reloadPatterns])
  const [paymentSummaryOpen, setPaymentSummaryOpen] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState(null) // transaction to categorize
  const [search, setSearch] = useState('')

  const monthKey = `${selectedYear}-${selectedMonth}`

  // Building units (sorted by number)
  const units = useMemo(() =>
    allUnits.filter(u => u.building_id === selectedBuilding?.id).sort(sortByUnitNumber),
    [allUnits, selectedBuilding]
  )

  // Residents map: unit_id -> primary resident name (from the shared unit directory)
  const residentMap = useMemo(() => {
    const map = {}
    directory.units.forEach(u => { if (u.name) map[u.id] = u.name })
    return map
  }, [directory.units])

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
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(tx =>
        tx.description?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q)
      )
    }
    return result
  }, [transactions, statusFilter, typeFilter, search])

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

    // Silent: this runs once per affected unit+month, so approving a batch
    // would otherwise raise a toast per unit. The caller shows one summary.
    if (existingPayment) {
      await updatePayment(existingPayment.id, {
        amount: totalPaid,
        status,
        paid_at: totalPaid > 0 ? new Date().toISOString().split('T')[0] : null,
        method: 'הוראת קבע',
      }, { silent: true })
    } else if (totalPaid > 0) {
      await createPayment({
        building_id: selectedBuilding.id,
        unit_id: unitId,
        amount: totalPaid,
        month,
        status,
        paid_at: new Date().toISOString().split('T')[0],
        method: 'הוראת קבע',
      }, { silent: true })
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
      .replace(/[,."'/\\]/g, ' ')
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
          await updateTx(tx.id, { unit_id: unitId, match_status: 'matched' }, { silent: true })
          const m = tx.month || monthKey
          creditsByMonth[m] = (creditsByMonth[m] || 0) + credit
          autoCount++
        }
      }

      if (autoCount > 0) {
        toast(`שויכו ${autoCount} תנועות נוספות אוטומטית`)
      }
    }

    // Remember the SHAPE of this credit (day of month + amount + description)
    // so next month's identical one lands on this apartment by itself. This is
    // what finally matches standing orders that carry no name.
    const learned = await learnPattern({
      buildingId: selectedBuilding?.id,
      unitId,
      tx: matchDialog,
      userId: user?.id || null,
    })
    if (learned?.conflict) {
      // Two apartments, identical nameless credit — no rule can tell them
      // apart, so say so rather than pretend the next one will be matched.
      toast('דירה אחרת כבר משלמת אותו סכום באותו יום ללא שם — הכלל האוטומטי בוטל, התנועות האלה יישארו לשיוך ידני', 'warning')
    } else if (learned) {
      // Apply it right away to credits already sitting unmatched.
      const byRule = allTx.filter(tx =>
        tx.building_id === selectedBuilding?.id &&
        tx.match_status === 'unmatched' &&
        Number(tx.credit) > 0 &&
        tx.id !== matchDialog.id &&
        unitForTransaction([learned], tx) === unitId
      )
      for (const tx of byRule) {
        await updateTx(tx.id, { unit_id: unitId, match_status: 'matched' }, { silent: true })
        const m = tx.month || monthKey
        creditsByMonth[m] = (creditsByMonth[m] || 0) + (Number(tx.credit) || 0)
      }
      toast(byRule.length
        ? `נלמד כלל: ${describePattern(learned)} — שויכו ${byRule.length} תנועות קודמות`
        : `נלמד כלל: ${describePattern(learned)} — יחול אוטומטית בחודשים הבאים`)
      await reloadPatterns()
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
    await refresh()
  }

  // Exclude a transaction (not relevant — returned check, fee, etc.)
  const handleExclude = async (tx) => {
    await updateTx(tx.id, { match_status: 'excluded', unit_id: null })
    await refresh()
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

  // Approve ALL pending suggestions in one click — marks them matched and
  // syncs payments once per affected unit+month (instead of 24 separate taps).
  const handleApproveAllSuggestions = async () => {
    const pending = allTx.filter(t =>
      t.building_id === selectedBuilding?.id && t.match_status === 'suggested' && t.unit_id)
    if (pending.length === 0) {
      toast('אין הצעות ממתינות', 'info')
      return
    }
    if (!await confirm({
      title: 'אישור כל ההצעות',
      description: `${pending.length} שיוכים מוצעים יאושרו, והתשלומים יעודכנו בהתאם.`,
      confirmText: 'אשר הכל',
    })) return

    // One request, one toast — the per-row loop here flooded the screen.
    await bulkUpdateTx(pending.map(t => t.id), { match_status: 'matched' }, { silent: true })
    // Recompute unit+month totals over matched + just-approved rows.
    const approvedIds = new Set(pending.map(t => t.id))
    const creditsByUnitMonth = {}
    allTx.filter(t =>
      t.building_id === selectedBuilding?.id && t.unit_id &&
      (t.match_status === 'matched' || approvedIds.has(t.id))
    ).forEach(t => {
      const key = `${t.unit_id}|${t.month || monthKey}`
      creditsByUnitMonth[key] = (creditsByUnitMonth[key] || 0) + (Number(t.credit) || 0)
    })
    const affectedUnits = new Set(pending.map(t => t.unit_id))
    for (const [key, total] of Object.entries(creditsByUnitMonth)) {
      const [unitId, month] = key.split('|')
      if (affectedUnits.has(unitId)) await syncPayment(unitId, month, total)
    }
    await refresh()
    toast(`אושרו ${pending.length} שיוכים ✓`)
  }

  // Reject a suggestion — revert to unmatched
  const handleRejectSuggestion = async (tx) => {
    await updateTx(tx.id, { match_status: 'unmatched', unit_id: null, match_reason: null })
    await refresh()
  }

  // Unmatch a transaction
  const handleUnmatch = async (tx) => {
    const unitId = tx.unit_id
    await updateTx(tx.id, { unit_id: null, match_status: 'unmatched', match_reason: null })

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
  // Deterministic, explainable scoring of a transaction against a unit.
  // (Deterministic on purpose — financial matching must not be hallucinated.)
  const scoreTxUnit = (tx, unit) => {
    const desc = (tx.description || '').toLowerCase()
    const txParts = extractNameParts(tx.description).map(p => p.toLowerCase())
    const name = residentMap[unit.id] || ''
    const nameParts = name.split(/\s+/).filter(p => p.length >= 3).map(p => p.toLowerCase())
    const hit = (np) => desc.includes(np) || txParts.some(tp => tp.includes(np) || np.includes(tp))
    const nameHits = nameParts.filter(hit).length
    // A surname is evidence; a given name on its own is barely a hint — "רחל"
    // or "משה" matches half the building. Keeping them apart is what stops a
    // first-name coincidence from being auto-matched and then learned as a
    // rule, which is how three residents' payments landed on the wrong
    // apartments for ten months.
    const surname = nameParts[nameParts.length - 1]
    const surnameHit = nameParts.length > 1 && !!surname && hit(surname)
    const credit = Number(tx.credit) || 0
    const fee = calcUnitFee(unit, selectedBuilding)
    const num = String(unit.number || unit.unit_number || '')
    const numMatch = !!num && new RegExp(`(^|\\D)${num}(\\D|$)`).test(desc)
    const amountMatch = fee > 0 && Math.abs(credit - fee) <= 1
    // A resident paying several months up front is not an outlier to discard —
    // it is a clean whole multiple of the fee, and it was the only signal on
    // the 4,120 ₪ credit (eight months at 515 ₪) that nothing would suggest.
    const ratio = fee > 0 ? credit / fee : 0
    const monthsAhead = Math.round(ratio)
    const multipleMatch = fee > 0 && monthsAhead >= 2 && monthsAhead <= 14 &&
      Math.abs(credit - monthsAhead * fee) <= 2
    // An unexplained large amount used to carry -100, which silently vetoed
    // even a full name match: the 4,120 ₪ from the ערמון family names them
    // twice in the description, and nothing was ever offered for it because
    // 4,120 is not a whole multiple of the fee this unit is configured with
    // (they actually pay 515 — their April payment was 1,545, three months).
    // An amount heuristic should not be able to overrule a name; it should
    // only stop the match from being automatic.
    const tooBig = fee > 0 && credit > fee * 2 && !multipleMatch
    const score = nameHits * 10 + (surnameHit ? 6 : 0) + (numMatch ? 5 : 0) +
      (amountMatch ? 4 : 0) + (multipleMatch ? 4 : 0) - (tooBig ? 8 : 0)
    return { score, nameHits, surnameHit, numMatch, amountMatch, multipleMatch, monthsAhead, tooBig }
  }

  // What the reviewer needs to see to judge a suggestion without re-deriving it.
  const explainMatch = (best, runnerUp) => {
    const bits = []
    if (best.surnameHit) bits.push('שם המשפחה מופיע בתיאור')
    else if (best.nameHits >= 1) bits.push('שם פרטי בלבד מופיע בתיאור')
    if (best.numMatch) bits.push('מספר הדירה מופיע בתיאור')
    if (best.amountMatch) bits.push('הסכום תואם בדיוק את דמי הוועד')
    else if (best.multipleMatch) bits.push(`הסכום תואם בדיוק ${best.monthsAhead} חודשי ועד מראש`)
    else if (best.tooBig) bits.push('הסכום גבוה מדמי הוועד החודשיים — ייתכן תשלום מראש או חוב שנסגר')
    if (!bits.length) bits.push('התאמה חלשה')
    if (runnerUp && runnerUp.score >= best.score - 4) {
      bits.push(`שים לב: דירה ${runnerUp.unit.number} מתאימה כמעט באותה מידה`)
    }
    return bits.join(' • ')
  }

  const handleAutoMatch = async () => {
    const unmatched = transactions.filter(tx => tx.match_status === 'unmatched' && Number(tx.credit) > 0)
    let matched = 0, suggested = 0, byRule = 0
    const creditsByUnit = {} // unitId -> { month -> total } for payment sync

    for (const tx of unmatched) {
      // A learned rule beats name scoring: it came from a human match of this
      // exact recurring credit, and it is the only thing that can place a
      // nameless standing order at all.
      const ruleUnit = unitForTransaction(patterns, tx)
      if (ruleUnit) {
        await updateTx(tx.id, { unit_id: ruleUnit, match_status: 'matched', month: monthKey }, { silent: true })
        const m = tx.month || monthKey
        if (!creditsByUnit[ruleUnit]) {
          creditsByUnit[ruleUnit] = {}
          allTx.filter(t => t.building_id === selectedBuilding?.id && t.match_status === 'matched' && t.unit_id === ruleUnit)
            .forEach(t => { const mm = t.month || monthKey; creditsByUnit[ruleUnit][mm] = (creditsByUnit[ruleUnit][mm] || 0) + (Number(t.credit) || 0) })
        }
        creditsByUnit[ruleUnit][m] = (creditsByUnit[ruleUnit][m] || 0) + (Number(tx.credit) || 0)
        matched++
        byRule++
        continue
      }

      const scored = units
        .filter((unit) => residentMap[unit.id])
        .map((unit) => ({ unit, ...scoreTxUnit(tx, unit) }))
        .sort((a, b) => b.score - a.score)
      const best = scored[0]
      const runnerUp = scored[1]
      if (!best || best.score <= 0) continue

      // Auto-match only where there is nothing left to judge: the surname is
      // in the description, a second signal agrees, and no other apartment is
      // anywhere near as good. Anything short of that becomes a suggestion
      // with its evidence attached — a wrong auto-match does not just mis-file
      // one payment, it gets learned as a rule and repeats every month.
      const contested = !!runnerUp && runnerUp.score >= best.score - 4
      // The amount must also make sense. A name can be a coincidence, and an
      // amount nobody can explain is exactly when a human should look.
      const high = best.surnameHit && (best.amountMatch || best.multipleMatch || best.numMatch) && !contested
      const medium = best.nameHits >= 1 || best.numMatch ||
        ((best.amountMatch || best.multipleMatch) && best.score > 0)
      if (high) {
        await updateTx(tx.id, {
          unit_id: best.unit.id, match_status: 'matched', month: monthKey,
          match_reason: explainMatch(best, runnerUp),
        }, { silent: true })
        const m = tx.month || monthKey
        if (!creditsByUnit[best.unit.id]) {
          creditsByUnit[best.unit.id] = {}
          allTx.filter(t => t.building_id === selectedBuilding?.id && t.match_status === 'matched' && t.unit_id === best.unit.id)
            .forEach(t => { const mm = t.month || monthKey; creditsByUnit[best.unit.id][mm] = (creditsByUnit[best.unit.id][mm] || 0) + (Number(t.credit) || 0) })
        }
        creditsByUnit[best.unit.id][m] = (creditsByUnit[best.unit.id][m] || 0) + (Number(tx.credit) || 0)
        matched++
      } else if (medium) {
        await updateTx(tx.id, {
          unit_id: best.unit.id, match_status: 'suggested', month: monthKey,
          match_reason: explainMatch(best, runnerUp),
        }, { silent: true })
        suggested++
      }
    }

    await refresh()
    for (const [unitId, byMonth] of Object.entries(creditsByUnit)) {
      for (const [month, total] of Object.entries(byMonth)) await syncPayment(unitId, month, total)
    }

    const msg = matched || suggested
      ? `שויכו ${matched} אוטומטית${byRule ? ` (${byRule} לפי כללים נלמדים)` : ''}${suggested ? `, ${suggested} הצעות לאישור` : ''}`
      : 'לא נמצאו התאמות'
    toast(msg, matched || suggested ? 'success' : 'warning')
  }

  // Assign a category to a transaction + auto-apply to all matching descriptions
  const handleSetCategory = async (txId, category) => {
    const tx = categoryDialog
    await updateTx(txId, { category })

    // Auto-categorize all transactions with the same description across all months
    if (category && tx?.description) {
      const desc = tx.description.trim()
      const matching = allTx.filter(t =>
        t.id !== txId &&
        t.building_id === selectedBuilding?.id &&
        t.description?.trim() === desc &&
        !t.category
      )
      if (matching.length > 0) {
        // One request, one toast — a loop here used to stack a toast per row.
        await bulkUpdateTx(matching.map(m => m.id), { category }, { silent: true })
        toast(`עודכנו ${matching.length} תנועות נוספות עם אותו תיאור`)
      }
    }

    setCategoryDialog(null)
    await refresh()
  }

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const y = String(currentYear - 2 + i)
      return { value: y, label: y }
    })
  }, [])

  const monthLabel = HEBREW_MONTHS.find(m => m.value === selectedMonth)?.label || ''

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תנועות בנק</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לצפות בתנועות" />
  }

  // ── View model (derived from already-loaded data) ──
  const matchedPct = summary.total > 0 ? Math.round((summary.matched / summary.total) * 100) : 0
  const creditCount = transactions.filter(tx => Number(tx.credit) > 0).length
  const debitCount = transactions.filter(tx => Number(tx.debit) > 0).length
  const uncategorizedCount = transactions.filter(tx => !tx.category && tx.match_status !== 'excluded').length
  const countBy = (key) => key === 'all' ? transactions.length : transactions.filter(tx => tx.match_status === key).length
  const payCounts = {
    paid: paymentTracking.filter(p => p.status === 'paid').length,
    partial: paymentTracking.filter(p => p.status === 'partial').length,
    unpaid: paymentTracking.filter(p => p.status === 'unpaid').length,
  }
  const paidPct = paymentTracking.length > 0 ? Math.round((payCounts.paid / paymentTracking.length) * 100) : 0
  const openUnits = paymentTracking.filter(p => p.status !== 'paid')

  const renderCategory = (tx, isCredit) => {
    if (tx.category) {
      const cat = isCredit ? findIncomeCategory(tx.category) : findExpenseCategory(tx.category)
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

  const iconBtn = 'p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors'
  const renderActions = (tx) => (
    <div className="flex gap-0.5 justify-end">
      {tx.match_status === 'unmatched' && (
        <>
          <button className={iconBtn} onClick={() => setMatchDialog(tx)} title="שייך לדירה"><Link2 className="h-3.5 w-3.5" /></button>
          <button className={iconBtn} onClick={() => handleIgnore(tx)} title="התעלם"><XIcon className="h-3.5 w-3.5" /></button>
          <button className={`${iconBtn} hover:!text-[var(--danger)] hover:!bg-[var(--danger-light)]`} onClick={() => handleExclude(tx)} title="לא רלוונטי"><Ban className="h-3.5 w-3.5" /></button>
        </>
      )}
      {tx.match_status === 'suggested' && (
        <>
          <button className={`${iconBtn} !text-[var(--success)] hover:!bg-[var(--success-light)]`} onClick={() => handleApproveSuggestion(tx)} title="אשר הצעה"><Check className="h-3.5 w-3.5" /></button>
          <button className={iconBtn} onClick={() => handleRejectSuggestion(tx)} title="דחה הצעה"><XIcon className="h-3.5 w-3.5" /></button>
          <button className={iconBtn} onClick={() => setMatchDialog(tx)} title="שייך לדירה אחרת"><Link2 className="h-3.5 w-3.5" /></button>
        </>
      )}
      {tx.match_status === 'matched' && (
        <button className={iconBtn} onClick={() => handleUnmatch(tx)} title="בטל שיוך"><XIcon className="h-3.5 w-3.5" /></button>
      )}
      {(tx.match_status === 'ignored' || tx.match_status === 'excluded') && (
        <button className={iconBtn} onClick={() => handleUnmatch(tx)} title="החזר"><Undo2 className="h-3.5 w-3.5" /></button>
      )}
    </div>
  )

  const rowModel = (tx) => {
    const isCredit = Number(tx.credit) > 0
    const amount = isCredit ? tx.credit : tx.debit
    const status = MATCH_STATUS[tx.match_status] || MATCH_STATUS.unmatched
    const matchedUnit = tx.unit_id ? units.find(u => u.id === tx.unit_id) : null
    const matchedResident = matchedUnit ? residentMap[matchedUnit.id] : null
    return { isCredit, amount, status, matchedUnit, matchedResident }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">תנועות בנק — {monthLabel} {selectedYear}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">תנועות מקובץ הבנק החודשי — שיוך זיכויים לדירות, סיווג ומעקב תשלומים • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} options={HEBREW_MONTHS} className="w-28" aria-label="חודש" />
          <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} options={yearOptions} className="w-24" aria-label="שנה" />
          <Button variant="outline" onClick={() => setPaymentSummaryOpen(true)}>
            <Users className="h-4 w-4" />
            סיכום תשלומים
          </Button>
          {summary.suggested > 0 ? (
            <>
              <Button variant="outline" onClick={handleAutoMatch}>
                <Link2 className="h-4 w-4" />
                שיוך חכם
              </Button>
              <Button onClick={handleApproveAllSuggestions}>
                <CheckCircle2 className="h-4 w-4" />
                אשר את כל ההצעות ({summary.suggested})
              </Button>
            </>
          ) : (
            <Button onClick={handleAutoMatch}>
              <Link2 className="h-4 w-4" />
              שיוך חכם
            </Button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="סה״כ זיכויים" icon={ArrowDownLeft} color="emerald"
          value={formatCurrency(summary.totalCredit)}
          sub={`${creditCount} תנועות זכות החודש`} />
        <StatCard label="סה״כ חיובים" icon={ArrowUpRight} color="red"
          value={formatCurrency(summary.totalDebit)}
          sub={`${debitCount} תנועות חובה החודש`} />
        <StatCard label="תנועות משויכות" icon={CheckCircle2} color="blue"
          value={`${summary.matched} / ${summary.total}`}
          note={summary.total > 0 ? `${matchedPct}%` : null}
          sub={uncategorizedCount ? `${uncategorizedCount} ללא קטגוריה` : 'כל התנועות מסווגות'}
          progress={matchedPct} />
        <StatCard label="ממתינות לטיפול" icon={AlertCircle} color={summary.unmatched || summary.suggested ? 'amber' : 'emerald'}
          value={String(summary.unmatched)}
          note={summary.suggested ? `+${summary.suggested} הצעות` : null}
          sub={summary.unmatched ? 'תנועות שלא שויכו לדירה' : 'אין תנועות פתוחות ✓'}
          footer={summary.unmatched || summary.suggested ? (
            <button onClick={() => setStatusFilter(summary.suggested ? 'suggested' : 'unmatched')} className="text-[var(--primary)] font-semibold hover:underline">
              {summary.suggested ? 'לבדיקת ההצעות ←' : 'לשיוך עכשיו ←'}
            </button>
          ) : null} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי תיאור התנועה..." />
            <div className="flex flex-wrap items-center gap-2">
              <TabGroup
                tabs={STATUS_FILTERS.map(f => ({ ...f, count: countBy(f.key) }))}
                activeTab={statusFilter}
                onChange={setStatusFilter}
              />
              <TabGroup tabs={TYPE_FILTERS} activeTab={typeFilter} onChange={setTypeFilter} />
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={Landmark}
                title="אין תנועות"
                description={search ? 'לא נמצאו תוצאות לחיפוש' : `לא נמצאו תנועות ל${monthLabel} ${selectedYear}`}
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
                    {filteredTx.map(tx => {
                      const { isCredit, amount, status, matchedUnit, matchedResident } = rowModel(tx)
                      return (
                        <tr key={tx.id} className={tx.match_status === 'unmatched' && isCredit ? '!bg-[var(--warning-light)]/40' : ''}>
                          <td className="whitespace-nowrap">
                            <span className="text-[12px] font-semibold num-tabular">{new Date(tx.transaction_date).toLocaleDateString('he-IL')}</span>
                            {tx.transaction_time && <span className="block text-[11px] text-[var(--text-muted)] num-tabular">{tx.transaction_time}</span>}
                          </td>
                          <td className="min-w-[200px]">
                            <span className="flex items-center gap-2">
                              <span className={`p-1 rounded-[var(--radius)] shrink-0 ${isCredit ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--danger-light)] text-[var(--danger)]'}`}>
                                {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-semibold truncate max-w-[280px]">{tx.description}</span>
                                {tx.source && <span className="block text-[11px] text-[var(--text-muted)]">{tx.source}</span>}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-[12px]">
                            {matchedUnit ? (
                              <span>
                                <span className="font-semibold num-tabular">דירה {matchedUnit.number}</span>
                                {matchedResident && <span className="block text-[11px] text-[var(--text-muted)]">{matchedResident}</span>}
                                {tx.match_status === 'suggested' && tx.match_reason && (
                                  <span className="block text-[11px] text-[var(--warning,#b45309)] mt-0.5 whitespace-normal">{tx.match_reason}</span>
                                )}
                              </span>
                            ) : <span className="text-[var(--text-muted)]">—</span>}
                          </td>
                          <td className="whitespace-nowrap">{renderCategory(tx, isCredit)}</td>
                          <td className="whitespace-nowrap !text-left">
                            <span className={`text-[14px] font-bold num-tabular ${isCredit ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {isCredit ? '+' : '-'}{formatCurrency(amount)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap"><Badge variant={status.variant}>{status.label}</Badge></td>
                          <td className="whitespace-nowrap">{renderActions(tx)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--border-light)]">
                {filteredTx.map(tx => {
                  const { isCredit, amount, status, matchedUnit, matchedResident } = rowModel(tx)
                  return (
                    <div key={tx.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] line-clamp-2">{tx.description}</p>
                          <p className="text-[11px] text-[var(--text-muted)] num-tabular mt-0.5">
                            {new Date(tx.transaction_date).toLocaleDateString('he-IL')}{tx.transaction_time ? ` • ${tx.transaction_time}` : ''}
                          </p>
                        </div>
                        <span className={`text-[14px] font-bold num-tabular shrink-0 ${isCredit ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {isCredit ? '+' : '-'}{formatCurrency(amount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {matchedUnit && (
                          <span className="text-[11px] text-[var(--text-secondary)] num-tabular">דירה {matchedUnit.number}{matchedResident ? ` — ${matchedResident}` : ''}</span>
                        )}
                        {tx.match_status === 'suggested' && tx.match_reason && (
                          <span className="text-[11px] text-[var(--warning,#b45309)] w-full">{tx.match_reason}</span>
                        )}
                        {renderCategory(tx, isCredit)}
                        <div className="mr-auto">{renderActions(tx)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>מציג {filteredTx.length} מתוך {transactions.length} תנועות</span>
                <span className="num-tabular">
                  זכות <strong className="text-[var(--success)]">{formatCurrency(filteredTx.reduce((s, tx) => s + (Number(tx.credit) || 0), 0))}</strong>
                  {' • '}חובה <strong className="text-[var(--danger)]">{formatCurrency(filteredTx.reduce((s, tx) => s + (Number(tx.debit) || 0), 0))}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment tracking side panel */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center gap-3">
            <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]"><Users className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h2 className="text-[16px] leading-6 font-bold text-[var(--text-primary)]">מעקב תשלומי דירות</h2>
              <p className="text-[11px] text-[var(--text-muted)]">{monthLabel} {selectedYear} • לפי תנועות משויכות</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { key: 'paid', tone: 'bg-[var(--success-light)] text-[var(--success)]' },
                { key: 'partial', tone: 'bg-[var(--warning-light)] text-[var(--warning)]' },
                { key: 'unpaid', tone: 'bg-[var(--danger-light)] text-[var(--danger)]' },
              ].map(({ key, tone }) => (
                <div key={key} className={`rounded-[var(--radius)] p-2 ${tone}`}>
                  <p className="text-[11px] font-medium">{PAY_STATUS[key].label}</p>
                  <p className="text-[20px] font-bold num-tabular">{payCounts[key]}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                <span>שיעור גבייה</span>
                <span className="num-tabular font-semibold">{paidPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--success)] transition-all duration-700" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
            {openUnits.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-2">{paymentTracking.length ? 'כל הדירות שילמו ✓' : 'אין דירות בבניין'}</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {openUnits.slice(0, 8).map(({ unit, resident, fee, totalPaid, status }) => (
                  <div key={unit.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border-light)] last:border-0">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold num-tabular">דירה {unit.number}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{resident}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-[12px] font-bold num-tabular">{formatCurrency(totalPaid)} / {formatCurrency(fee)}</p>
                      <Badge variant={PAY_STATUS[status].variant}>{PAY_STATUS[status].label}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setPaymentSummaryOpen(true)}
              className="w-full flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)] text-[12px]"
            >
              <span className="font-semibold text-[var(--text-primary)]">סיכום תשלומים מלא</span>
              <ChevronLeft className="h-4 w-4 text-[var(--primary)]" />
            </button>
          </div>

          {/* Learned rules — what the system picked up from manual matches.
              Visible so a wrong rule can be removed instead of quietly
              mis-assigning a payment every month. */}
          <div className="border-t border-[var(--border)]">
              <div className="px-4 py-3 flex items-center gap-2">
                <Repeat className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-[13px] font-bold text-[var(--text-primary)]">כללי שיוך נלמדים</h3>
                <span className="mr-auto text-[11px] text-[var(--text-muted)]">{patterns.length}</span>
              </div>
              <div className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
                <p className="text-[11px] text-[var(--text-muted)] leading-4">
                  הכללים נוצרים כששייכת תנועה ידנית. הם מזהים הוראות קבע חוזרות לפי יום בחודש וסכום — גם כשאין שם בתנועה.
                </p>
                <button
                  onClick={async () => {
                    const res = await learnFromExisting({
                      buildingId: selectedBuilding?.id,
                      transactions: allTx.filter(t => t.building_id === selectedBuilding?.id && Number(t.credit) > 0),
                      userId: user?.id || null,
                    })
                    await reloadPatterns()
                    toast(res.created
                      ? `נלמדו ${res.created} כללים מהשיוכים הקיימים${res.conflicts ? ` (${res.conflicts} דפוסים לא חד-משמעיים דולגו)` : ''}`
                      : 'לא נמצאו דפוסים חוזרים חדשים ללמוד מהם', res.created ? 'success' : 'info')
                  }}
                  className="w-full h-[32px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)] text-[11px] font-semibold"
                >
                  למד כללים מהשיוכים הקיימים
                </button>
                {patterns.map(pt => {
                  const label = directory.byId?.[pt.unit_id]?.label || 'דירה לא ידועה'
                  return (
                    <div key={pt.id} className="flex items-start gap-2 p-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)]">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</p>
                        <p className="text-[11px] text-[var(--text-muted)] num-tabular">{describePattern(pt)}</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!window.confirm('לבטל את הכלל? תנועות קיימות יישארו משויכות, אבל תנועות עתידיות לא ישויכו אוטומטית.')) return
                          await deactivatePattern(pt.id)
                          await reloadPatterns()
                          toast('הכלל בוטל')
                        }}
                        title="ביטול הכלל"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] shrink-0"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
        </aside>
      </div>

      {/* Match Dialog */}
      <Dialog open={!!matchDialog} onOpenChange={() => setMatchDialog(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך תנועה לדירה</DialogTitle>
          </DialogHeader>
          {matchDialog && (
            <div className="space-y-3 mt-2">
              <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-sm">
                <p className="font-medium">{matchDialog.description}</p>
                <p className="text-[var(--success)] font-bold mt-1 num-tabular">
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
                      className={`w-full flex items-center justify-between p-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] transition-colors text-sm text-right ${
                        isPaid ? 'opacity-40' : ''
                      }`}
                    >
                      <span>
                        דירה {unit.number} — {residentMap[unit.id] || 'ללא דייר'}
                        {alreadyPaid > 0 && !isPaid && (
                          <span className="text-xs text-[var(--warning)] mr-1 num-tabular">
                            (שולם {formatCurrency(alreadyPaid)}, חסר {formatCurrency(remaining)})
                          </span>
                        )}
                        {isPaid && (
                          <span className="text-xs text-[var(--success)] mr-1">(שולם מלא)</span>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] num-tabular shrink-0">
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
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>שייך קטגוריה</DialogTitle>
          </DialogHeader>
          {categoryDialog && (() => {
            const isCredit = Number(categoryDialog.credit) > 0
            const categories = isCredit ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
            const groups = isCredit ? INCOME_GROUPS : EXPENSE_GROUPS
            return (
              <div className="space-y-3 mt-2">
                <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-sm">
                  <p className="font-medium truncate">{categoryDialog.description}</p>
                  <p className={`font-bold mt-1 num-tabular ${isCredit ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {isCredit ? '+' : '-'}{formatCurrency(categoryDialog.credit || categoryDialog.debit)}
                  </p>
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
                  {groups.map(group => {
                    const groupCats = categories.filter(c => c.group === group.key)
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
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Payment Summary Dialog */}
      <Dialog open={paymentSummaryOpen} onOpenChange={setPaymentSummaryOpen}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>
              סיכום תשלומים — {monthLabel} {selectedYear}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 rounded-[var(--radius)] bg-[var(--success-light)]">
                <p className="text-xs text-[var(--text-secondary)]">שילמו</p>
                <p className="text-lg font-bold text-[var(--success)] num-tabular">{payCounts.paid}</p>
              </div>
              <div className="text-center p-2 rounded-[var(--radius)] bg-[var(--warning-light)]">
                <p className="text-xs text-[var(--text-secondary)]">חלקי</p>
                <p className="text-lg font-bold text-[var(--warning)] num-tabular">{payCounts.partial}</p>
              </div>
              <div className="text-center p-2 rounded-[var(--radius)] bg-[var(--danger-light)]">
                <p className="text-xs text-[var(--text-secondary)]">לא שילמו</p>
                <p className="text-lg font-bold text-[var(--danger)] num-tabular">{payCounts.unpaid}</p>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1">
              {paymentTracking.map(({ unit, resident, fee, totalPaid, status }) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between p-3 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      status === 'paid' ? 'bg-[var(--success)]' :
                      status === 'partial' ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
                    }`} />
                    <div>
                      <p className="text-sm font-medium num-tabular">דירה {unit.number}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{resident}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold num-tabular ${
                      status === 'paid' ? 'text-[var(--success)]' :
                      status === 'partial' ? 'text-[var(--warning)]' : 'text-[var(--danger)]'
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
