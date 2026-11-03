import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { TabGroup } from '@/components/ui/tabs'
import { FormField } from '@/components/common/FormField'
import { StatCard } from '@/components/common/StatCard'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { RefreshCw, Store, Building2, Hourglass, CheckCircle2, Settings2, Info } from 'lucide-react'
import { toast } from '@/lib/toast'

// Platform revenue (ועד פלוס): vendors pay a fee per service call, buildings pay
// a monthly usage fee scaled by unit count. This is a ledger — it records and
// reports charges and lets the admin mark them paid. No automatic charging.

// A vendor "call" is billable once a specific vendor was engaged for the issue.
const VENDOR_ENGAGED_STATUSES = ['approved', 'scheduled', 'in_progress', 'completed', 'closed', 'quoted', 'approved_for_quotes']

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

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
  const [settings, setSettings] = useState({ vendor_call_fee: '', building_fee_per_unit: '' })
  const [charges, setCharges] = useState([])
  const [buildings, setBuildings] = useState([])
  const [vendors, setVendors] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [typeTab, setTypeTab] = useState('vendor_call')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c, b, v, i] = await Promise.all([
      supabase.from('billing_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('billing_charges').select('*').order('created_at', { ascending: false }),
      supabase.from('buildings').select('id, name, total_units'),
      supabase.from('vendors').select('id, name'),
      supabase.from('issues').select('id, vendor_id, vendor_name, building_id, status, title'),
    ])
    if (s.data) setSettings({
      vendor_call_fee: s.data.vendor_call_fee != null ? String(s.data.vendor_call_fee) : '',
      building_fee_per_unit: s.data.building_fee_per_unit != null ? String(s.data.building_fee_per_unit) : '',
    })
    setCharges(c.data || [])
    setBuildings(b.data || [])
    setVendors(v.data || [])
    setIssues(i.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const vendorName = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v.name])), [vendors])
  const buildingName = useMemo(() => Object.fromEntries(buildings.map((b) => [b.id, b.name])), [buildings])

  const saveSettings = async () => {
    setSaving(true)
    const { error } = await supabase.from('billing_settings').upsert({
      id: 'default',
      vendor_call_fee: Number(settings.vendor_call_fee) || 0,
      building_fee_per_unit: Number(settings.building_fee_per_unit) || 0,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    toast(error ? 'שגיאה בשמירה' : 'התעריפים נשמרו', error ? 'error' : 'success')
  }

  // Generate any missing charges (idempotent): one vendor-call fee per engaged
  // issue, and this month's subscription per building.
  const generate = async () => {
    setGenerating(true)
    const callFee = Number(settings.vendor_call_fee) || 0
    const perUnit = Number(settings.building_fee_per_unit) || 0
    const period = monthKey(new Date())

    const haveCall = new Set(charges.filter((c) => c.type === 'vendor_call').map((c) => c.issue_id))
    const haveSub = new Set(charges.filter((c) => c.type === 'building_subscription').map((c) => `${c.building_id}|${c.period}`))

    const rows = []
    for (const iss of issues) {
      const vid = iss.vendor_id || vendors.find((v) => v.name && v.name === iss.vendor_name)?.id || null
      const engaged = (iss.vendor_id || iss.vendor_name) && VENDOR_ENGAGED_STATUSES.includes(iss.status)
      if (engaged && !haveCall.has(iss.id)) {
        rows.push({ type: 'vendor_call', issue_id: iss.id, vendor_id: vid, building_id: iss.building_id || null, amount: callFee, status: 'pending', note: iss.title || '' })
      }
    }
    for (const b of buildings) {
      const key = `${b.id}|${period}`
      if (!haveSub.has(key)) {
        const units = b.total_units || 0
        rows.push({ type: 'building_subscription', building_id: b.id, period, units, amount: units * perUnit, status: 'pending' })
      }
    }

    if (rows.length === 0) {
      setGenerating(false)
      toast('אין חיובים חדשים להפקה', 'info')
      return
    }
    const { error } = await supabase.from('billing_charges').insert(rows)
    setGenerating(false)
    toast(error ? 'שגיאה: ' + error.message : `נוצרו ${rows.length} חיובים`, error ? 'error' : 'success')
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
    return {
      pending: sum(pending), paid: sum(paid),
      pendingCount: pending.length, paidCount: paid.length,
      vendorPending: sum(pending.filter((c) => c.type === 'vendor_call')),
      vendorPendingCount: pending.filter((c) => c.type === 'vendor_call').length,
      buildingPending: sum(pending.filter((c) => c.type === 'building_subscription')),
      buildingPendingCount: pending.filter((c) => c.type === 'building_subscription').length,
    }
  }, [charges])

  const header = (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הכנסות פלטפורמה</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">עמלת ספק לכל קריאה + דמי שימוש חודשיים מהבניינים • ספר חיובים בלבד, ללא חיוב אוטומטי</p>
      </div>
      {isAdmin && !loading && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={generate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />{generating ? 'מפיק...' : 'הפק חיובים'}
          </Button>
        </div>
      )}
    </div>
  )

  if (!isAdmin) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">אין הרשאה לדף זה</p></div>
  if (loading) return (
    <div className="space-y-6">
      {header}
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
      </div>
    </div>
  )

  const typeCharges = charges.filter((c) => c.type === typeTab)
  const visible = statusFilter === 'all' ? typeCharges : typeCharges.filter((c) => c.status === statusFilter)
  const countBy = (s) => typeCharges.filter((c) => c.status === s).length
  const isVendor = typeTab === 'vendor_call'
  const chargeLabel = (c) => (isVendor
    ? (vendorName[c.vendor_id] || c.note || 'ספק')
    : (buildingName[c.building_id] || 'בניין'))
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

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="ממתין לגבייה" icon={Hourglass} color="amber" value={formatCurrency(totals.pending)}
          sub={`${totals.pendingCount} חיובים פתוחים`} />
        <StatCard label="נגבה" icon={CheckCircle2} color="emerald" value={formatCurrency(totals.paid)}
          note={`${collectPct}%`} sub={`${totals.paidCount} חיובים שולמו`} progress={collectPct} />
        <StatCard label="עמלות ספקים (ממתין)" icon={Store} color="blue" value={formatCurrency(totals.vendorPending)}
          sub={`${totals.vendorPendingCount} קריאות פתוחות`}
          footer={<button onClick={() => { setTypeTab('vendor_call'); setStatusFilter('pending') }} className="text-[var(--primary)] font-semibold hover:underline">לעמלות הפתוחות ←</button>} />
        <StatCard label="דמי בניינים (ממתין)" icon={Building2} color="purple" value={formatCurrency(totals.buildingPending)}
          sub={`${totals.buildingPendingCount} מנויים פתוחים`}
          footer={<button onClick={() => { setTypeTab('building_subscription'); setStatusFilter('pending') }} className="text-[var(--primary)] font-semibold hover:underline">לדמי השימוש הפתוחים ←</button>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabGroup
              tabs={[
                { key: 'vendor_call', label: 'עמלות ספקים', icon: Store, count: charges.filter((c) => c.type === 'vendor_call').length },
                { key: 'building_subscription', label: 'דמי שימוש — בניינים', icon: Building2, count: charges.filter((c) => c.type === 'building_subscription').length },
              ]}
              activeTab={typeTab}
              onChange={setTypeTab}
            />
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
            <EmptyState icon={isVendor ? Store : Building2} title="אין חיובים"
              description={typeCharges.length ? 'אין חיובים בסטטוס זה' : 'הגדר תעריף ולחץ "הפק חיובים".'} />
          ) : (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    {isVendor
                      ? <tr><th>ספק</th><th>קריאה</th><th>בניין</th><th className="!text-left">סכום</th><th>סטטוס</th><th></th></tr>
                      : <tr><th>בניין</th><th>תקופה</th><th>דירות</th><th className="!text-left">סכום</th><th>סטטוס</th><th></th></tr>}
                  </thead>
                  <tbody>
                    {visible.map((c) => (
                      <tr key={c.id}>
                        <td className="min-w-[150px] text-[13px] font-semibold">{chargeLabel(c)}</td>
                        {isVendor ? (
                          <>
                            <td className="min-w-[160px] text-[12px] text-[var(--text-secondary)]"><span className="line-clamp-1">{c.note || '—'}</span></td>
                            <td className="whitespace-nowrap text-[12px]">{buildingName[c.building_id] || <span className="text-[var(--text-muted)]">—</span>}</td>
                          </>
                        ) : (
                          <>
                            <td className="whitespace-nowrap text-[12px] font-semibold num-tabular">{c.period}</td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">{c.units || 0}</td>
                          </>
                        )}
                        <td className="whitespace-nowrap !text-left"><span className="text-[14px] font-bold num-tabular">{formatCurrency(c.amount)}</span></td>
                        <td><StatusChip s={c.status} /></td>
                        <td className="whitespace-nowrap">{chargeActions(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--border-light)]">
                {visible.map((c) => (
                  <div key={c.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold truncate">{chargeLabel(c)}</p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {isVendor ? (c.note || '') : `${c.period} · ${c.units || 0} דירות`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[14px] font-bold num-tabular">{formatCurrency(c.amount)}</span>
                        <StatusChip s={c.status} />
                      </div>
                    </div>
                    {c.status !== 'paid' && chargeActions(c)}
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>מציג <span className="num-tabular">{visible.length}</span> חיובים</span>
                <span>סך הכל המוצג: <strong className="text-[var(--primary)] num-tabular">{formatCurrency(visible.reduce((a, c) => a + (Number(c.amount) || 0), 0))}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Tariffs side panel */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
            <Settings2 className="h-6 w-6 text-[var(--primary)] shrink-0" strokeWidth={1.75} />
            <div>
              <h2 className="text-[16px] leading-6 font-bold text-[var(--text-primary)]">תעריפים</h2>
              <p className="text-[11px] text-[var(--text-muted)]">משמשים בהפקת החיובים הבאה</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <FormField label="עמלת ספק לקריאה (₪)" type="number" value={settings.vendor_call_fee} onChange={(e) => setSettings((p) => ({ ...p, vendor_call_fee: e.target.value }))} />
            <FormField label="דמי שימוש לבניין — ₪ לדירה לחודש" type="number" value={settings.building_fee_per_unit} onChange={(e) => setSettings((p) => ({ ...p, building_fee_per_unit: e.target.value }))} />
            <Button onClick={saveSettings} disabled={saving} className="w-full">{saving ? 'שומר...' : 'שמור תעריפים'}</Button>
            <div className="flex items-start gap-2 p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[11px] leading-[16px] text-[var(--text-secondary)]">
              <Info className="h-3.5 w-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
              <span>"הפק חיובים" יוצר רק חיובים חסרים: עמלה אחת לכל קריאה שבה שובץ ספק, ודמי שימוש לחודש הנוכחי לכל בניין (מספר דירות × תעריף). אין חיוב אוטומטי — הסימון "שולם" ידני.</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-3 rounded-[var(--radius)] border border-[var(--border)]">
                <p className="text-[11px] text-[var(--text-secondary)]">בניינים</p>
                <p className="text-[18px] font-bold num-tabular">{buildings.length}</p>
              </div>
              <div className="p-3 rounded-[var(--radius)] border border-[var(--border)]">
                <p className="text-[11px] text-[var(--text-secondary)]">דירות במנוי</p>
                <p className="text-[18px] font-bold num-tabular">{buildings.reduce((a, b) => a + (b.total_units || 0), 0)}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
