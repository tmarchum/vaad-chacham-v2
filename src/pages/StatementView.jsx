import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { periodLabel, splitLines, lineLabel, nis, heDate } from '@/lib/statements'

// Public page of one monthly statement, opened by the treasurer from the email
// or WhatsApp link. No login.
export default function StatementView() {
  const { token } = useParams()
  const [s, setS] = useState(undefined)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    supabase.rpc('get_statement', { p_token: token }).then(({ data, error }) => setS(error ? null : data))
  }, [token])
  useEffect(() => { load() }, [load])

  const sendObjection = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('billing-statements', { body: { objection: { token, note } } })
    setBusy(false)
    if (error || !data?.ok) { setErr(data?.error === 'empty' ? 'כתבו בכמה מילים מה הבעיה' : 'השליחה נכשלה. נסו שוב'); return }
    setOpen(false); setNote(''); load()
  }

  if (s === undefined) return <div dir="rtl" className="min-h-screen grid place-items-center text-[14px] text-slate-500">טוען...</div>
  if (!s) return <div dir="rtl" className="min-h-screen grid place-items-center text-[14px] text-slate-500">החשבון לא נמצא</div>
  const { billed, awaiting } = splitLines(s.lines)

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <header className="flex items-center justify-between">
          <span className="text-[18px] font-extrabold">ועד<span className="text-blue-600">1</span></span>
          <span className="text-[12px] text-slate-500">חשבון חודשי</span>
        </header>

        <section className="rounded-xl bg-white border border-slate-200 p-4">
          <h1 className="text-[20px] font-bold">{s.building}</h1>
          <p className="text-[13px] text-slate-600">{periodLabel(s.period)}</p>
          <p className="mt-3 text-[13px] text-slate-600">סה"כ לחיוב, לפני מע"מ</p>
          <p className="text-[30px] font-extrabold tabular-nums">{nis(s.total)}</p>
        </section>

        <section className="rounded-xl bg-white border border-slate-200 p-4">
          <h2 className="text-[15px] font-bold mb-2">פירוט</h2>
          <div className="divide-y divide-slate-100">
            {billed.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2 text-[14px]">
                <span>{lineLabel(l)}</span>
                <span className="tabular-nums whitespace-nowrap">{nis(l.amount)}</span>
              </div>
            ))}
          </div>
        </section>

        {awaiting.length > 0 && (
          <section className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <h2 className="text-[15px] font-bold">ממתינים לאישור הוועד · {nis(s.awaiting)}</h2>
            <p className="text-[12px] text-slate-600 mb-2">לא נכללים בסכום לחיוב. האישור נעשה במסך "חשבון ועד1" באפליקציה.</p>
            <div className="divide-y divide-amber-100">
              {awaiting.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-2 text-[14px]">
                  <span>{lineLabel(l)}</span>
                  <span className="tabular-nums whitespace-nowrap">{nis(l.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No payment here: ועד1 collects by direct debit unless a problem is raised. */}
        {s.status === 'sent' && (
          <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
            <h2 className="text-[15px] font-bold">אין צורך לשלם</h2>
            <p className="text-[14px]">
              הסכום ייגבה בהוראת קבע (מס"ב){s.debit_on ? <> ב-<b>{heDate(s.debit_on)}</b></> : ''}. אם הכול בסדר, לא צריך לעשות דבר.
            </p>
            {!open ? (
              <button type="button" onClick={() => setOpen(true)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[14px] font-semibold">יש בעיה בחשבון</button>
            ) : (
              <div className="space-y-2">
                <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="מה לא נכון בחשבון?" className="w-full rounded-lg border border-slate-300 p-2 text-[14px]" />
                {err && <p className="text-[12px] text-red-600">{err}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={sendObjection}
                    className="rounded-lg bg-blue-600 text-white px-3 py-2 text-[14px] font-semibold disabled:opacity-60">{busy ? 'שולח...' : 'שליחה ועיכוב החיוב'}</button>
                  <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-[14px] text-slate-600">ביטול</button>
                </div>
              </div>
            )}
          </section>
        )}
        {s.status === 'disputed' && (
          <section className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <h2 className="text-[15px] font-bold">החיוב מעוכב עד לבירור</h2>
            <p className="text-[13px] text-slate-600 mb-1">ההערה שלכם התקבלה, וניצור קשר. הוראת הקבע לא תצא עד שהנושא ייסגר.</p>
            <p className="text-[14px] whitespace-pre-wrap">{s.objection_note}</p>
          </section>
        )}
        {s.status === 'paid' && (
          <section className="rounded-xl bg-white border border-slate-200 p-4">
            <p className="text-[14px]">החשבון חויב בהוראת קבע{s.debited_at ? ` ב-${new Date(s.debited_at).toLocaleDateString('he-IL')}` : ''}.</p>
          </section>
        )}
        <p className="text-[12px] text-slate-500 text-center pb-6 whitespace-pre-wrap">
          {s.footer || 'החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות, וועד1 לא מקבלת עמלה מאף ספק.'}
        </p>
      </div>
    </div>
  )
}
