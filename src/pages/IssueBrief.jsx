import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Public job page for a vendor asked to quote or handle an issue. Opened from
// the WhatsApp message; no login. Shows only the job, the address and photos.
export default function IssueBrief() {
  const { token } = useParams()
  const [brief, setBrief] = useState(undefined)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.rpc('get_issue_brief', { p_token: token }).then(({ data, error }) => setBrief(error ? null : data))
  }, [token])

  if (brief === undefined) return <div dir="rtl" className="min-h-screen grid place-items-center text-[14px] text-slate-500">טוען...</div>
  if (!brief) return <div dir="rtl" className="min-h-screen grid place-items-center text-[14px] text-slate-500">הקריאה לא נמצאה</div>

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <header className="flex items-center justify-between">
          <span className="text-[18px] font-extrabold">ועד<span className="text-blue-600">1</span></span>
          <span className="text-[12px] text-slate-500">פרטי עבודה לספק{brief.ticket_no ? ` · קריאה #${brief.ticket_no}` : ''}</span>
        </header>

        <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
          <h1 className="text-[20px] font-bold">{brief.title}</h1>
          <p className="text-[13px] text-slate-600">📍 {brief.address}</p>
          {brief.category && <p className="text-[13px] text-slate-600">🔧 {brief.category}</p>}
          {brief.description && <p className="text-[15px] whitespace-pre-wrap pt-1">{brief.description}</p>}
        </section>

        {brief.notes?.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
            <h2 className="text-[15px] font-bold">פרטים נוספים מהוועד</h2>
            {brief.notes.map((n, i) => (
              <p key={i} className="text-[14px] whitespace-pre-wrap border-r-2 border-blue-200 pr-2">{n.body}</p>
            ))}
          </section>
        )}

        {brief.photos?.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
            <h2 className="text-[15px] font-bold">תמונות ({brief.photos.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {brief.photos.map((u) => (
                <button key={u} onClick={() => setOpen(u)} className="block aspect-square overflow-hidden rounded-lg border border-slate-200">
                  <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="text-[12px] text-slate-500 text-center pb-6">להצעת מחיר או תיאום — יש להשיב להודעת הוואטסאפ שבה התקבל הקישור.</p>
      </div>
      {open && (
        <button onClick={() => setOpen(null)} className="fixed inset-0 bg-black/85 grid place-items-center p-3">
          <img src={open} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  )
}
