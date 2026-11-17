import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { Wrench, Save } from 'lucide-react'

const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'
const lbl = 'text-[12px] font-semibold text-[var(--text-secondary)] space-y-1'
const nis = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const KIND = { hours: 'שעות עבודה', parts: 'החזר על חלק', payment: 'תשלום לאיש האחזקה', adjustment: 'התאמה' }

// What ועד1 owes its handyman: hours at his hourly cost and parts he paid for,
// minus payments already made. Internal — the building never sees this.
export function HandymanLedgerCard({ buildingName = {} }) {
  const [rows, setRows] = useState(null)
  const [rate, setRate] = useState('')
  const [pay, setPay] = useState({ amount: '', note: '' })
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from('handyman_ledger').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('billing_settings').select('handyman_hour_cost').eq('id', 'default').maybeSingle(),
    ])
    setRows(l.error ? [] : l.data || [])
    setRate(s.data?.handyman_hour_cost ?? '')
  }, [])
  useEffect(() => { load() }, [load])

  const totals = useMemo(() => {
    const r = rows || []
    const sum = (k) => r.filter((x) => x.kind === k).reduce((a, x) => a + Number(x.amount || 0), 0)
    return {
      hours: sum('hours'), parts: sum('parts'), paid: -sum('payment'),
      open: r.reduce((a, x) => a + Number(x.amount || 0), 0),
      missingRate: r.some((x) => x.kind === 'hours' && Number(x.amount) === 0 && Number(x.hours) > 0),
    }
  }, [rows])

  const saveRate = async () => {
    setBusy('rate')
    const { error } = await supabase.from('billing_settings')
      .update({ handyman_hour_cost: Math.max(0, Number(rate) || 0), updated_at: new Date().toISOString() }).eq('id', 'default')
    setBusy('')
    if (error) toastError('השמירה נכשלה'); else toast('עלות השעה נשמרה. היא חלה על ביקורים מעכשיו')
  }

  const addPayment = async () => {
    const amount = Number(pay.amount)
    if (!(amount > 0)) { toastError('הזינו את הסכום ששולם'); return }
    setBusy('pay')
    const { error } = await supabase.from('handyman_ledger').insert({ kind: 'payment', amount: -amount, note: pay.note.trim() || null })
    setBusy('')
    if (error) { toastError('הרישום נכשל'); return }
    toast('התשלום נרשם')
    setPay({ amount: '', note: '' })
    load()
  }

  // Hours logged before a cost was set: price them now.
  const priceMissing = async () => {
    const r = Number(rate) || 0
    if (!r) { toastError('קודם קבעו עלות לשעה'); return }
    setBusy('price')
    const missing = rows.filter((x) => x.kind === 'hours' && Number(x.amount) === 0 && Number(x.hours) > 0)
    const results = await Promise.all(missing.map((x) =>
      supabase.from('handyman_ledger').update({ amount: Math.round(Number(x.hours) * r * 100) / 100 }).eq('id', x.id)))
    setBusy('')
    if (results.some((x) => x.error)) toastError('חלק מהשורות לא עודכנו'); else toast('השעות תומחרו')
    load()
  }

  if (rows === null) return null

  return (
    <SectionCard icon={Wrench} title="התחשבנות עם איש האחזקה"
      subtitle="מה שוועד1 חייבת לאיש האחזקה: שעות לפי עלות השעה שלו, והחזר על חלקים שקנה. פנימי — הבניין לא רואה את זה">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['שעות', totals.hours], ['חלקים', totals.parts], ['שולם לו', totals.paid], ['יתרה לתשלום', totals.open]].map(([label, v], i) => (
            <div key={label} className={`rounded-[var(--radius)] border p-3 ${i === 3 && v > 0 ? 'border-[var(--warning)]' : 'border-[var(--border)]'}`}>
              <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
              <p className="text-[17px] font-semibold num-tabular">{nis(v)}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-4 items-end">
          <label className={lbl}><span>עלות שעה של איש האחזקה (₪)</span>
            <input type="number" min={0} dir="ltr" className={field} value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" onClick={saveRate} disabled={!!busy}><Save className="h-4 w-4" />{busy === 'rate' ? 'שומר...' : 'שמירה'}</Button>
          {totals.missingRate && (
            <Button size="sm" variant="outline" className="sm:col-span-2" onClick={priceMissing} disabled={!!busy}>תמחור שעות שנרשמו בלי עלות</Button>
          )}
        </div>
        {!Number(rate) && <p className="text-[12px] text-[var(--warning)]">עוד לא נקבעה עלות לשעה, ולכן שעות נרשמות בלי סכום.</p>}

        <div className="grid gap-2 sm:grid-cols-4 items-end border-t border-[var(--border-light)] pt-3">
          <label className={lbl}><span>שילמתי לאיש האחזקה (₪)</span>
            <input type="number" min={0} dir="ltr" className={field} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          </label>
          <label className={`${lbl} sm:col-span-2`}><span>הערה (העברה, מזומן, תאריך)</span>
            <input className={field} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
          </label>
          <Button size="sm" onClick={addPayment} disabled={!!busy}>{busy === 'pay' ? 'רושם...' : 'רישום תשלום'}</Button>
        </div>

        {rows.length === 0 ? <p className="text-[13px] text-[var(--text-muted)]">עוד אין רישומים. ביקור של איש האחזקה נרשם כאן כשסוגרים תקלה.</p> : (
          <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
            {rows.map((x) => (
              <div key={x.id} className="p-3 flex items-center justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{KIND[x.kind] || x.kind}{x.hours ? ` · ${Number(x.hours)} שעות` : ''}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {new Date(x.created_at).toLocaleDateString('he-IL')}
                    {buildingName[x.building_id] ? ` · ${buildingName[x.building_id]}` : ''}{x.note ? ` · ${x.note}` : ''}
                    {x.receipt_url && <> · <a href={x.receipt_url} target="_blank" rel="noreferrer" className="text-[var(--primary)]">קבלה</a></>}
                  </p>
                </div>
                <span className={`font-bold num-tabular shrink-0 ${Number(x.amount) < 0 ? 'text-[var(--success)]' : ''}`}>{nis(x.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
