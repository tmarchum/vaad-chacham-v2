import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { statementLink, periodLabel, nis, heDate } from '@/lib/statements'
import { FileText, UserRound, PenLine } from 'lucide-react'

const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'
const area = 'w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'
const prevPeriod = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }
const thisPeriod = () => new Date().toISOString().slice(0, 7)

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const readyForDebit = (s) => s.status === 'sent' && s.debit_on && s.debit_on <= today()
function statusText(s) {
  if (s.status === 'draft') return 'טיוטה — עוד לא נשלח'
  if (s.status === 'paid') return `חויב בהוראת קבע${s.debited_at ? ` ${new Date(s.debited_at).toLocaleDateString('he-IL')}` : ''}`
  if (s.status === 'disputed') return 'הגזבר העיר — החיוב מעוכב'
  if (readyForDebit(s)) return 'לא התקבלה הערה — מוכן לחיוב'
  return `נשלח ${new Date(s.sent_at).toLocaleDateString('he-IL')}${s.debit_on ? ` · ממתין להערות עד ${heDate(s.debit_on)}` : ''}`
}

const WORDING = [
  ['statement_subject', 'נושא המייל', 1],
  ['statement_intro', 'פתיחה', 3],
  ['statement_payment', 'אופן החיוב (הוראת קבע)', 3],
  ['statement_footer', 'שורת סיום', 2],
]

async function callStatements(payload) {
  const { data, error } = await supabase.functions.invoke('billing-statements', { body: payload })
  if (error) return { error: 'failed' }
  return data || {}
}

