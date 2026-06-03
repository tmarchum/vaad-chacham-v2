import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ResidentBooking } from './ResidentBooking'
import {
  Home, CreditCard, Megaphone, LogOut, Building2,
  CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
  Wrench, CalendarDays, Users, Plus, X, Send, Loader2,
  UserCog, Mail, Phone, Pencil, Trash2, Ruler, Car, KeyRound,
  Layers, Hash, StickyNote, Check,
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

export function ResidentPortal() {
  const { profile, user, signOut, updateProfile } = useAuth()
  const [unit, setUnit]               = useState(null)
  const [building, setBuilding]       = useState(null)
  const [payments, setPayments]       = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [residents, setResidents]     = useState([])
  const [issues, setIssues]           = useState([])
  const [resources, setResources]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [expandedAnn, setExpandedAnn] = useState(null)

  // Which inline form is open: 'issue' | 'resident' | null
  const [openForm, setOpenForm] = useState(null)

  const unitNumber = unit?.unit_number || unit?.number || '—'
  // Prefer the saved profile name; fall back to the Google account name
  const ownerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || `${user?.user_metadata?.given_name || ''} ${user?.user_metadata?.family_name || ''}`.trim()

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
    ])
    setBuilding(buildingRes.data)
    setAnnouncements(annRes.data || [])
    setResources(resourcesRes.data || [])
  }, [])

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

          {/* ── My profile (הפרטים שלי) ── */}
          <ProfileSection
            profile={profile}
            user={user}
            ownerName={ownerName}
            updateProfile={updateProfile}
          />

          {/* ── Unit details (פרטי הדירה) ── */}
          {unit && (
            <UnitDetailsSection
              unit={unit}
              onSaved={loadUnitScoped}
            />
          )}

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

          {/* ── Book a room (שיריון חדר) — calendar, like the general system ── */}
          <ResidentBooking
            resources={resources}
            profile={profile}
            user={user}
            ownerName={ownerName}
            onCreated={() => loadBuildingScoped(building?.id || profile?.building_id)}
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
   My profile
   ════════════════════════════════════════════════════════════════ */
