import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { periodLabel, splitLines, lineLabel, nis } from '@/lib/statements'

// Public page of one monthly statement, opened by the treasurer from the email
// or WhatsApp link. No login.
export default function StatementView() {
  const { token } = useParams()
  const [s, setS] = useState(undefined)

  useEffect(() => {
    supabase.rpc('get_statement', { p_token: token }).then(({ data, error }) => setS(error ? null : data))
  }, [token])

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
          <p className="mt-3 text-[13px] text-slate-600">סה"כ לתשלום, לפני מע"מ</p>
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
            <p className="text-[12px] text-slate-600 mb-2">לא נכללים בסכום לתשלום. האישור נעשה במסך "חשבון ועד1" באפליקציה.</p>
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

        <p className="text-[12px] text-slate-500 text-center pb-6">
          החשבון כולל רק שירותים של ועד1. את הספקים הבניין משלם ישירות, וועד1 לא מקבלת עמלה מאף ספק.
        </p>
      </div>
    </div>
  )
}
