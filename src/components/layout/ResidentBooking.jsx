import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'

const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'
import {
  CalendarDays, ChevronRight, ChevronLeft, Sun, Moon, Sparkles,
  X, Send, Loader2, DoorOpen, Clock, CheckCircle2, Ban,
} from 'lucide-react'

// ── Slot model (resident portal) ──────────────────────────────────
//  Sun–Thu : morning + evening
//  Friday  : morning only (no Friday evening)
//  Saturday: "full Shabbat" = Friday eve + Saturday morning + Saturday eve (one slot)
const SLOTS = {
  morning:  { label: 'בוקר',     sub: '08:00–14:00',     priceKey: 'price_morning',  icon: Sun,      color: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700' },
  evening:  { label: 'ערב',      sub: '16:00–23:00',     priceKey: 'price_evening',  icon: Moon,     color: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  full_day: { label: 'שבת מלאה', sub: 'שישי ערב – מוצ״ש', priceKey: 'price_full_day', icon: Sparkles, color: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
}

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

const BOOKING_STATUS = {
  pending:   { label: 'ממתין לאישור', color: 'text-amber-600',   bg: 'bg-amber-50' },
  approved:  { label: 'מאושר',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  confirmed: { label: 'מאושר',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  rejected:  { label: 'נדחה',         color: 'text-red-600',     bg: 'bg-red-50' },
  cancelled: { label: 'בוטל',         color: 'text-slate-500',   bg: 'bg-slate-100' },
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Which slots are offered on a given day-of-week (0=Sun … 6=Sat)
function slotsForDow(dow) {
  if (dow === 6) return ['full_day']        // Saturday → full Shabbat
  if (dow === 5) return ['morning']         // Friday → morning only
  return ['morning', 'evening']             // Sun–Thu
}

export function ResidentBooking({ resources, profile, user, ownerName, onCreated }) {
  const [resourceId, setResourceId] = useState(resources[0]?.id || '')
  const [bookings, setBookings] = useState([])
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [selectedDk, setSelectedDk] = useState(null)   // day picked in calendar
  const [slot, setSlot] = useState(null)
  const [phone, setPhone] = useState(profile?.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const resource = resources.find(r => r.id === resourceId) || resources[0] || null

  // Reset selection when resource changes
  useEffect(() => { setSelectedDk(null); setSlot(null) }, [resourceId])

  // ── Load all bookings for the selected resource (for availability + my list) ──
  const loadBookings = useCallback(async () => {
    if (!resource) return
    const { data } = await supabase.from('bookings').select('*').eq('resource_id', resource.id)
    setBookings(data || [])
  }, [resource])

  useEffect(() => { loadBookings() }, [loadBookings])

  // Taken slots: "dk|slot" for bookings that are not cancelled/rejected
  const takenSlots = useMemo(() => {
    const s = new Set()
    bookings.forEach(b => {
      if (b.status === 'cancelled' || b.status === 'rejected') return
      s.add(`${b.booking_date}|${b.slot}`)
    })
    return s
  }, [bookings])

  const blockedDates = useMemo(() => new Set(resource?.blocked_dates || []), [resource])

  // ── Calendar grid ──
  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    const startDow = first.getDay()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + (resource?.max_advance_days || 60))
    const days = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(calYear, calMonth, d)
      const dk = dateKey(date)
      const dow = date.getDay()
      const offered = slotsForDow(dow)
      const available = offered.filter(sl => !takenSlots.has(`${dk}|${sl}`))
      const isPast = date < today
      const isTooFar = date > maxDate
      const isBlocked = blockedDates.has(dk)
      days.push({
        day: d, dk, dow, date,
        offered, available,
        isPast, isTooFar, isBlocked,
        canBook: !isPast && !isTooFar && !isBlocked && available.length > 0,
        isSaturday: dow === 6, isFriday: dow === 5,
      })
    }
    return days
  }, [calYear, calMonth, takenSlots, blockedDates, resource])

  const selectedDay = calendarDays.find(d => d && d.dk === selectedDk) || null

  const myBookings = useMemo(() =>
    bookings
      .filter(b => b.unit_id === profile?.unit_id)
      .sort((a, b) => new Date(b.booking_date) - new Date(a.booking_date)),
    [bookings, profile?.unit_id]
  )

  const slotPrice = (sl) => resource ? Number(resource[SLOTS[sl].priceKey] || 0) : 0

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }

  const pickDay = (d) => {
    if (!d.canBook) return
    setSelectedDk(d.dk)
    setSlot(d.available[0])
    setTermsAccepted(false)
    setError(null); setOk(false)
  }

  // Notify the vaad rep + the resident by email. Booking emails carry no caseId,
  // so they are NOT blocked by the collection-notifications toggle.
  const sendBookingNotification = async (booking) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const dateStr = new Date(booking.booking_date).toLocaleDateString('he-IL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const slotLabel = SLOTS[booking.slot]?.label || booking.slot
      const row = (k, v) => `<tr><td style="padding:6px 10px;color:#64748b;">${k}</td><td style="padding:6px 10px;font-weight:bold;">${v}</td></tr>`
      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:18px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">שיריון ${resource.name}</h2>
          </div>
          <div style="background:#f8fafc;padding:18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;">
              ${row('תאריך', dateStr)}
              ${row('משבצת', slotLabel)}
              ${row('שם המזמין', booking.booker_name || '')}
              ${booking.booker_phone ? row('טלפון', booking.booker_phone) : ''}
              ${booking.booker_email ? row('מייל', booking.booker_email) : ''}
              ${Number(booking.price) > 0 ? row('מחיר', formatCurrency(booking.price)) : ''}
            </table>
            <p style="margin-top:14px;color:#475569;">הבקשה התקבלה וממתינה לאישור נציג הוועד.</p>
          </div>
        </div>`
      const send = (to, subject) => fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ to, subject, html, buildingId: profile.building_id }),
      }).catch(e => console.error('booking email send error', e))

      const tasks = []
      if (resource.notify_email) tasks.push(send(resource.notify_email, `שיריון חדש ממתין לאישור — ${resource.name}`))
      if (booking.booker_email) tasks.push(send(booking.booker_email, `בקשת השיריון שלך התקבלה — ${resource.name}`))
      await Promise.all(tasks)
    } catch (e) {
      console.error('sendBookingNotification error', e)
    }
  }

  const submit = async () => {
    if (!resource || !selectedDay || !slot) return
    // Rental terms must be accepted when the resource defines them
    if (resource.rental_terms && !termsAccepted) {
      setError('יש לאשר את תנאי ההשכרה כדי להמשיך')
      return
    }
    setSaving(true); setError(null)
    const bookingData = {
      building_id: profile.building_id,
      resource_id: resource.id,
      unit_id: profile.unit_id,
      booker_name: ownerName || 'דייר',
      booker_phone: phone,
      booker_email: user?.email || '',
      booking_date: selectedDay.dk,
      slot,
      status: 'pending',
      payment_status: 'pending',
      price: slotPrice(slot),
      terms_accepted: !!resource.rental_terms && termsAccepted,
    }
    const { error } = await supabase.from('bookings').insert(bookingData)
    if (error) { setSaving(false); console.error('booking insert error', error); setError('שגיאה בשליחת הבקשה. נסה שוב.'); return }

    // Send the notification emails BEFORE any redirect (so the requests aren't cancelled)
    await sendBookingNotification(bookingData)

    setSaving(false)
    setSelectedDk(null); setSlot(null); setOk(true)
    await loadBookings()
    onCreated?.()

    // Straight to the payment link (PayBox / Bit) configured for this resource
    if (resource.payment_url) {
      window.location.href = resource.payment_url
    }
  }

  // Cancel one of my own pending/approved bookings — frees the slot
  const cancelBooking = async (bk) => {
    if (!window.confirm('לבטל את השריון?')) return
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bk.id)
    if (error) { console.error('cancel error', error); return }
    await loadBookings()
    onCreated?.()
  }

  if (resources.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="h-4 w-4 text-violet-500" />
          <p className="font-bold text-slate-800 text-sm">שיריון חדר / מתקן</p>
        </div>
        <p className="text-sm text-slate-400 text-center py-2">אין מתקנים זמינים לשיריון בבניין</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-violet-500" />
        <p className="font-bold text-slate-800 text-sm">שיריון חדר / מתקן</p>
      </div>

      {/* Resource selector */}
      {resources.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {resources.map(r => (
            <button
              key={r.id} onClick={() => setResourceId(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                resource?.id === r.id
                  ? 'border-violet-400 bg-violet-50 text-violet-800'
                  : 'border-slate-200 text-slate-500 hover:border-violet-200'
              }`}
            >
              <DoorOpen className="h-3.5 w-3.5 inline-block ml-1" />{r.name}
            </button>
          ))}
        </div>
      )}

      {resource?.description && (
        <p className="text-xs text-slate-500 mb-3">{resource.description}</p>
      )}

      {/* Price summary */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(SLOTS).map(([k, s]) => {
          const p = slotPrice(k)
          if (p <= 0) return null
          return (
            <span key={k} className={`text-[11px] px-2 py-1 rounded-full ${s.badge}`}>
              {s.label}: {formatCurrency(p)}
            </span>
          )
        })}
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight className="h-4 w-4 text-slate-500" /></button>
        <h4 className="text-sm font-bold text-slate-700">{HEBREW_MONTHS[calMonth]} {calYear}</h4>
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft className="h-4 w-4 text-slate-500" /></button>
      </div>

      {/* Calendar */}
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center py-1.5 text-[11px] font-bold ${i === 6 ? 'text-blue-600' : 'text-slate-400'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="aspect-square border-b border-l border-slate-50 bg-slate-50/40" />
            const selected = day.dk === selectedDk
            return (
              <button
                key={day.dk}
                onClick={() => pickDay(day)}
                disabled={!day.canBook}
                className={`aspect-square border-b border-l border-slate-50 flex flex-col items-center justify-center gap-0.5 transition-all relative ${
                  selected ? 'bg-violet-100 ring-2 ring-violet-400 ring-inset'
                  : day.isBlocked ? 'bg-red-50/50 cursor-not-allowed'
                  : day.isPast || day.isTooFar ? 'bg-slate-50/40 cursor-not-allowed opacity-50'
                  : day.canBook ? (day.isSaturday ? 'bg-blue-50/40 hover:bg-violet-50' : 'hover:bg-violet-50')
                  : 'bg-amber-50/30 cursor-not-allowed'
                }`}
              >
                <span className={`text-xs font-semibold ${day.isSaturday ? 'text-blue-600' : 'text-slate-700'}`}>{day.day}</span>
                {day.isBlocked ? (
                  <Ban className="h-2.5 w-2.5 text-red-400" />
                ) : (
                  <div className="flex gap-0.5 h-1.5">
                    {day.offered.map(sl => {
                      const free = day.available.includes(sl)
                      return <span key={sl} className={`w-1.5 h-1.5 rounded-full ${free ? (sl === 'morning' ? 'bg-amber-400' : sl === 'evening' ? 'bg-indigo-400' : 'bg-purple-400') : 'bg-slate-200'}`} />
                    })}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> בוקר</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400" /> ערב</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> שבת מלאה</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200" /> תפוס</span>
      </div>

      {ok && (
        <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">
          <CheckCircle2 className="h-4 w-4" /> הבקשה נשלחה — ממתינה לאישור הוועד
        </div>
      )}

      {/* Slot picker for the selected day */}
      {selectedDay && (
        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              {selectedDay.date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <button onClick={() => setSelectedDk(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>

          <div className={`grid gap-2 ${selectedDay.available.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {selectedDay.available.map(sl => {
              const s = SLOTS[sl]
              const Icon = s.icon
              const active = slot === sl
              return (
                <button
                  key={sl} onClick={() => setSlot(sl)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    active ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-200'
                  }`}
                >
                  <Icon className={`h-5 w-5 mx-auto mb-1 ${active ? 'text-violet-600' : s.color}`} />
                  <p className="text-xs font-semibold text-slate-700">{s.label}</p>
                  <p className="text-[10px] text-slate-400">{s.sub}</p>
                  {slotPrice(sl) > 0 && <p className="text-[11px] font-bold text-slate-700 mt-0.5">{formatCurrency(slotPrice(sl))}</p>}
                </button>
              )
            })}
          </div>

          <input
            type="tel" placeholder="טלפון ליצירת קשר"
            value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />

          {/* Rental terms — must be accepted before submitting */}
          {resource.rental_terms && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold text-slate-600 mb-1">תנאי השכרה</p>
              <div className="max-h-28 overflow-y-auto text-xs text-slate-600 whitespace-pre-line leading-relaxed mb-2 pl-1">
                {resource.rental_terms}
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox" checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                קראתי ואני מאשר/ת את תנאי ההשכרה
              </label>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={submit} disabled={saving || !slot || (!!resource.rental_terms && !termsAccepted)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            שליחת בקשת שיריון
          </button>
        </div>
      )}

      {/* My bookings */}
      {myBookings.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-slate-500 mb-2">השיריונים שלי</p>
          <div className="space-y-2">
            {myBookings.map(b => {
              const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending
              const slotLabel = SLOTS[b.slot]?.label || b.slot
              const canCancel = b.status === 'pending' || b.status === 'approved'
              return (
                <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) : ''} • {slotLabel}
                    </p>
                    {Number(b.price) > 0 && <p className="text-xs text-slate-400">{formatCurrency(b.price)}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                    {canCancel && (
                      <button onClick={() => cancelBooking(b)} className="text-slate-300 hover:text-red-500" title="ביטול">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