function ProfileSection({ profile, user, ownerName, updateProfile }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    first_name: profile?.first_name || user?.user_metadata?.given_name || '',
    last_name:  profile?.last_name  || user?.user_metadata?.family_name || '',
    phone:      profile?.phone || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const startEdit = () => {
    setForm({
      first_name: profile?.first_name || user?.user_metadata?.given_name || '',
      last_name:  profile?.last_name  || user?.user_metadata?.family_name || '',
      phone:      profile?.phone || '',
    })
    setError(null)
    setEditing(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await updateProfile({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone:      form.phone.trim(),
      })
      setEditing(false)
    } catch (err) {
      console.error('profile update error', err)
      setError('שגיאה בשמירת הפרטים. נסה שוב.')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-indigo-500" />
          <p className="font-bold text-slate-800 text-sm">הפרטים שלי</p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <Pencil className="h-3.5 w-3.5" /> עריכה
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" placeholder="שם פרטי"
              value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="text" placeholder="שם משפחה"
              value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <input
            type="tel" placeholder="טלפון"
            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {/* Email is the login identity — read-only */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50 text-slate-400 text-sm">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{user?.email}</span>
            <span className="text-[10px] mr-auto shrink-0">לא ניתן לשינוי</span>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              שמירה
            </button>
            <button
              type="button" onClick={() => setEditing(false)}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <UserCog className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-700 font-medium">{ownerName || 'דייר'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Mail className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-600 truncate">{user?.email || '—'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-600">{profile?.phone || 'לא הוזן טלפון'}</span>
          </div>
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
   Unit details — view + edit
   ════════════════════════════════════════════════════════════════ */
function UnitDetailsSection({ unit, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    floor: unit.floor ?? '',
    rooms: unit.rooms ?? '',
    area: unit.area ?? '',
    storage_number: unit.storage_number ?? '',
    parking_gate_phone: unit.parking_gate_phone ?? '',
    notes: unit.notes ?? '',
  })

  const startEdit = () => {
    setForm({
      floor: unit.floor ?? '',
      rooms: unit.rooms ?? '',
      area: unit.area ?? '',
      storage_number: unit.storage_number ?? '',
      parking_gate_phone: unit.parking_gate_phone ?? '',
      notes: unit.notes ?? '',
    })
    setError(null); setEditing(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const { error } = await supabase.from('units').update({
      floor: form.floor === '' ? null : Number(form.floor),
      rooms: form.rooms === '' ? null : Number(form.rooms),
      area: form.area === '' ? null : Number(form.area),
      storage_number: form.storage_number,
      parking_gate_phone: form.parking_gate_phone,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }).eq('id', unit.id)
    setSaving(false)
    if (error) { console.error('unit update error', error); setError('שגיאה בשמירת פרטי הדירה.'); return }
    setEditing(false)
    onSaved?.()
  }

  const parkingCount = Array.isArray(unit.parking_spots) ? unit.parking_spots.length : (unit.parking_spots ? 1 : 0)

  const Row = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-2.5 text-sm py-1">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <span className="text-slate-400 w-24 shrink-0">{label}</span>
      <span className="text-slate-700 font-medium">{value || '—'}</span>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-blue-600" />
          <p className="font-bold text-slate-800 text-sm">פרטי הדירה</p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
            <Pencil className="h-3.5 w-3.5" /> עריכה
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">קומה
              <input type="number" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
            <label className="text-xs text-slate-500">חדרים
              <input type="number" step="0.5" value={form.rooms} onChange={e => setForm({ ...form, rooms: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
            <label className="text-xs text-slate-500">שטח (מ״ר)
              <input type="number" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
          </div>
          <label className="text-xs text-slate-500 block">מספר מחסן
            <input type="text" value={form.storage_number} onChange={e => setForm({ ...form, storage_number: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </label>
          <label className="text-xs text-slate-500 block">טלפון שער חניה
            <input type="tel" value={form.parking_gate_phone} onChange={e => setForm({ ...form, parking_gate_phone: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </label>
          <label className="text-xs text-slate-500 block">הערות
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-0.5">
          <Row icon={Hash}   label="מספר דירה" value={unit.unit_number || unit.number} />
          <Row icon={Layers} label="קומה"      value={unit.floor} />
          <Row icon={Home}   label="חדרים"     value={unit.rooms} />
          <Row icon={Ruler}  label="שטח"       value={unit.area ? `${unit.area} מ״ר` : ''} />
          <Row icon={KeyRound} label="מחסן"    value={unit.storage_number} />
          <Row icon={Car}    label="חניות"     value={parkingCount > 0 ? parkingCount : ''} />
          <Row icon={Phone}  label="שער חניה"  value={unit.parking_gate_phone} />
          {unit.monthly_fee != null && (
            <Row icon={CreditCard} label="דמי ועד" value={formatCurrency(unit.monthly_fee)} />
          )}
          {unit.notes && <Row icon={StickyNote} label="הערות" value={unit.notes} />}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Additional residents
   ════════════════════════════════════════════════════════════════ */
const RESIDENT_TYPES = [
  { value: 'family', label: 'בן משפחה' },
  { value: 'owner',  label: 'בעלים' },
  { value: 'tenant', label: 'שוכר' },
]
const residentTypeLabel = (t) => RESIDENT_TYPES.find(x => x.value === t)?.label || ''

const EMPTY_RESIDENT = { first_name: '', last_name: '', phone: '', email: '', resident_type: 'family' }

function ResidentsSection({ residents, open, onToggle, onCreated, profile }) {
  const [form, setForm] = useState(EMPTY_RESIDENT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_RESIDENT)

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
    setForm(EMPTY_RESIDENT)
    onCreated()
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({
      first_name: r.first_name || '', last_name: r.last_name || '',
      phone: r.phone || '', email: r.email || '',
      resident_type: r.resident_type || 'family',
    })
    setError(null)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const { error } = await supabase.from('unit_residents').update({
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email.trim(),
      resident_type: editForm.resident_type,
      updated_at: new Date().toISOString(),
    }).eq('id', editingId)
    setSaving(false)
    if (error) { console.error('resident update error', error); setError('שגיאה בעדכון. נסה שוב.'); return }
    setEditingId(null)
    onCreated()
  }

  const removeResident = async (r) => {
    if (!window.confirm(`להסיר את ${r.first_name || 'הדייר'} מהדירה?`)) return
    const { error } = await supabase.from('unit_residents').update({ archived: true }).eq('id', r.id)
    if (error) { console.error('resident archive error', error); return }
    onCreated()
  }

  const fieldCls = 'px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  const ResidentForm = ({ value, onChange }) => (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" required placeholder="שם פרטי *" value={value.first_name}
          onChange={e => onChange({ ...value, first_name: e.target.value })} className={fieldCls} />
        <input type="text" placeholder="שם משפחה" value={value.last_name}
          onChange={e => onChange({ ...value, last_name: e.target.value })} className={fieldCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="tel" placeholder="טלפון" value={value.phone}
          onChange={e => onChange({ ...value, phone: e.target.value })} className={fieldCls} />
        <select value={value.resident_type} onChange={e => onChange({ ...value, resident_type: e.target.value })}
          className={`${fieldCls} bg-white`}>
          {RESIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <input type="email" placeholder="אימייל" value={value.email}
        onChange={e => onChange({ ...value, email: e.target.value })} className={`w-full ${fieldCls}`} />
    </>
  )

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
          <ResidentForm value={form} onChange={setForm} />
          {error && !editingId && <p className="text-xs text-red-500">{error}</p>}
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
            const typeLabel = residentTypeLabel(r.resident_type)

            if (editingId === r.id) {
              return (
                <form key={r.id} onSubmit={saveEdit} className="space-y-3 p-3 rounded-xl bg-slate-50 border border-teal-200">
                  <ResidentForm value={editForm} onChange={setEditForm} />
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      שמירה
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}
                      className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                      ביטול
                    </button>
                  </div>
                </form>
              )
            }

            return (
              <div key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-50">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {name}
                    {typeLabel && <span className="text-[10px] text-slate-400 font-medium mr-1.5">· {typeLabel}</span>}
                    {r.is_primary && <span className="text-[10px] text-teal-600 font-medium mr-1.5">• ראשי</span>}
                  </p>
                  {(r.phone || r.email) && (
                    <p className="text-xs text-slate-400 truncate">{[r.phone, r.email].filter(Boolean).join(' • ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(r)} className="p-1.5 text-slate-400 hover:text-blue-600" title="עריכה">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!r.is_primary && (
                    <button onClick={() => removeResident(r)} className="p-1.5 text-slate-400 hover:text-red-500" title="הסרה">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
