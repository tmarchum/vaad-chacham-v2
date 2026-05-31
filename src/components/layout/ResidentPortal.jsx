import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Home, CreditCard, Megaphone, LogOut, Building2,
  CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
  Wrench, CalendarDays, Users, Plus, X, Send, Loader2,
} from 'lucide-react'

const STATUS_MAP = {
  paid:    { label: 'שולם', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  partial: { label: 'חלקי', color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
  pending: { label: 'ממתין', color: 'text-amber-600',  bg: 'bg-amber-50',   icon: Clock },
  overdue: { label: 'באיחור', color: 'text-red-600',   bg: 'bg-red-50',     icon: AlertCircle },
  unpaid:  { label: 'לא שולם', color: 'text-red-600',  bg: 'bg-red-50',     icon: AlertCircle },
}

// Issue lifecycle statuses (issues.status — default 'reported')
const ISSUE_STATUS_MAP = {
  reported:    { label: 'דווח',    color: 'text-amber-600',   bg: 'bg-amber-50' },
  open:        { label: 'פתוח',    color: 'text-amber-600',   bg: 'bg-amber-50' },
  in_progress: { label: 'בטיפול',  color: 'text-blue-600',    bg: 'bg-blue-50' },
  resolved:    { label: 'טופל',    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  closed:      { label: 'סגור',    color: 'text-slate-500',   bg: 'bg-slate-100' },
}

const ISSUE_CATEGORIES = [
  'חשמל', 'אינסטלציה', 'מעלית', 'נקיון', 'גינון',
  'תאורה', 'בטיחות', 'חניה', 'אחר',
]

const BOOKING_STATUS_MAP = {
  pending:   { label: 'ממתין לאישור', color: 'text-amber-600',   bg: 'bg-amber-50' },
  approved:  { label: 'מאושר',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  confirmed: { label: 'מאושר',        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  rejected:  { label: 'נדחה',         color: 'text-red-600',     bg: 'bg-red-50' },
  cancelled: { label: 'בוטל',         color: 'text-slate-500',   bg: 'bg-slate-100' },
}

const SLOTS = [
  { value: 'morning',  label: 'בוקר',     priceKey: 'price_morning' },
  { value: 'evening',  label: 'ערב',      priceKey: 'price_evening' },
  { value: 'full_day', label: 'יום שלם',  priceKey: 'price_full_day' },
]

export function ResidentPortal() {
  const { profile, user, signOut } = useAuth()
  const [unit, setUnit]               = useState(null)
  const [building, setBuilding]       = useState(null)
  const [payments, setPayments]       = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [residents, setResidents]     = useState([])
  const [issues, setIssues]           = useState([])
  const [resources, setResources]     = useState([])
  const [bookings, setBookings]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [expandedAnn, setExpandedAnn] = useState(null)

  // Which inline form is open: 'issue' | 'booking' | 'resident' | null
  const [openForm, setOpenForm] = useState(null)

  const unitNumber = unit?.unit_number || unit?.number || '—'
  const ownerName = `${user?.user_metadata?.given_name || ''} ${user?.user_metadata?.family_name || ''}`.trim()

  // ── Data loading ──────────────────────────────────────────────
  const loadUnitScoped = useCallback(async () => {
    if (!profile?.unit_id) return
    const [unitRes, paymentsRes, residentsRes, issuesRes] = await Promise.all([
      supabase.from('units').select('*').eq('id', profile.unit_id).maybeSingle(),
      supabase.from('payments').select('*').eq('unit_id', profile.unit_id)
        .order('month', { ascending: false }).limit(12),
      supabase.from('unit_residents').select('*').eq('unit_id', profile.unit_id)
        .eq('archived', false).order('is_primary', { ascending: false }),
      supabase.from('issues').select('*').eq('unit_id', profile.unit_id)
        .order('created_at', { ascending: false }).limit(10),
    ])
    setUnit(unitRes.data)
    setPayments(paymentsRes.data || [])
    setResidents(residentsRes.data || [])
    setIssues(issuesRes.data || [])
    return unitRes.data
  }, [profile?.unit_id])

  const loadBuildingScoped = useCallback(async (bid) => {
    if (!bid) return
    const [buildingRes, annRes, resourcesRes, bookingsRes] = await Promise.all([
      supabase.from('buildings').select('*').eq('id', bid).maybeSingle(),
      supabase.from('announcements').select('*').eq('building_id', bid)
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('booking_resources').select('*').eq('building_id', bid)
        .eq('active', true).order('name'),
      supabase.from('bookings').select('*').eq('unit_id', profile?.unit_id)
        .order('booking_date', { ascending: false }).limit(10),
    ])
    setBuilding(buildingRes.data)
    setAnnouncements(annRes.data || [])
    setResources(resourcesRes.data || [])
    setBookings(bookingsRes.data || [])
  }, [profile?.unit_id])

  useEffect(() => {
    if (!profile?.unit_id) { setLoading(false); return }
    let active = true
    ;(async () => {
      const u = await loadUnitScoped()
      if (!active) return
      const bid = u?.building_id || profile.building_id
      await loadBuildingScoped(bid)
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [profile?.unit_id, profile?.building_id, loadUnitScoped, loadBuildingScoped])

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentPayment = payments.find(p => p.month === currentMonth)

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50" style={{ fontFamily: 'inherit' }}>
      {/* ── Header ── */}
      <header className="bg-gradient-to-l from-blue-600 to-indigo-700 text-white px-4 py-4 shadow-lg">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <span className="font-black text-sm">+ו</span>
            </div>
            <div>
              <p className="font-extrabold text-[15px] leading-tight">וועד+</p>
              <p className="text-blue-200 text-[11px]">פורטל דיירים</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-xs font-medium transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            יציאה
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="max-w-xl mx-auto px-4 py-5 space-y-4">

          {/* ── Unit card ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-l from-blue-50 to-indigo-50 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
                  {unitNumber}
                </div>
                <div>
                  <p className="font-bold text-slate-900">
                    {ownerName || 'דייר'}
                  </p>
                  <p className="text-sm text-slate-500">
                    דירה {unitNumber}
                    {building?.name ? ` • ${building.name}` : ''}
                  </p>
                </div>
              </div>
            </div>
            {building && (
              <div className="px-5 py-3 flex items-center gap-2 text-sm text-slate-500">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                {[building.address, building.city].filter(Boolean).join(', ') || building.name}
              </div>
            )}
          </div>

          {/* ── Current month payment ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <p className="font-bold text-slate-800 text-sm">תשלום חודשי</p>
            </div>
            {currentPayment ? (() => {
              const st = STATUS_MAP[currentPayment.status] || STATUS_MAP.pending
              const Icon = st.icon
              return (
                <div className={`flex items-center justify-between p-3 rounded-xl ${st.bg}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4.5 w-4.5 ${st.color}`} />
                    <span className={`font-semibold text-sm ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 text-base">{formatCurrency(currentPayment.amount || 0)}</p>
                    <p className="text-xs text-slate-400">{currentPayment.month}</p>
                  </div>
                </div>
              )
            })() : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 text-slate-500 text-sm">
                <Clock className="h-4 w-4" />
                אין רשומה לחודש הנוכחי
              </div>
            )}
          </div>

          {/* ── Payment history ── */}
          {payments.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <p className="font-bold text-slate-800 text-sm mb-3">היסטוריית תשלומים</p>
              <div className="space-y-2">
                {payments.slice(0, 6).map(p => {
                  const st = STATUS_MAP[p.status] || STATUS_MAP.pending
                  return (
                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                      <span className="text-sm text-slate-600">{p.month}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">{formatCurrency(p.amount || 0)}</span>
                        <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Report a fault (פתיחת תקלות) ── */}
          <ReportIssueSection
            issues={issues}
            open={openForm === 'issue'}
            onToggle={() => setOpenForm(openForm === 'issue' ? null : 'issue')}
            onCreated={async () => { setOpenForm(null); await loadUnitScoped() }}
            profile={profile}
            user={user}
          />

          {/* ── Book a room (שיריון חדר) ── */}
          <BookRoomSection
            resources={resources}
            bookings={bookings}
            open={openForm === 'booking'}
            onToggle={() => setOpenForm(openForm === 'booking' ? null : 'booking')}
            onCreated={async () => { setOpenForm(null); await loadBuildingScoped(building?.id || profile?.building_id) }}
            profile={profile}
            user={user}
            ownerName={ownerName}
          />

          {/* ── Additional residents (דיירים נוספים) ── */}
          <ResidentsSection
            residents={residents}
            open={openForm === 'resident'}
            onToggle={() => setOpenForm(openForm === 'resident' ? null : 'resident')}
            onCreated={async () => { setOpenForm(null); await loadUnitScoped() }}
            profile={profile}
          />

          {/* ── Announcements ── */}
          {announcements.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone className="h-4 w-4 text-amber-500" />
                <p className="font-bold text-slate-800 text-sm">הודעות הבניין</p>
              </div>
              <div className="space-y-2">
                {announcements.map(a => {
                  const expanded = expandedAnn === a.id
                  return (
                    <div key={a.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedAnn(expanded ? null : a.id)}
                      >
                        <span className="text-sm font-semibold text-slate-800 text-right">{a.title}</span>
                        <div className="flex items-center gap-2 shrink-0 mr-2">
                          <span className="text-xs text-slate-400">{a.created_at ? formatDate(a.created_at) : ''}</span>
                          {expanded
                            ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                            : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          }
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-4 pb-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-2">
                          {a.content || a.body || ''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <p className="text-center text-xs text-slate-400 py-2">
            לפנייה לועד הבית — צור קשר ישירות עם מנהל הבניין
          </p>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Report a fault
   ════════════════════════════════════════════════════════════════ */
function ReportIssueSection({ issues, open, onToggle, onCreated, profile, user }) {
  const [form, setForm] = useState({ title: '', description: '', category: '', priority: 'medium' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('issues').insert({
      building_id: profile.building_id,
      unit_id: profile.unit_id,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      reported_by: user?.id || null,
      status: 'reported',
    })
    setSaving(false)
    if (error) { console.error('issue insert error', error); setError('שגיאה בשליחת התקלה. נסה שוב.'); return }
    setForm({ title: '', description: '', category: '', priority: 'medium' })
    onCreated()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-orange-500" />
          <p className="font-bold text-slate-800 text-sm">תקלות ופניות</p>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          {open ? <><X className="h-3.5 w-3.5" /> ביטול</> : <><Plus className="h-3.5 w-3.5" /> דיווח תקלה</>}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <input
            type="text" required placeholder="כותרת התקלה *"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            rows={3} placeholder="תיאור התקלה"
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">קטגוריה</option>
              {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="low">דחיפות נמוכה</option>
              <option value="medium">דחיפות רגילה</option>
              <option value="high">דחוף</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit" disabled={saving || !form.title.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            שליחת תקלה
          </button>
        </form>
      )}

      {issues.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">לא דווחו תקלות מהדירה שלך</p>
      ) : (
        <div className="space-y-2">
          {issues.map(i => {
            const st = ISSUE_STATUS_MAP[i.status] || ISSUE_STATUS_MAP.reported
            return (
              <div key={i.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{i.title}</p>
                  <p className="text-xs text-slate-400">
                    {i.category ? `${i.category} • ` : ''}{i.created_at ? formatDate(i.created_at) : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${st.bg} ${st.color}`}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Book a room
   ════════════════════════════════════════════════════════════════ */
function BookRoomSection({ resources, bookings, open, onToggle, onCreated, profile, user, ownerName }) {
  const [resourceId, setResourceId] = useState('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('morning')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selected = resources.find(r => r.id === resourceId)
  const slotPrice = selected ? Number(selected[SLOTS.find(s => s.value === slot)?.priceKey] || 0) : 0

  const submit = async (e) => {
    e.preventDefault()
    if (!resourceId || !date) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('bookings').insert({
      building_id: profile.building_id,
      resource_id: resourceId,
      unit_id: profile.unit_id,
      booker_name: ownerName || 'דייר',
      booker_phone: phone,
      booker_email: user?.email || '',
      booking_date: date,
      slot,
      status: 'pending',
      payment_status: 'pending',
      price: slotPrice,
    })
    setSaving(false)
    if (error) { console.error('booking insert error', error); setError('שגיאה בשליחת הבקשה. נסה שוב.'); return }
    setResourceId(''); setDate(''); setSlot('morning'); setPhone('')
    onCreated()
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-500" />
          <p className="font-bold text-slate-800 text-sm">שיריון חדר / מתקן</p>
        </div>
        {resources.length > 0 && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {open ? <><X className="h-3.5 w-3.5" /> ביטול</> : <><Plus className="h-3.5 w-3.5" /> שיריון חדש</>}
          </button>
        )}
      </div>

      {resources.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">אין מתקנים זמינים לשיריון בבניין</p>
      ) : (
        <>
          {open && (
            <form onSubmit={submit} className="space-y-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <select
                value={resourceId} onChange={e => setResourceId(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">בחר מתקן *</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {selected?.description && (
                <p className="text-xs text-slate-500 px-1">{selected.description}</p>
              )}
              <input
                type="date" required min={today}
                value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="grid grid-cols-3 gap-2">
                {SLOTS.map(s => {
                  const price = selected ? Number(selected[s.priceKey] || 0) : 0
                  const active = slot === s.value
                  return (
                    <button
                      key={s.value} type="button" onClick={() => setSlot(s.value)}
                      className={`py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                        active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-300'
                      }`}
                    >
                      <div>{s.label}</div>
                      {price > 0 && <div className="text-[10px] mt-0.5">{formatCurrency(price)}</div>}
                    </button>
                  )
                })}
              </div>
              <input
                type="tel" placeholder="טלפון ליצירת קשר"
                value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {slotPrice > 0 && (
                <div className="flex items-center justify-between text-sm px-1">
                  <span className="text-slate-500">עלות</span>
                  <span className="font-bold text-slate-800">{formatCurrency(slotPrice)}</span>
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit" disabled={saving || !resourceId || !date}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שליחת בקשת שיריון
              </button>
            </form>
          )}

          {bookings.length > 0 && (
            <div className="space-y-2">
              {bookings.map(b => {
                const st = BOOKING_STATUS_MAP[b.status] || BOOKING_STATUS_MAP.pending
                const res = resources.find(r => r.id === b.resource_id)
                const slotLabel = SLOTS.find(s => s.value === b.slot)?.label || b.slot
                return (
                  <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{res?.name || 'מתקן'}</p>
                      <p className="text-xs text-slate-400">
                        {b.booking_date ? formatDate(b.booking_date) : ''} • {slotLabel}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${st.bg} ${st.color}`}>{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Additional residents
   ════════════════════════════════════════════════════════════════ */
function ResidentsSection({ residents, open, onToggle, onCreated, profile }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', resident_type: 'family' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.first_name.trim()) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('unit_residents').insert({
      unit_id: profile.unit_id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      resident_type: form.resident_type,
      is_primary: false,
    })
    setSaving(false)
    if (error) { console.error('resident insert error', error); setError('שגיאה בהוספת דייר. נסה שוב.'); return }
    setForm({ first_name: '', last_name: '', phone: '', email: '', resident_type: 'family' })
    onCreated()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-500" />
          <p className="font-bold text-slate-800 text-sm">דיירי הדירה</p>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          {open ? <><X className="h-3.5 w-3.5" /> ביטול</> : <><Plus className="h-3.5 w-3.5" /> הוספת דייר</>}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" required placeholder="שם פרטי *"
              value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="text" placeholder="שם משפחה"
              value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="tel" placeholder="טלפון"
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={form.resident_type} onChange={e => setForm({ ...form, resident_type: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="family">בן משפחה</option>
              <option value="owner">בעלים</option>
              <option value="tenant">שוכר</option>
            </select>
          </div>
          <input
            type="email" placeholder="אימייל"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit" disabled={saving || !form.first_name.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            הוספה
          </button>
        </form>
      )}

      {residents.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">אין דיירים רשומים</p>
      ) : (
        <div className="space-y-2">
          {residents.map(r => {
            const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'
            const initial = (r.first_name || '?').charAt(0)
            return (
              <div key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-50">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {name}
                    {r.is_primary && <span className="text-[10px] text-teal-600 font-medium mr-1.5">• ראשי</span>}
                  </p>
                  {(r.phone || r.email) && (
                    <p className="text-xs text-slate-400 truncate">{[r.phone, r.email].filter(Boolean).join(' • ')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
