import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { Coins, RefreshCw, Store, Building2 } from 'lucide-react'

// Platform revenue (ועד פלוס): vendors pay a fee per service call, buildings pay
// a monthly usage fee scaled by unit count. This is a ledger — it records and
// reports charges and lets the admin mark them paid. No automatic charging.

// A vendor "call" is billable once a specific vendor was engaged for the issue.
const VENDOR_ENGAGED_STATUSES = ['approved', 'scheduled', 'in_progress', 'completed', 'closed', 'quoted', 'approved_for_quotes']

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

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
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: error ? 'שגיאה בשמירה' : 'התעריפים נשמרו', type: error ? 'error' : 'success' } }))
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'אין חיובים חדשים להפקה', type: 'info' } }))
      return
    }
    const { error } = await supabase.from('billing_charges').insert(rows)
    setGenerating(false)
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: error ? 'שגיאה: ' + error.message : `נוצרו ${rows.length} חיובים`, type: error ? 'error' : 'success' } }))
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
      vendorPending: sum(pending.filter((c) => c.type === 'vendor_call')),
      buildingPending: sum(pending.filter((c) => c.type === 'building_subscription')),
    }
  }, [charges])

  if (!isAdmin) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">אין הרשאה לדף זה</p></div>
  if (loading) return <div className="p-6"><PageHeader icon={Coins} iconColor="emerald" title="הכנסות פלטפורמה" /><p className="text-center text-[var(--text-muted)] py-12">טוען...</p></div>

  const vendorCharges = charges.filter((c) => c.type === 'vendor_call')
  const buildingCharges = charges.filter((c) => c.type === 'building_subscription')

  const StatusBadge = ({ s }) => (
    <Badge variant={s === 'paid' ? 'success' : s === 'waived' ? 'default' : 'warning'}>
      {s === 'paid' ? 'שולם' : s === 'waived' ? 'בוטל' : 'ממתין'}
    </Badge>
  )

  const ChargeRow = ({ c, label }) => (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{label}</p>
        {c.note && <p className="text-xs text-[var(--text-muted)] truncate">{c.note}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold">{formatCurrency(c.amount)}</span>
        <StatusBadge s={c.status} />
        {c.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => setStatus(c, 'paid')}>סמן שולם</Button>}
        {c.status === 'pending' && <Button size="sm" variant="ghost" className="text-[var(--text-muted)]" onClick={() => setStatus(c, 'waived')}>בטל</Button>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <PageHeader icon={Coins} iconColor="emerald" title="הכנסות פלטפורמה"
        subtitle="עמלת ספק לכל קריאה + דמי שימוש חודשיים מהבניינים"
        actions={<Button onClick={generate} disabled={generating}>{generating ? <><RefreshCw className="h-4 w-4 animate-spin" />מפיק...</> : 'הפק חיובים'}</Button>}
      />

      {/* Tariffs */}
      <Card className="border border-[var(--border)]">
        <CardHeader><CardTitle className="text-base">תעריפים</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="עמלת ספק לקריאה (₪)" type="number" value={settings.vendor_call_fee} onChange={(e) => setSettings((p) => ({ ...p, vendor_call_fee: e.target.value }))} />
            <FormField label="דמי שימוש לבניין — ₪ לדירה לחודש" type="number" value={settings.building_fee_per_unit} onChange={(e) => setSettings((p) => ({ ...p, building_fee_per_unit: e.target.value }))} />
          </div>
          <Button onClick={saveSettings} disabled={saving}>{saving ? 'שומר...' : 'שמור תעריפים'}</Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="text-xl font-bold text-amber-600">{formatCurrency(totals.pending)}</p><p className="text-xs text-[var(--text-secondary)]">ממתין לגבייה</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xl font-bold text-emerald-600">{formatCurrency(totals.paid)}</p><p className="text-xs text-[var(--text-secondary)]">נגבה</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xl font-bold text-[var(--primary)]">{formatCurrency(totals.vendorPending)}</p><p className="text-xs text-[var(--text-secondary)]">עמלות ספקים (ממתין)</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xl font-bold text-[var(--primary)]">{formatCurrency(totals.buildingPending)}</p><p className="text-xs text-[var(--text-secondary)]">דמי בניינים (ממתין)</p></CardContent></Card>
      </div>

      {/* Vendor call charges */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2"><Store className="h-4 w-4" />עמלות ספקים — לפי קריאה</h3>
        {vendorCharges.length === 0 ? <p className="text-sm text-[var(--text-muted)]">אין חיובים. הגדר תעריף ולחץ "הפק חיובים".</p> :
          vendorCharges.map((c) => <ChargeRow key={c.id} c={c} label={vendorName[c.vendor_id] || c.note || 'ספק'} />)}
      </div>

      {/* Building subscription charges */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2"><Building2 className="h-4 w-4" />דמי שימוש — בניינים</h3>
        {buildingCharges.length === 0 ? <p className="text-sm text-[var(--text-muted)]">אין חיובים. הגדר תעריף ולחץ "הפק חיובים".</p> :
          buildingCharges.map((c) => <ChargeRow key={c.id} c={c} label={`${buildingName[c.building_id] || 'בניין'} · ${c.period} · ${c.units || 0} דירות`} />)}
      </div>
    </div>
  )
}
