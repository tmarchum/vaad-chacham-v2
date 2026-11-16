import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { statementLink, periodLabel, statementEmailHtml } from '@/lib/statements'
import { FileText, UserRound } from 'lucide-react'

const nis = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'
const prevPeriod = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }
const thisPeriod = () => new Date().toISOString().slice(0, 7)

// Treasurer + monthly statements of ועד1's charges. The committee chooses who
// receives the statement; the system admin produces and sends it.
export function StatementsCard({ buildingId, buildingName, isAdmin }) {
  const [rec, setRec] = useState(null)
  const [form, setForm] = useState({ resident: '', email: '', cc: true })
  const [list, setList] = useState([])
  const [period, setPeriod] = useState(prevPeriod())
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!buildingId) return
    const [r, s] = await Promise.all([
      supabase.rpc('statement_recipients', { p_building: buildingId }),
      supabase.from('billing_statements').select('*').eq('building_id', buildingId).order('period', { ascending: false }).limit(12),
    ])
    const d = r.data || { committee: [] }
    setRec(d)
    setForm({ resident: d.treasurer?.id || '', email: d.billing_email || '', cc: d.cc !== false })
    setList(s.data || [])
  }, [buildingId])
  useEffect(() => { load() }, [load])

  const saveTreasurer = async () => {
    setBusy('treasurer')
    const { error } = await supabase.rpc('set_building_treasurer', {
      p_building: buildingId, p_resident: form.resident || null, p_email: form.email, p_cc: form.cc,
    })
    setBusy('')
    if (error) { toastError('השמירה נכשלה'); return }
    toast('הגזבר עודכן')
    load()
  }

  const build = async () => {
    setBusy('build')
    const { error } = await supabase.rpc('build_statement', { p_building: buildingId, p_period: period })
    setBusy('')
    if (error) { toastError('הפקת החשבון נכשלה'); return }
    toast(`החשבון לחודש ${periodLabel(period)} הופק`)
    load()
  }

  const send = async (s) => {
    const t = rec?.treasurer
    if (!t) { toastError('יש לבחור גזבר לפני השליחה'); return }
    const emails = [t.email, ...(rec.cc ? rec.committee.map((c) => c.email) : [])].filter(Boolean)
    const unique = [...new Set(emails)]
    if (!unique.length && !t.phone) { toastError('לגזבר אין מייל או נייד'); return }
    if (!window.confirm(`לשלוח את החשבון לחודש ${periodLabel(s.period)} (${nis(s.total)}) לגזבר — משפחת ${t.name}, דירה ${t.unit}${rec.cc ? ', עם העתק לחברי הוועד' : ''}?`)) return
    setBusy(`send-${s.id}`)
    let sentTo = []
    for (const to of unique) {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: { to, subject: `ועד1 — חשבון חודשי ${periodLabel(s.period)} · ${buildingName}`, html: statementEmailHtml(s, buildingName), buildingId, channel: 'email' },
      })
      if (!error) sentTo.push(to)
    }
    let wa = false
    if (t.phone) {
      const { data } = await supabase.functions.invoke('whatsapp', {
        body: {
          action: 'send', audience: 'resident', to: t.phone, templateKey: 'committee_monthly_statement', buildingId,
          variables: [buildingName, periodLabel(s.period), Number(s.total).toLocaleString('he-IL')],
          buttons: [{ type: 'url', index: 0, text: s.token }],
        },
      })
      wa = !!data?.ok
    }
    if (sentTo.length || wa) {
      await supabase.rpc('mark_statement_sent', { p_statement: s.id, p_to: [...sentTo, wa ? `whatsapp:${t.phone}` : ''].filter(Boolean).join(', ') })
      toast(`החשבון נשלח${sentTo.length ? ` · ${sentTo.length} מיילים` : ''}${wa ? ' · וואטסאפ לגזבר' : ''}`)
    } else toastError('השליחה נכשלה')
    setBusy('')
    load()
  }

  if (!rec) return null
  const t = rec.treasurer

  return (
    <SectionCard icon={FileText} title="חשבון חודשי וגזבר"
      subtitle="החשבון החודשי של ועד1 נשלח לגזבר הבניין ב-1 בחודש. חיוב שממתין לאישור הוועד לא נכנס לסכום לתשלום">
      <div className="p-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />גזבר — מקבל החשבון</span>
            <select className={field} value={form.resident} onChange={(e) => setForm({ ...form, resident: e.target.value })}>
              <option value="">לא נבחר</option>
              {rec.committee.map((c) => <option key={c.id} value={c.id}>דירה {c.unit} · {c.name}</option>)}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>מייל לחשבון (לא חובה)</span>
            <input dir="ltr" className={field} value={form.email} placeholder={t?.email || 'ברירת מחדל: המייל של הגזבר'}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <Button size="sm" onClick={saveTreasurer} disabled={!!busy}>{busy === 'treasurer' ? 'שומר...' : 'שמירה'}</Button>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="accent-[var(--primary)]" checked={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.checked })} />
          העתק במייל לשאר חברי הוועד
        </label>
        {!t && <p className="text-[12px] text-[var(--warning)]">עדיין לא נבחר גזבר, ולכן החשבון לא יישלח לאף אחד.</p>}

        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border-light)] pt-3">
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
              <span>הפקת חשבון לחודש</span>
              <input type="month" className={field} value={period} max={thisPeriod()} onChange={(e) => setPeriod(e.target.value)} />
            </label>
            <Button size="sm" variant="outline" onClick={build} disabled={!!busy || !period}>{busy === 'build' ? 'מפיק...' : 'הפקה'}</Button>
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">עוד לא הופקו חשבונות חודשיים.</p>
        ) : (
          <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
            {list.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-[13px]">
                <div>
                  <p className="font-semibold">{periodLabel(s.period)}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {s.status === 'sent' ? `נשלח ${new Date(s.sent_at).toLocaleDateString('he-IL')}` : s.status === 'paid' ? 'שולם' : 'טיוטה — עוד לא נשלח'}
                    {Number(s.awaiting) > 0 && ` · ${nis(s.awaiting)} ממתינים לאישור הוועד`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num-tabular font-semibold">{nis(s.total)}</span>
                  <a href={statementLink(s)} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--primary)]">פירוט</a>
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => send(s)} disabled={!!busy}>
                      {busy === `send-${s.id}` ? 'שולח...' : s.status === 'sent' ? 'שליחה חוזרת' : 'שליחה לגזבר'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
