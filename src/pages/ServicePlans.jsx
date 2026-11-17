import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionCard } from '@/components/common/SectionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { toast, toastError } from '@/lib/toast'
import { HandymanLedgerCard } from '@/components/billing/HandymanLedgerCard'
import { cn } from '@/lib/utils'
import { DAY_LABELS, loadServiceConfig, monthlyPrice, activePlans, loadPriceLists, UNIT_LABELS } from '@/lib/servicePlans'
import { BadgeDollarSign, Clock, Building2, Ticket, History, Save, Plus, ListChecks, Package, Handshake } from 'lucide-react'

// Plans, prices, business hours and punch cards — the commercial settings of
// the management side. Everything a price depends on is edited here rather
// than written into code: per-unit price and the per-building floor for each
// plan, what a punch card costs on each plan, and when an hour counts double.

const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] num-tabular focus:border-[var(--primary)] focus:outline-none'
const th = 'text-right text-[11px] font-semibold text-[var(--text-muted)] px-2 py-2 whitespace-nowrap'
const td = 'px-2 py-2 align-middle text-[13px]'
const nis = (n) => `${Number(n || 0).toLocaleString('he-IL')} ₪`

export default function ServicePlans() {
  const { isAdmin, profile } = useAuth()
  const [ready, setReady] = useState(null) // null = loading, false = migration missing
  const [plans, setPlans] = useState([])
  const [settings, setSettings] = useState(null)
  const [buildings, setBuildings] = useState([])
  const [balances, setBalances] = useState({})
  const [ledger, setLedger] = useState([])
  const [cards, setCards] = useState([])
  const [busy, setBusy] = useState('')
  const [buyFor, setBuyFor] = useState(null) // building being sold a card
  const [buyForm, setBuyForm] = useState({ punches: 10, price: 0, paid: false, notes: '' })
  const [items, setItems] = useState([])
  const [parts, setParts] = useState([])
  const [referral, setReferral] = useState({ fee: 0, active: false })

  const load = useCallback(async () => {
    const cfg = await loadServiceConfig()
    if (!cfg.ready) { setReady(false); return }
    const lists = await loadPriceLists()
    setItems(lists.items)
    setParts(lists.parts)
    const [b, bal, led, crd] = await Promise.all([
      supabase.from('buildings').select('id, name, total_units, service_plan, plan_price_override, included_punches_override').order('name'),
      supabase.from('building_punch_balance').select('*'),
      supabase.from('punch_ledger').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('punch_cards').select('*').order('purchased_at', { ascending: false }).limit(30),
    ])
    setPlans(cfg.plans)
    setSettings(cfg.settings)
    const ref = await supabase.from('billing_settings').select('vendor_call_fee, vendor_referral_active').eq('id', 'default').maybeSingle()
    setReferral({ fee: Number(ref.data?.vendor_call_fee) || 0, active: !!ref.data?.vendor_referral_active })
    setBuildings(b.data || [])
    setBalances(Object.fromEntries((bal.data || []).map((x) => [x.building_id, x])))
    setLedger(led.data || [])
    setCards(crd.data || [])
    setReady(true)
  }, [])

  useEffect(() => { load() }, [load])

  const planByKey = useMemo(() => Object.fromEntries(plans.map((p) => [p.key, p])), [plans])
  const buildingName = useMemo(() => Object.fromEntries(buildings.map((b) => [b.id, b.name])), [buildings])

  const setPlanField = (key, name, value) =>
    setPlans((ps) => ps.map((p) => (p.key === key ? { ...p, [name]: value } : p)))

  const savePlans = async () => {
    setBusy('plans')
    const num = (v) => (v === '' || v == null ? 0 : Number(v))
    const results = await Promise.all(plans.map((p) => supabase.from('service_plans').update({
      price_per_unit: num(p.price_per_unit), min_per_building: num(p.min_per_building),
      card_price: num(p.card_price), card_punches: Math.max(1, num(p.card_punches)),
      card_bonus_punches: num(p.card_bonus_punches), hour_price: num(p.hour_price), handle_fee: num(p.handle_fee),
      included_punches: num(p.included_punches), updated_at: new Date().toISOString(),
    }).eq('key', p.key)))
    setBusy('')
    if (results.some((r) => r.error)) toastError('שמירת המסלולים נכשלה')
    else { toast('המסלולים והמחירים נשמרו'); load() }
  }

  const saveSettings = async () => {
    setBusy('settings')
    const { error } = await supabase.from('service_settings').update({
      business_days: settings.business_days,
      business_start: settings.business_start, business_end: settings.business_end,
      off_hours_multiplier: Number(settings.off_hours_multiplier) || 2,
      punch_minutes: Number(settings.punch_minutes) || 60,
      card_validity_months: Number(settings.card_validity_months) || 12,
      parts_approval_threshold: Number(settings.parts_approval_threshold) || 0,
      parts_handling_pct: Number(settings.parts_handling_pct) || 0,
      reopen_free_days: Number(settings.reopen_free_days) || 0,
      visit_min_punches: Math.max(1, Number(settings.visit_min_punches) || 1),
      batch_max_days: Number(settings.batch_max_days) || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', true)
    setBusy('')
    if (error) toastError('שמירת ההגדרות נכשלה'); else toast('הגדרות השירות נשמרו')
  }

  const saveReferral = async () => {
    setBusy('referral')
    const { error } = await supabase.from('billing_settings').update({
      vendor_call_fee: Math.max(0, Number(referral.fee) || 0), vendor_referral_active: !!referral.active,
      updated_at: new Date().toISOString(),
    }).eq('id', 'default')
    setBusy('')
    if (error) toastError('השמירה נכשלה'); else toast(referral.active ? 'דמי ההפניה פעילים' : 'דמי ההפניה נשמרו, כבויים')
  }

  const toggleDay = (d) => setSettings((s) => {
    const has = (s.business_days || []).includes(d)
    const next = has ? s.business_days.filter((x) => x !== d) : [...(s.business_days || []), d].sort()
    return { ...s, business_days: next }
  })

  const setItemField = (key, name, value) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [name]: value } : x)))

  const saveItems = async () => {
    setBusy('items')
    const n = (v) => (v === '' || v == null ? null : Number(v))
    const results = await Promise.all(items.map((x) => supabase.from('service_price_items').update({
      label: x.label, price_basic: n(x.price_basic), price_assisted: n(x.price_assisted),
      active: x.active !== false, notes: x.notes || '', updated_at: new Date().toISOString(),
    }).eq('key', x.key)))
    setBusy('')
    if (results.some((r) => r.error)) toastError('שמירת מחירון התוספות נכשלה')
    else { toast('מחירון התוספות נשמר'); load() }
  }

  const setPartField = (id, name, value) =>
    setParts((xs) => xs.map((x) => (x.id === id ? { ...x, [name]: value } : x)))

  const saveParts = async () => {
    setBusy('parts')
    const results = await Promise.all(parts.map((x) => (x.id.startsWith('new-')
      ? supabase.from('parts_catalog').insert({ label: x.label, price: Number(x.price) || 0, active: x.active !== false, position: Number(x.position) || 0 })
      : supabase.from('parts_catalog').update({ label: x.label, price: Number(x.price) || 0, active: x.active !== false }).eq('id', x.id))))
    setBusy('')
    if (results.some((r) => r.error)) toastError('שמירת מחירון החלקים נכשלה')
    else { toast('מחירון החלקים נשמר'); load() }
  }

  const addPartRow = () => setParts((xs) => [...xs, { id: `new-${Date.now()}`, label: '', price: 0, active: true, position: xs.length + 1 }])

  const setBuildingPlan = async (b, patch) => {
    const { error } = await supabase.from('buildings').update(patch).eq('id', b.id)
    if (error) toastError('עדכון הבניין נכשל'); else { toast(`${b.name} עודכן`); load() }
  }

  const openBuy = (b) => {
    const plan = planByKey[b.service_plan] || planByKey.basic
    const bonus = Number(plan?.card_bonus_punches) || 0
    setBuyForm({ punches: (Number(plan?.card_punches) || 10) + bonus, price: plan?.card_price || 0, paid: false,
      notes: bonus ? `${plan?.card_punches} שעות + ${bonus} בונוס` : '' })
    setBuyFor(b)
  }

  const confirmBuy = async () => {
    if (!buyFor) return
    setBusy('buy')
    const months = Number(settings?.card_validity_months) || 12
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    const { error } = await supabase.from('punch_cards').insert({
      building_id: buyFor.id, plan_key: buyFor.service_plan,
      punches: Math.max(1, Number(buyForm.punches) || 0), price: Number(buyForm.price) || 0,
      paid: !!buyForm.paid, notes: buyForm.notes || '', expires_at: expires.toISOString(),
      created_by: profile?.id || null,
    })
    setBusy('')
    if (error) { toastError('רישום הכרטיסייה נכשל'); return }
    toast(`נרשמה כרטיסייה של ${buyForm.punches} שעות ל${buyFor.name}`)
    setBuyFor(null)
    load()
  }

  if (!isAdmin) {
    return <EmptyState icon={BadgeDollarSign} title="אזור ניהול" description="מסלולים ותמחור זמינים למנהל המערכת בלבד" />
  }
  if (ready === null) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" /></div>
  }
  if (ready === false) {
    return (
      <EmptyState icon={BadgeDollarSign} title="המסלולים עוד לא הופעלו"
        description="יש להריץ את מיגרציה 030 (service plans + punch cards) במסד הנתונים. עד אז המערכת ממשיכה לעבוד כרגיל, בלי מסלולים וכרטיסיות." />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מסלולים ותמחור</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">שני מסלולים — כניסה וליווי. מחיר לדירה ומינימום, שעת אחזקה וכרטיסייה, דמי "ועד1 תטפל", מחירון תוספות וחלקים, והמסלול של כל בניין</p>
      </div>

      {/* ── Plans ── */}
      <SectionCard icon={BadgeDollarSign} title="מסלולים ומחירים" subtitle="המחיר החודשי לבניין = מחיר לדירה × מספר דירות, ולא פחות מהמינימום"
        actions={<Button size="sm" onClick={savePlans} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'plans' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[900px]">
            <thead><tr>
              <th className={th}>מסלול</th>
              <th className={th}>לדירה לחודש (₪)</th>
              <th className={th}>מינימום לבניין (₪)</th>
              <th className={th}>שעת אחזקה (₪)</th>
              <th className={th}>כרטיסייה (₪)</th>
              <th className={th}>שעות בכרטיסייה</th>
              <th className={th}>שעות בונוס</th>
              <th className={th}>"ועד1 תטפל" (₪)</th>
              <th className={th}>שעות כלולות בחודש</th>
            </tr></thead>
            <tbody>
              {activePlans(plans).map((p) => (
                <tr key={p.key} className="border-t border-[var(--border-light)]">
                  <td className={cn(td, 'font-bold whitespace-nowrap')}>{p.label}</td>
                  {['price_per_unit', 'min_per_building', 'hour_price', 'card_price', 'card_punches', 'card_bonus_punches', 'handle_fee', 'included_punches'].map((name) => (
                    <td key={name} className={td}>
                      <input type="number" min="0" dir="ltr" className={field} value={p[name] ?? ''}
                        onChange={(e) => setPlanField(p.key, name, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-[var(--text-muted)] px-2 pt-2">
            השעות הכלולות בליווי הן ביקור הליקויים החודשי. חלקים מחויבים בנפרד. ספקים — הבניין משלם להם ישירות.
          </p>
        </div>
      </SectionCard>

      {/* ── Hours & punch rules ── */}
      <SectionCard icon={Clock} title="שעות פעילות וכללי ניקוב" subtitle="מחוץ לשעות הפעילות כל שעה נספרת כפול"
        actions={<Button size="sm" onClick={saveSettings} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'settings' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">ימי פעילות</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, d) => {
                const on = (settings.business_days || []).includes(d)
                return (
                  <button key={d} onClick={() => toggleDay(d)} aria-pressed={on}
                    className={cn('px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors',
                      on ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'border-[var(--outline-variant)] text-[var(--text-secondary)]')}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['business_start', 'שעת התחלה', 'time'],
              ['business_end', 'שעת סיום', 'time'],
              ['off_hours_multiplier', 'מכפיל מחוץ לשעות', 'number'],
              ['punch_minutes', 'דקות בניקוב', 'number'],
              ['card_validity_months', 'תוקף כרטיסייה (חודשים)', 'number'],
              ['parts_approval_threshold', 'אישור ועד לחלקים מעל (₪)', 'number'],
              ['parts_handling_pct', 'טיפול על חלקים לפי קבלה (%)', 'number'],
              ['reopen_free_days', 'ביקור חוזר ללא ניקוב (ימים)', 'number'],
              ['visit_min_punches', 'מינימום ניקובים לביקור', 'number'],
              ['batch_max_days', 'תקלה לא דחופה ממתינה לביקור עד (ימים)', 'number'],
            ].map(([name, label, type]) => (
              <label key={name} className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5">
                <span>{label}</span>
                <input type={type} dir="ltr" className={field}
                  value={type === 'time' ? String(settings[name] || '').slice(0, 5) : settings[name] ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, [name]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Referral fee from vendors: prepared, off until switched on ── */}
      <SectionCard icon={Handshake} title="דמי הפניה מספקים" subtitle="מה שספק משלם לוועד1 על קריאה שקיבל דרך המערכת. התחשבנות מול הספק בלבד — לא מוצג לבניין ולא נכנס לחשבון שלו"
        actions={<Button size="sm" onClick={saveReferral} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'referral' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="p-4 flex flex-wrap items-end gap-4">
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5">
            <span>סכום לקריאה (₪)</span>
            <input type="number" min={0} dir="ltr" className={field + ' max-w-[140px]'} value={referral.fee}
              onChange={(e) => setReferral((r) => ({ ...r, fee: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold pb-2">
            <input type="checkbox" className="accent-[var(--primary)]" checked={referral.active}
              onChange={(e) => setReferral((r) => ({ ...r, active: e.target.checked }))} />
            פעיל
          </label>
          <p className="text-[12px] text-[var(--text-muted)] pb-2">{referral.active ? 'קריאות שבהן שובץ ספק נרשמות במסך "דמי הפניה מספקים".' : 'כבוי: שום דבר לא נרשם לספקים.'}</p>
        </div>
      </SectionCard>

      {/* ── Extras price list ── */}
      <SectionCard icon={ListChecks} title="מחירון תוספות" subtitle="ריק = לא מוצע במסלול. מתחת ל-₪100 לא מחייבים שירות."
        actions={<Button size="sm" onClick={saveItems} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'items' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[720px]">
            <thead><tr>
              <th className={th}>שירות</th>
              <th className={th}>יחידה</th>
              <th className={th}>כניסה (₪)</th>
              <th className={th}>ליווי (₪)</th>
              <th className={th}>משלם</th>
              <th className={th}>פעיל</th>
            </tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.key} className="border-t border-[var(--border-light)]">
                  <td className={td}><input className={field} value={x.label} onChange={(e) => setItemField(x.key, 'label', e.target.value)} /></td>
                  <td className={cn(td, 'whitespace-nowrap text-[var(--text-secondary)]')}>{UNIT_LABELS[x.unit] || x.unit}</td>
                  <td className={td}><input type="number" min="0" dir="ltr" className={field} placeholder="לא מוצע" value={x.price_basic ?? ''} onChange={(e) => setItemField(x.key, 'price_basic', e.target.value)} /></td>
                  <td className={td}><input type="number" min="0" dir="ltr" className={field} placeholder="לא מוצע" value={x.price_assisted ?? ''} onChange={(e) => setItemField(x.key, 'price_assisted', e.target.value)} /></td>
                  <td className={cn(td, 'whitespace-nowrap text-[var(--text-secondary)]')}>{x.payer === 'resident' ? 'הדייר' : 'הבניין'}</td>
                  <td className={td}><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={x.active !== false} onChange={(e) => setItemField(x.key, 'active', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Parts catalogue ── */}
      <SectionCard icon={Package} title="מחירון חלקים מהמלאי" subtitle={`פריטים קטנים במחיר קבוע. חלק שנקנה לעבודה — לפי קבלה ועוד ${Number(settings.parts_handling_pct ?? 10)}% טיפול.`}
        actions={<div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addPartRow}><Plus className="h-4 w-4" />פריט</Button>
          <Button size="sm" onClick={saveParts} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'parts' ? 'שומר...' : 'שמירה'}</Button>
        </div>}>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[480px]">
            <thead><tr>
              <th className={th}>פריט</th>
              <th className={th}>מחיר (₪)</th>
              <th className={th}>פעיל</th>
            </tr></thead>
            <tbody>
              {parts.map((x) => (
                <tr key={x.id} className="border-t border-[var(--border-light)]">
                  <td className={td}><input className={field} value={x.label} onChange={(e) => setPartField(x.id, 'label', e.target.value)} /></td>
                  <td className={td}><input type="number" min="0" dir="ltr" className={cn(field, 'w-28')} value={x.price ?? ''} onChange={(e) => setPartField(x.id, 'price', e.target.value)} /></td>
                  <td className={td}><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={x.active !== false} onChange={(e) => setPartField(x.id, 'active', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Buildings ── */}
      <SectionCard icon={Building2} title="בניינים" subtitle="המסלול של כל בניין, המחיר החודשי המחושב ויתרת הניקובים">
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[720px]">
            <thead><tr>
              <th className={th}>בניין</th>
              <th className={th}>דירות</th>
              <th className={th}>מסלול</th>
              <th className={th}>מחיר חודשי</th>
              <th className={th}>מחיר מותאם (₪)</th>
              <th className={th}>יתרת ניקובים</th>
              <th className={th}></th>
            </tr></thead>
            <tbody>
              {buildings.map((b) => {
                const plan = planByKey[b.service_plan]
                const bal = balances[b.id]?.balance ?? 0
                return (
                  <tr key={b.id} className="border-t border-[var(--border-light)]">
                    <td className={cn(td, 'font-semibold')}>{b.name}</td>
                    <td className={cn(td, 'num-tabular')}>{b.total_units || 0}</td>
                    <td className={td}>
                      <Select value={b.service_plan} onChange={(e) => setBuildingPlan(b, { service_plan: e.target.value })}
                        options={activePlans(plans).map((p) => ({ value: p.key, label: p.label }))} />
                    </td>
                    <td className={cn(td, 'font-bold num-tabular whitespace-nowrap')}>{nis(monthlyPrice(plan, b.total_units, b.plan_price_override))}</td>
                    <td className={td}>
                      <input type="number" min="0" dir="ltr" className={cn(field, 'w-28')} placeholder="לפי מסלול"
                        defaultValue={b.plan_price_override ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          if (v !== (b.plan_price_override ?? null)) setBuildingPlan(b, { plan_price_override: v })
                        }} />
                    </td>
                    <td className={td}>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-bold num-tabular',
                        bal > 0 ? 'bg-[var(--success-light)] text-[var(--success)]' : bal < 0 ? 'bg-[var(--danger-light)] text-[var(--danger)]' : 'bg-[var(--surface-container)] text-[var(--text-secondary)]')}>
                        {bal}
                      </span>
                    </td>
                    <td className={td}>
                      <Button variant="outline" size="sm" onClick={() => openBuy(b)}><Plus className="h-4 w-4" />כרטיסייה</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <SectionCard icon={Ticket} title="כרטיסיות שנרכשו" subtitle="30 האחרונות">
          {cards.length === 0 ? <p className="p-4 text-[13px] text-[var(--text-muted)]">עוד לא נרכשה כרטיסייה</p> : (
            <div className="divide-y divide-[var(--border-light)]">
              {cards.map((c) => (
                <div key={c.id} className="p-3 flex items-center justify-between gap-3 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{buildingName[c.building_id] || '—'}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{new Date(c.purchased_at).toLocaleDateString('he-IL')}{c.expires_at ? ` · בתוקף עד ${new Date(c.expires_at).toLocaleDateString('he-IL')}` : ''}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-bold num-tabular">{c.punches} ניקובים · {nis(c.price)}</p>
                    <p className={cn('text-[11px] font-semibold', c.paid ? 'text-[var(--success)]' : 'text-[var(--warning)]')}>{c.paid ? 'שולם' : 'טרם שולם'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={History} title="ניקובים אחרונים" subtitle="30 האחרונים">
          {ledger.length === 0 ? <p className="p-4 text-[13px] text-[var(--text-muted)]">עוד לא נוקב ניקוב</p> : (
            <div className="divide-y divide-[var(--border-light)]">
              {ledger.map((l) => (
                <div key={l.id} className="p-3 flex items-center justify-between gap-3 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{buildingName[l.building_id] || '—'}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {new Date(l.created_at).toLocaleDateString('he-IL')} · {l.kind === 'vendor_coordination' ? 'תיאום ספק' : l.kind === 'adjustment' ? 'התאמה' : 'איש אחזקה'}
                      {l.hours ? ` · ${l.hours} שעות` : ''}{l.off_hours ? ' · מחוץ לשעות' : ''}{l.note ? ` · ${l.note}` : ''}
                    </p>
                  </div>
                  <span className="font-bold num-tabular shrink-0">{l.punches > 0 ? `−${l.punches}` : `+${Math.abs(l.punches)}`}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <HandymanLedgerCard buildingName={buildingName} />

      {/* ── Sell a card ── */}
      <Dialog open={!!buyFor} onOpenChange={(o) => { if (!o) setBuyFor(null) }}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader><DialogTitle>כרטיסייה חדשה — {buyFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>מספר שעות (כולל בונוס)</span>
              <input type="number" min="1" dir="ltr" className={field} value={buyForm.punches} onChange={(e) => setBuyForm({ ...buyForm, punches: e.target.value })} /></label>
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>מחיר (₪)</span>
              <input type="number" min="0" dir="ltr" className={field} value={buyForm.price} onChange={(e) => setBuyForm({ ...buyForm, price: e.target.value })} /></label>
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>הערה</span>
              <input className={field} value={buyForm.notes} onChange={(e) => setBuyForm({ ...buyForm, notes: e.target.value })} /></label>
            <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={buyForm.paid} onChange={(e) => setBuyForm({ ...buyForm, paid: e.target.checked })} />
              התשלום התקבל
            </label>
            <p className="text-[11px] text-[var(--text-muted)]">תוקף: {settings?.card_validity_months} חודשים מהיום.</p>
            <div className="flex gap-2 pt-1">
              <Button onClick={confirmBuy} disabled={busy === 'buy'}>{busy === 'buy' ? 'רושם...' : 'רישום כרטיסייה'}</Button>
              <Button variant="outline" onClick={() => setBuyFor(null)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
