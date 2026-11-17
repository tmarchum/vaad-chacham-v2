import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { TabGroup } from '@/components/ui/tabs'
import { StatCard } from '@/components/common/StatCard'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { RefreshCw, Store, Hourglass, CheckCircle2, Info } from 'lucide-react'
import { toast } from '@/lib/toast'

// Referral fees from vendors (דמי הפניה): what a vendor owes ועד1 for a call
// it received through the system. Settled between ועד1 and the vendor only —
// the building never sees these rows and they never enter its statement.
// Prepared but switched off; the amount and the switch live in "מסלולים ותמחור".
// What buildings pay (subscription, hours, cards) is NOT here: see "חשבון ועד1".

// A call counts once a specific vendor was engaged for the issue.
const VENDOR_ENGAGED_STATUSES = ['approved', 'scheduled', 'in_progress', 'completed', 'closed', 'quoted', 'approved_for_quotes']

const STATUS_CHIP = {
  paid: { label: 'שולם', cls: 'bg-[var(--success-light)] text-[var(--success)]' },
  waived: { label: 'בוטל', cls: 'bg-[var(--surface-container)] text-[var(--text-secondary)]' },
  pending: { label: 'ממתין', cls: 'bg-[var(--warning-light)] text-[var(--warning)]' },
}

function StatusChip({ s }) {
  const m = STATUS_CHIP[s] || STATUS_CHIP.pending
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${m.cls}`}>{m.label}</span>
}

export default function Billing() {
  const { isAdmin } = useAuth()
  const [fee, setFee] = useState(0)
  const [active, setActive] = useState(false)
  const [charges, setCharges] = useState([])
  const [buildings, setBuildings] = useState([])
  const [vendors, setVendors] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c, b, v, i] = await Promise.all([
      supabase.from('billing_settings').select('vendor_call_fee, vendor_referral_active').eq('id', 'default').maybeSingle(),
      supabase.from('billing_charges').select('*').eq('type', 'vendor_call').order('created_at', { ascending: false }),
      supabase.from('buildings').select('id, name'),
      supabase.from('vendors').select('id, name'),
      supabase.from('issues').select('id, vendor_id, vendor_name, building_id, status, title'),
    ])
    setFee(Number(s.data?.vendor_call_fee) || 0)
    setActive(!!s.data?.vendor_referral_active)
    setCharges(c.data || [])
    setBuildings(b.data || [])
    setVendors(v.data || [])
    setIssues(i.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const vendorName = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v.name])), [vendors])
  const buildingName = useMemo(() => Object.fromEntries(buildings.map((b) => [b.id, b.name])), [buildings])

  // Records any missing fee (idempotent): one per call in which a vendor was engaged.
  const generate = async () => {
    if (!active || !fee) return
    setGenerating(true)
    const have = new Set(charges.map((c) => c.issue_id))
    const rows = []
    for (const iss of issues) {
      const vid = iss.vendor_id || vendors.find((v) => v.name && v.name === iss.vendor_name)?.id || null
      const engaged = (iss.vendor_id || iss.vendor_name) && VENDOR_ENGAGED_STATUSES.includes(iss.status)
      if (engaged && !have.has(iss.id)) {
        rows.push({ type: 'vendor_call', issue_id: iss.id, vendor_id: vid, building_id: iss.building_id || null, amount: fee, status: 'pending', note: iss.title || '' })
      }
    }
    if (rows.length === 0) {
      setGenerating(false)
      toast('אין קריאות חדשות לרישום', 'info')
      return
    }
    const { error } = await supabase.from('billing_charges').insert(rows)
    setGenerating(false)
    toast(error ? 'הרישום נכשל' : `נרשמו ${rows.length} דמי הפניה`, error ? 'error' : 'success')
    if (!error) load()
  }

  const setStatus = async (charge, status) => {
    await supabase.from('billing_charges').update({ status }).eq('id', charge.id)
    load()
  }

  const totals = useMemo(() => {
    const sum = (arr) => arr.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    const pending = charges.filter((c) => c.status === 'pending')
    const paid = charges.filter((c) => c.status === 'paid')
    return { pending: sum(pending), paid: sum(paid), pendingCount: pending.length, paidCount: paid.length }
  }, [charges])

  if (!isAdmin) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">אין הרשאה לדף זה</p></div>

  const header = (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">דמי הפניה מספקים</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">התחשבנות בין ועד1 לספק על קריאות שקיבל דרך המערכת. לא מוצג לבניין ולא נכנס לחשבון שלו</p>
      </div>
      {!loading && active && (
        <Button onClick={generate} disabled={generating || !fee}>
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />{generating ? 'רושם...' : 'רישום קריאות חדשות'}
        </Button>
      )}
    </div>
  )

  if (loading) return (
    <div className="space-y-6">
      {header}
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
      </div>
    </div>
  )

  const visible = statusFilter === 'all' ? charges : charges.filter((c) => c.status === statusFilter)
  const countBy = (s) => charges.filter((c) => c.status === s).length
  const collectPct = totals.paid + totals.pending > 0 ? Math.round((totals.paid / (totals.paid + totals.pending)) * 100) : 0

  const chargeActions = (c) => (
    <div className="flex items-center gap-1.5">
      {c.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => setStatus(c, 'paid')}>סמן שולם</Button>}
      {c.status === 'pending' && <Button size="sm" variant="ghost" className="text-[var(--text-muted)]" onClick={() => setStatus(c, 'waived')}>בטל</Button>}
    </div>
  )

  return (
    <div className="space-y-6">
      {header}

      <div className="flex items-start gap-2 p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text-secondary)]">
        <Info className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
        <span>
          {active
            ? <>דמי הפניה פעילים: {formatCurrency(fee)} לקריאה. </>
            : <><strong className="text-[var(--text-primary)]">כבוי.</strong> שום דבר לא נרשם לספקים. </>}
          הסכום וההפעלה נקבעים ב<Link to="/service-plans" className="text-[var(--primary)] font-semibold">מסלולים ותמחור</Link>.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="ממתין לגבייה מספקים" icon={Hourglass} color="amber" value={formatCurrency(totals.pending)}
          sub={`${totals.pendingCount} קריאות פתוחות`} />
        <StatCard label="נגבה" icon={CheckCircle2} color="emerald" value={formatCurrency(totals.paid)}
          note={`${collectPct}%`} sub={`${totals.paidCount} שולמו`} progress={collectPct} />
      </div>

      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל' },
            { key: 'pending', label: 'ממתין', count: countBy('pending') },
            { key: 'paid', label: 'שולם', count: countBy('paid') },
            { key: 'waived', label: 'בוטל', count: countBy('waived') },
          ]}
          activeTab={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Store} title="אין דמי הפניה"
          description={charges.length ? 'אין רשומות בסטטוס זה' : active ? 'לחצו "רישום קריאות חדשות".' : 'דמי ההפניה כבויים.'} />
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] divide-y divide-[var(--border-light)]">
          {visible.map((c) => (
            <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate">{vendorName[c.vendor_id] || 'ספק'}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{[c.note, buildingName[c.building_id]].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold num-tabular">{formatCurrency(c.amount)}</span>
                <StatusChip s={c.status} />
                {chargeActions(c)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
