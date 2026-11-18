import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/common/SectionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { toast, toastError } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'
import { StatementsCard } from '@/components/billing/StatementsCard'
import { BankMandateCard } from '@/components/billing/BankMandateCard'
import { BuildingAccessCard } from '@/components/billing/BuildingAccessCard'
import { cn } from '@/lib/utils'
import {
  loadServiceConfig, loadBuildingBilling, loadPunchBalance, loadPriceLists, monthlyPrice, punchRules, itemPrice,
  CARD_POLICY_LABELS, CHARGE_TYPE_LABELS, APPROVAL_LABELS, UNIT_LABELS,
} from '@/lib/servicePlans'
import { Receipt, CheckCircle2, XCircle, Ticket, SlidersHorizontal, ListChecks, ShieldCheck, Wrench } from 'lucide-react'

// "חשבון ועד1" — what the building owes ועד1 this month, what is waiting for
// the committee's approval, and the committee's own billing choices. Every
// line here is ועד1's own service: vendors are paid by the building directly
// and never appear on this bill.

const nis = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] num-tabular focus:border-[var(--primary)] focus:outline-none'
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString() }

export default function Charges() {
  const { isAdmin } = useAuth()
  const { selectedBuilding } = useBuildingContext()
  const confirm = useConfirm()
  const buildingId = selectedBuilding?.id

  const [mandateRev, setMandateRev] = useState(0)
  const [cfg, setCfg] = useState({ ready: false, plans: [], settings: null })
  const [billing, setBilling] = useState(null)
  const [balance, setBalance] = useState(null)
  const [items, setItems] = useState([])
  const [charges, setCharges] = useState([])
  const [prefs, setPrefs] = useState({ limit: 0, policy: 'bill_hourly' })
  const [handling, setHandling] = useState({ mode: 'committee', cap: 0 })
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!buildingId) { setLoading(false); return }
    setLoading(true)
    const [c, b, bal, lists, ch] = await Promise.all([
      loadServiceConfig(),
      loadBuildingBilling(buildingId),
      loadPunchBalance(buildingId),
      loadPriceLists(),
      supabase.from('billing_charges').select('*').eq('building_id', buildingId).neq('type', 'vendor_call')
        .or(`created_at.gte.${monthStart()},approval.eq.awaiting`).order('created_at', { ascending: false }),
    ])
    setCfg(c)
    setBilling(b)
    setBalance(bal)
    setItems(lists.items.filter((x) => x.active !== false))
    setCharges(ch.error ? [] : ch.data || [])
    setPrefs({ limit: Number(b?.auto_approve_limit) || 0, policy: b?.card_exhausted_policy || 'bill_hourly' })
    setHandling({ mode: b?.handling_mode || 'committee', cap: Number(b?.vendor_auto_limit) || 0 })
    setLoading(false)
  }, [buildingId])

  useEffect(() => { load() }, [load])

  const plan = useMemo(() => cfg.plans.find((p) => p.key === billing?.service_plan) || null, [cfg.plans, billing])
  const subscription = plan ? monthlyPrice(plan, billing?.total_units, billing?.plan_price_override) : 0
  const awaiting = charges.filter((c) => c.approval === 'awaiting')
  const thisMonth = charges.filter((c) => c.approval !== 'awaiting' && c.approval !== 'rejected'
    && c.type !== 'building_subscription' && c.created_at >= monthStart())
  const extrasTotal = thisMonth.reduce((s, c) => s + Number(c.amount || 0), 0)

  const decide = async (ids, approve) => {
    setBusy(approve ? 'approve' : 'reject')
    const results = await Promise.all(ids.map((id) => supabase.rpc('decide_charge', { p_charge: id, p_approve: approve })))
    setBusy('')
    if (results.some((r) => r.error)) { toastError('הפעולה נכשלה'); return }
    toast(approve ? (ids.length > 1 ? `${ids.length} חיובים אושרו` : 'החיוב אושר') : 'החיוב נדחה')
    load()
  }

  const savePrefs = async () => {
    setBusy('prefs')
    const { error } = await supabase.rpc('set_building_billing_prefs', {
      p_building: buildingId, p_auto_limit: Number(prefs.limit) || 0, p_policy: prefs.policy,
    })
    setBusy('')
    if (error) toastError('שמירת ההגדרות נכשלה')
    else { toast('ההגדרות נשמרו'); load() }
  }

  const saveHandling = async () => {
    setBusy('handling')
    const { error } = await supabase.rpc('set_building_handling', {
      p_building: buildingId, p_mode: handling.mode, p_vendor_limit: Number(handling.cap) || 0,
    })
    setBusy('')
    if (error) toastError('שמירת ההגדרה נכשלה')
    else { toast('ההגדרה נשמרה'); load() }
  }

  const buyCard = async () => {
    if (!plan) return
    const bonus = Number(plan.card_bonus_punches) || 0
    const ok = await confirm({
      title: 'קניית כרטיסייה',
      description: `${plan.card_punches} שעות${bonus ? ` ועוד ${bonus} שעת בונוס` : ''}, ב-${nis(plan.card_price)} (לפני מע"מ). הסכום ייכנס לחשבון החודשי.`,
      confirmText: 'קנייה',
    })
    if (!ok) return
    setBusy('card')
    const { error } = await supabase.rpc('buy_card', { p_building: buildingId })
    setBusy('')
    if (error) toastError('קניית הכרטיסייה נכשלה')
    else { toast('הכרטיסייה נקנתה'); load() }
  }

  if (!buildingId) return <EmptyState icon={Receipt} title="בחרו בניין" description="החשבון מוצג לבניין שנבחר" />
  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" /></div>
  if (!cfg.ready || !plan) return <EmptyState icon={Receipt} title="לבניין עוד לא הוגדר מסלול" description="מסלול השירות נקבע במסך מסלולים ותמחור" />

  const ChargeRow = ({ c, actions }) => (
    <div className="p-3 flex items-start justify-between gap-3 text-[13px]">
      <div className="min-w-0">
        <p className="font-semibold">{CHARGE_TYPE_LABELS[c.type] || c.type}{c.quantity && c.quantity !== 1 ? ` × ${Number(c.quantity)}` : ''}</p>
        {c.note && <p className="text-[12px] text-[var(--text-secondary)] truncate">{c.note}</p>}
        <p className="text-[11px] text-[var(--text-muted)]">
          {new Date(c.created_at).toLocaleDateString('he-IL')} · {APPROVAL_LABELS[c.approval] || c.approval}
          {c.receipt_url && <> · <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-[var(--primary)] font-semibold">קבלה</a></>}
        </p>
      </div>
      <div className="shrink-0 text-left space-y-1.5">
        <p className="font-bold num-tabular">{nis(c.amount)}</p>
        {actions}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">חשבון ועד1</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">מה מגיע לוועד1 החודש, מה ממתין לאישור, ואיך הוועד בוחר לנהל את החיובים. המחירים לפני מע"מ.</p>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-[12px] text-[var(--text-muted)]">מסלול {plan.label}</p>
          <p className="text-[22px] font-bold num-tabular">{nis(subscription)}</p>
          <p className="text-[12px] text-[var(--text-secondary)]">מנוי חודשי · {nis(plan.price_per_unit)} לדירה, מינימום {nis(plan.min_per_building)}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-[12px] text-[var(--text-muted)]">תוספות שאושרו החודש</p>
          <p className="text-[22px] font-bold num-tabular">{nis(extrasTotal)}</p>
          <p className="text-[12px] text-[var(--text-secondary)]">סה"כ משוער לחודש: <strong>{nis(subscription + extrasTotal)}</strong></p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-[12px] text-[var(--text-muted)]">יתרת שעות בכרטיסייה</p>
          <p className={cn('text-[22px] font-bold num-tabular', (balance?.balance ?? 0) < 0 && 'text-[var(--danger)]')}>{balance?.balance ?? 0}</p>
          <Button size="sm" variant="outline" className="mt-1" onClick={buyCard} disabled={!!busy}>
            <Ticket className="h-4 w-4" />{busy === 'card' ? 'קונה...' : `קניית כרטיסייה · ${nis(plan.card_price)}`}
          </Button>
        </div>
      </div>

      {/* ── Awaiting approval ── */}
      <SectionCard icon={CheckCircle2} title="ממתין לאישור הוועד" subtitle="חיובים שוועד1 ביקשה ועוברים את סכום האישור האוטומטי"
        actions={awaiting.length > 1 && (
          <Button size="sm" onClick={() => decide(awaiting.map((c) => c.id), true)} disabled={!!busy}>אישור הכל</Button>
        )}>
        {awaiting.length === 0
          ? <p className="p-4 text-[13px] text-[var(--text-muted)]">אין חיובים שממתינים לאישור</p>
          : <div className="divide-y divide-[var(--border-light)]">
              {awaiting.map((c) => (
                <ChargeRow key={c.id} c={c} actions={
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => decide([c.id], true)} disabled={!!busy}><CheckCircle2 className="h-4 w-4" />אישור</Button>
                    <Button size="sm" variant="outline" onClick={() => decide([c.id], false)} disabled={!!busy}><XCircle className="h-4 w-4" />דחייה</Button>
                  </div>
                } />
              ))}
            </div>}
      </SectionCard>

      {/* ── This month ── */}
      <SectionCard icon={Receipt} title="החודש" subtitle="כל מה שנכנס לחשבון החודשי, מעבר למנוי">
        {thisMonth.length === 0
          ? <p className="p-4 text-[13px] text-[var(--text-muted)]">עוד אין תוספות החודש</p>
          : <div className="divide-y divide-[var(--border-light)]">{thisMonth.map((c) => <ChargeRow key={c.id} c={c} />)}</div>}
      </SectionCard>

      <StatementsCard key={`st-${mandateRev}`} buildingId={buildingId} buildingName={selectedBuilding?.name || ''} isAdmin={isAdmin} />
      <BankMandateCard buildingId={buildingId} isAdmin={isAdmin} onChange={() => setMandateRev((n) => n + 1)} />
      {isAdmin && <BuildingAccessCard key={`acc-${mandateRev}`} buildingId={buildingId} onChange={() => setMandateRev((n) => n + 1)} />}

      {/* ── Who handles issues ── */}
      <SectionCard icon={Wrench} title="מי מטפל בתקלות"
        actions={<Button size="sm" onClick={saveHandling} disabled={!!busy}>{busy === 'handling' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="p-4 space-y-3" role="radiogroup">
          {[
            ['committee', 'הוועד מחליט על כל תקלה', 'כל תקלה חדשה מגיעה אליכם עם שני כפתורים: "ועד1 תטפל" או "הוועד יטפל".'],
            ['vaad1', 'ועד1 מטפלת בכל התקלות', 'כל תקלה חדשה עוברת לוועד1 אוטומטית, ואתם מקבלים עדכון. ועד1 מחליטה אם לשלוח את איש האחזקה או לבקש הצעות מספקים. אינסטלציה ושערים: קודם בדיקה של איש האחזקה.'],
          ].map(([key, label, help]) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer text-[13px]">
              <input type="radio" name="handling-mode" className="mt-1 accent-[var(--primary)]"
                checked={handling.mode === key} onChange={() => setHandling((h) => ({ ...h, mode: key }))} />
              <span><strong>{label}</strong><span className="block text-[12px] text-[var(--text-muted)]">{help}</span></span>
            </label>
          ))}
          {handling.mode === 'vaad1' && (
            <label className="block max-w-xs text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5 pr-6">
              <span>הצעת ספק עד הסכום הזה מאושרת בלי לשאול אתכם (₪, לפני מע"מ)</span>
              <input type="number" min="0" dir="ltr" className={field} value={handling.cap}
                onChange={(e) => setHandling((h) => ({ ...h, cap: e.target.value }))} />
              <span className="block font-normal text-[var(--text-muted)]">מעל הסכום, ההצעה הזולה מגיעה אליכם לאישור. 0 = כל הצעה מגיעה לאישור. שעות אחזקה נספרות לפי הכרטיסייה.</span>
            </label>
          )}
          <p className="text-[12px] text-[var(--text-muted)]">בכל מצב: מקרה חירום מהרשימה שאף אחד לא טיפל בו תוך שעה, ועד1 מטפלת בו בעצמה.</p>
        </div>
      </SectionCard>

      {/* ── Committee choices ── */}
      <SectionCard icon={SlidersHorizontal} title="הגדרות חיוב של הוועד"
        actions={<Button size="sm" onClick={savePrefs} disabled={!!busy}>{busy === 'prefs' ? 'שומר...' : 'שמירה'}</Button>}>
        <div className="p-4 space-y-4">
          <label className="block max-w-xs text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5">
            <span>סכום לאישור אוטומטי בכל חודש (₪)</span>
            <input type="number" min="0" dir="ltr" className={field} value={prefs.limit}
              onChange={(e) => setPrefs((p) => ({ ...p, limit: e.target.value }))} />
            <span className="block font-normal text-[var(--text-muted)]">עד הסכום הזה חיובים של ועד1 מאושרים לבד. מעליו — כל חיוב מחכה לאישור. 0 = כל חיוב מחכה לאישור.</span>
          </label>
          <div className="space-y-1.5" role="radiogroup">
            <p className="text-[12px] font-semibold text-[var(--text-secondary)]">כשהכרטיסייה נגמרת</p>
            {Object.entries(CARD_POLICY_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-[13px]">
                <input type="radio" name="card-policy" className="accent-[var(--primary)]"
                  checked={prefs.policy === key} onChange={() => setPrefs((p) => ({ ...p, policy: key }))} />
                {label}{key === 'bill_hourly' ? ` (${nis(plan.hour_price)} לשעה)` : key === 'auto_renew' ? ` (${nis(plan.card_price)})` : ''}
              </label>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Price list, for transparency ── */}
      <SectionCard icon={ListChecks} title={`המחירון במסלול ${plan.label}`}>
        <div className="p-4 space-y-3 text-[13px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            <p>שעת אחזקה: <strong>{nis(plan.hour_price)}</strong></p>
            <p>כרטיסייה: <strong>{nis(plan.card_price)}</strong> · {plan.card_punches} שעות{Number(plan.card_bonus_punches) ? ` + ${plan.card_bonus_punches} בונוס` : ''}</p>
            <p>הצעות מספקים דרך ועד1: <strong>{plan.includes_auto_quotes ? 'כלול במסלול' : 'לא במסלול'}</strong></p>
            {items.map((x) => {
              const price = itemPrice(x, plan.key)
              return price == null ? null : (
                <p key={x.key}>{x.label}: <strong>{nis(price)}</strong> {UNIT_LABELS[x.unit] || ''}{x.payer === 'resident' ? ' · משולם על ידי הדייר' : ''}</p>
              )
            })}
          </div>
          <ul className="list-disc pr-4 space-y-1 text-[12px] text-[var(--text-secondary)]">
            {punchRules(cfg.settings, plan, billing?.card_exhausted_policy).map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="flex items-start gap-1.5 text-[12px] font-semibold text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
            את הספקים הבניין משלם ישירות.
          </p>
          {!isAdmin && <p className="text-[11px] text-[var(--text-muted)]">שיחות, הודעות, פתיחת תקלות, מכתבי גבייה והדוח החודשי — לעולם לא מחויבים.</p>}
        </div>
      </SectionCard>
    </div>
  )
}