// Treasurer + monthly statements of ועד1's charges. The committee chooses who
// receives the statement; the system admin produces it, sends it, and decides
// whether it goes out automatically on the 1st of the month.
export function StatementsCard({ buildingId, buildingName, isAdmin }) {
  const [rec, setRec] = useState(null)
  const [form, setForm] = useState({ resident: '', email: '', cc: true })
  const [list, setList] = useState([])
  const [period, setPeriod] = useState(prevPeriod())
  const [busy, setBusy] = useState('')
  const [wording, setWording] = useState(null)
  const [wordingOpen, setWordingOpen] = useState(false)
  const [preview, setPreview] = useState(null)

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

  const toggleAuto = async () => {
    const on = !rec.auto_send
    if (on && !window.confirm(`להפעיל שליחה אוטומטית? מעכשיו, ב-1 בכל חודש, החשבון של ${buildingName} על החודש שהסתיים יופק ויישלח לגזבר בלי לחיצה נוספת.`)) return
    setBusy('auto')
    const { error } = await supabase.rpc('set_statement_auto_send', { p_building: buildingId, p_on: on })
    setBusy('')
    if (error) { toastError(String(error.message).includes('no_treasurer') ? 'יש לבחור גזבר לפני הפעלת שליחה אוטומטית' : 'העדכון נכשל'); return }
    toast(on ? 'שליחה אוטומטית הופעלה — החשבון יישלח ב-1 בכל חודש' : 'שליחה אוטומטית כובתה')
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

  const showPreview = async (p) => {
    setBusy(`prev-${p}`)
    const d = await callStatements({ buildingId, period: p, preview: true })
    setBusy('')
    const r = d.results?.[0]
    if (!r?.html) { toastError(r?.skipped === 'no_treasurer' ? 'יש לבחור גזבר כדי לראות את המייל' : 'התצוגה המקדימה נכשלה'); return }
    setPreview(r)
    load()
  }

  const send = async (s) => {
    const t = rec?.treasurer
    if (!t) { toastError('יש לבחור גזבר לפני השליחה'); return }
    if (!window.confirm(`לשלוח את החשבון לחודש ${periodLabel(s.period)} (${nis(s.total)}) לגזבר — משפחת ${t.name}, דירה ${t.unit}${rec.cc ? ', עם העתק לחברי הוועד' : ''}?`)) return
    setBusy(`send-${s.id}`)
    const d = await callStatements({ buildingId, period: s.period, force: true })
    setBusy('')
    const r = d.results?.[0]
    if (r?.sent?.length) toast(`החשבון נשלח · ${r.sent.length} נמענים`)
    else toastError(r?.error === 'no_channel' ? 'לגזבר אין מייל או נייד' : 'השליחה נכשלה')
    load()
  }

  const act = async (key, fn, args, okMsg) => {
    setBusy(key)
    const { error } = await supabase.rpc(fn, args)
    setBusy('')
    if (error) { toastError('הפעולה נכשלה'); return }
    toast(okMsg)
    load()
  }
  const resolve = (s) => act(`res-${s.id}`, 'resolve_statement_objection', { p_statement: s.id }, 'הבירור נסגר — החשבון חזר לתור החיוב')
  const debited = (s) => {
    if (!window.confirm(`לסמן שהוראת הקבע על ${nis(s.total)} (${periodLabel(s.period)}) נשלחה לבנק? המערכת רק מתעדת — היא לא שולחת את ההוראה בעצמה.`)) return
    act(`deb-${s.id}`, 'mark_statement_debited', { p_statement: s.id }, 'סומן כחויב')
  }

  const openWording = async () => {
    const { data } = await supabase.from('billing_settings').select('*').eq('id', 'default').maybeSingle()
    setWording(data || {})
    setWordingOpen(true)
  }
  const saveWording = async () => {
    setBusy('wording')
    const patch = Object.fromEntries(WORDING.map(([k]) => [k, String(wording[k] || '').trim()]))
    patch.statement_objection_days = Math.min(30, Math.max(1, Number(wording.statement_objection_days) || 7))
    const { error } = await supabase.from('billing_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 'default')
    setBusy('')
    if (error) { toastError('השמירה נכשלה'); return }
    toast('הנוסח נשמר')
    setWordingOpen(false)
  }

  if (!rec) return null
  const t = rec.treasurer

  return (
    <SectionCard icon={FileText} title="חשבון חודשי וגזבר"
      subtitle="החשבון נשלח לגזבר לעיון. אם לא העיר עד מועד החיוב, הסכום נגבה בהוראת קבע. חיוב שממתין לאישור הוועד לא נכנס לסכום"
      actions={isAdmin && <Button size="sm" variant="outline" onClick={openWording}><PenLine className="h-4 w-4" />נוסח החשבון</Button>}>
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

        {/* The switch: automatic sending on the 1st of the month */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <div>
            <p className="text-[13px] font-semibold">שליחה אוטומטית ב-1 בחודש</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {rec.auto_send
                ? 'פעילה: ב-1 בכל חודש החשבון על החודש שהסתיים מופק ונשלח לגזבר לבד.'
                : 'כבויה: החשבון נשלח רק בלחיצה על "שליחה לגזבר".'}
            </p>
          </div>
          {isAdmin ? (
            <button type="button" role="switch" aria-checked={!!rec.auto_send} onClick={toggleAuto} disabled={!!busy}
              className={`relative h-6 w-11 rounded-full transition-colors ${rec.auto_send ? 'bg-[var(--success)]' : 'bg-[var(--outline-variant)]'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${rec.auto_send ? 'right-0.5' : 'right-[22px]'}`} />
            </button>
          ) : (
            <span className="text-[12px] font-semibold">{rec.auto_send ? 'פעילה' : 'כבויה'}</span>
          )}
        </div>

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
                    <span className={s.status === 'disputed' ? 'text-[var(--warning)] font-semibold' : readyForDebit(s) ? 'text-[var(--success)] font-semibold' : ''}>{statusText(s)}</span>
                    {Number(s.awaiting) > 0 && ` · ${nis(s.awaiting)} ממתינים לאישור הוועד`}
                  </p>
                  {s.status === 'disputed' && <p className="mt-1 text-[12px] whitespace-pre-wrap">"{s.objection_note}"</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="num-tabular font-semibold">{nis(s.total)}</span>
                  <a href={statementLink(s)} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--primary)]">פירוט</a>
                  {isAdmin && s.status === 'disputed' && (
                    <Button size="sm" variant="outline" onClick={() => resolve(s)} disabled={!!busy}>הבירור הסתיים</Button>
                  )}
                  {isAdmin && readyForDebit(s) && (
                    <Button size="sm" onClick={() => debited(s)} disabled={!!busy}>סימון כחויב</Button>
                  )}
                  {isAdmin && (s.status === 'draft' || s.status === 'sent') && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => showPreview(s.period)} disabled={!!busy}>תצוגת המייל</Button>
                      <Button size="sm" variant="outline" onClick={() => send(s)} disabled={!!busy}>
                        {busy === `send-${s.id}` ? 'שולח...' : s.status === 'sent' ? 'שליחה חוזרת' : 'שליחה לגזבר'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wording templates (all buildings) */}
      <Dialog open={wordingOpen} onOpenChange={setWordingOpen}>
        <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>נוסח החשבון החודשי</DialogTitle></DialogHeader>
          <p className="text-[12px] text-[var(--text-muted)]">
            הנוסח משותף לכל הבניינים. אפשר לשלב: <span dir="ltr">{'{building}'}</span> שם הבניין · <span dir="ltr">{'{month}'}</span> החודש · <span dir="ltr">{'{total}'}</span> הסכום · <span dir="ltr">{'{debit_date}'}</span> מועד החיוב.
          </p>
          {wording && (
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] space-y-1 mt-2">
              <span>ימים להערות לפני החיוב</span>
              <input type="number" min={1} max={30} className={field + ' max-w-[120px]'} value={wording.statement_objection_days ?? 7}
                onChange={(e) => setWording({ ...wording, statement_objection_days: e.target.value })} />
            </label>
          )}
          {wording && WORDING.map(([k, label, rows]) => (
            <label key={k} className="block text-[12px] font-semibold text-[var(--text-secondary)] space-y-1 mt-2">
              <span>{label}</span>
              {rows === 1
                ? <input className={field} value={wording[k] || ''} onChange={(e) => setWording({ ...wording, [k]: e.target.value })} />
                : <textarea rows={rows} className={area} value={wording[k] || ''} onChange={(e) => setWording({ ...wording, [k]: e.target.value })} />}
            </label>
          ))}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setWordingOpen(false)}>ביטול</Button>
            <Button size="sm" onClick={saveWording} disabled={busy === 'wording'}>{busy === 'wording' ? 'שומר...' : 'שמירה'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email preview */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{preview?.subject}</DialogTitle></DialogHeader>
          <iframe title="תצוגת המייל" sandbox="" srcDoc={preview?.html || ''} className="w-full h-[60vh] rounded-[var(--radius)] border border-[var(--border)] bg-white" />
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
