import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate, calcUnitFee } from '@/lib/utils'
import { ResidentBooking } from './ResidentBooking'
import {
  Home, CreditCard, Megaphone, LogOut, Building2,
  CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
  Wrench, CalendarDays, Users, Plus, X, Send, Loader2,
  UserCog, Mail, Phone, Pencil, Trash2, Ruler, Car, KeyRound,
  Layers, Hash, StickyNote, Check, Star,
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
  // How much this unit is supposed to pay: individual amount → defined tier → board-member discount
  const expectedFee = calcUnitFee(unit, building)

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

          {/* ── Unit details (פרטי הדירה) — includes owner block for rented units ── */}
          {unit && (
            <UnitDetailsSection
              unit={unit}
              building={building}
              onSaved={loadUnitScoped}
            />
          )}

          {/* ── Monthly dues ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <p className="font-bold text-slate-800 text-sm">תשלום חודשי</p>
            </div>

            {/* Expected monthly amount — always shown */}
            {expectedFee > 0 && (
              <>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <span className="text-sm text-slate-500">סכום חודשי קבוע</span>
                  <span className="font-extrabold text-slate-900 text-lg">{formatCurrency(expectedFee)}</span>
                </div>
                {unit?.board_member && building?.board_member_discount > 0 && (
                  <p className="text-[11px] text-emerald-600 -mt-1 mb-3">כולל הנחת חבר ועד {building.board_member_discount}%</p>
                )}
              </>
            )}

            {/* Current month payment status */}
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
                טרם הופק חיוב לחודש {currentMonth}
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

          {/* ── Residents — grouped by unit type (owned/rented) ── */}
          <ResidentsSection
            unit={unit}
            residents={residents}
            profile={profile}
            onChanged={loadUnitScoped}
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

/* ── Small array editor (chips + add) ── */
function ListEditor({ label, items, onChange, placeholder }) {
  const [val, setVal] = useState('')
  const add = () => {
    const v = val.trim()
    if (!v) return
    onChange([...items, v]); setVal('')
  }
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 text-sm text-slate-700">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">הוסף</button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Unit details — full view + edit (mirrors the admin Units model)
   ════════════════════════════════════════════════════════════════ */
const buildUnitForm = (unit) => {
  const cf = unit.custom_fields || {}
  return {
    number: unit.number || unit.unit_number || '',
    floor: unit.floor ?? '',
    rooms: unit.rooms ?? '',
    area: unit.area > 0 ? unit.area : '',
    unit_type: cf.unit_type || 'owned',
    board_member: !!unit.board_member,
    parking_spots: Array.isArray(unit.parking_spots) ? unit.parking_spots : [],
    storage_numbers: Array.isArray(cf.storage_numbers) ? cf.storage_numbers : (unit.storage_number ? [unit.storage_number] : []),
    key_numbers: Array.isArray(unit.key_numbers) ? unit.key_numbers : [],
    parking_gate_phones: Array.isArray(cf.parking_gate_phones) ? cf.parking_gate_phones : (unit.parking_gate_phone ? [unit.parking_gate_phone] : []),
    notes: unit.notes || '',
  }
}

/* ── Owner details block (shown inside the unit card for rented units) ──
   Stored on the unit itself (custom_fields.owner) — completely separate from
   the "דיירי הדירה" list, so changing the unit type never reclassifies a
   resident into the owner (or vice-versa). */
const EMPTY_OWNER = { first_name: '', last_name: '', phone: '', email: '' }
function OwnerDetails({ unit, onSaved }) {
  const owner = unit.custom_fields?.owner || null
  const hasOwner = !!(owner && (owner.first_name || owner.last_name || owner.phone || owner.email))

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_OWNER)

  const startEdit = () => {
    setForm(owner
      ? { first_name: owner.first_name || '', last_name: owner.last_name || '', phone: owner.phone || '', email: owner.email || '' }
      : EMPTY_OWNER)
    setError(null); setEditing(true)
  }

  // first name, last name and mobile are required; email is optional
  const ownerValid = form.first_name.trim() && form.last_name.trim() && form.phone.trim()

  const submit = async (e) => {
    e.preventDefault()
    if (!ownerValid) { setError('יש למלא שם פרטי, שם משפחה ונייד.'); return }
    setSaving(true); setError(null)
    const cf = unit.custom_fields || {}
    const { error } = await supabase.from('units').update({
      custom_fields: {
        ...cf,
        owner: {
          first_name: form.first_name.trim(), last_name: form.last_name.trim(),
          phone: form.phone.trim(), email: form.email.trim(),
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', unit.id)
    setSaving(false)
    if (error) { console.error('owner save error', error); setError('שגיאה בשמירת פרטי בעלים.'); return }
    setEditing(false); onSaved?.()
  }

  const ownerName = owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : ''
  const inputCls = 'mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-amber-500" />
          <p className="font-bold text-slate-800 text-sm">פרטי בעלים</p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
            <Pencil className="h-3.5 w-3.5" /> {hasOwner ? 'עריכה' : 'הוספה'}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">שם פרטי *
              <input type="text" required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">שם משפחה *
              <input type="text" required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            </label>
          </div>
          <label className="text-xs text-slate-500 block">נייד *
            <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs text-slate-500 block">מייל
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !ownerValid}
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
      ) : hasOwner ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 text-sm">
            <UserCog className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-700 font-medium">{ownerName || '—'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-600">{owner.phone || '—'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Mail className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-slate-600 truncate">{owner.email || '—'}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-1">לא הוזנו פרטי בעלים</p>
      )}
    </div>
  )
}

function UnitDetailsSection({ unit, building, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(() => buildUnitForm(unit))

  const startEdit = () => { setForm(buildUnitForm(unit)); setError(null); setEditing(true) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const cf = unit.custom_fields || {}
    const { data, error } = await supabase.from('units').update({
      number: form.number,
      floor: form.floor === '' ? null : Number(form.floor),
      rooms: form.rooms === '' ? null : Number(form.rooms),
      area: form.area === '' ? null : Number(form.area),
      board_member: form.board_member,
      parking_spots: form.parking_spots,
      storage_number: form.storage_numbers[0] || '',
      key_numbers: form.key_numbers,
      parking_gate_phone: form.parking_gate_phones[0] || '',
      custom_fields: {
        ...cf,
        unit_type: form.unit_type,
        storage_numbers: form.storage_numbers,
        parking_gate_phones: form.parking_gate_phones,
      },
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }).eq('id', unit.id).select()
    setSaving(false)
    if (error) { console.error('unit update error', error); setError('שגיאה בשמירת פרטי הדירה.'); return }
    // RLS that blocks the row returns success with 0 rows — surface that clearly.
    if (!data || data.length === 0) { setError('העדכון לא נשמר — ייתכן שאין הרשאה לעדכן דירה זו.'); return }
    setEditing(false)
    onSaved?.()
  }

  const cf = unit.custom_fields || {}
  const unitType = cf.unit_type || 'owned'
  const storageList = Array.isArray(cf.storage_numbers) && cf.storage_numbers.length ? cf.storage_numbers : (unit.storage_number ? [unit.storage_number] : [])
  const gatePhones = Array.isArray(cf.parking_gate_phones) && cf.parking_gate_phones.length ? cf.parking_gate_phones : (unit.parking_gate_phone ? [unit.parking_gate_phone] : [])
  const parkingList = Array.isArray(unit.parking_spots) ? unit.parking_spots : []
  const keyList = Array.isArray(unit.key_numbers) ? unit.key_numbers : []
  const effectiveFee = (unit.monthly_fee && unit.monthly_fee > 0) ? unit.monthly_fee : (building?.monthly_fee ?? null)

  const Row = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-2.5 text-sm py-1">
      <Icon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
      <span className="text-slate-400 w-24 shrink-0">{label}</span>
      <span className="text-slate-700 font-medium">{value || '—'}</span>
    </div>
  )
  const inputCls = 'mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

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
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">מספר דירה
              <input type="text" value={form.number} onChange={e => set('number', e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">סוג
              <select value={form.unit_type} onChange={e => set('unit_type', e.target.value)} className={`${inputCls} bg-white`}>
                <option value="owned">בבעלות</option>
                <option value="rented">שכירות</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">קומה
              <input type="number" value={form.floor} onChange={e => set('floor', e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">חדרים
              <input type="number" step="0.5" value={form.rooms} onChange={e => set('rooms', e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">שטח (מ״ר)
              <input type="number" value={form.area} onChange={e => set('area', e.target.value)} className={inputCls} />
            </label>
          </div>
          <ListEditor label="מספרי חניה" items={form.parking_spots} onChange={v => set('parking_spots', v)} placeholder="למשל: 12" />
          <ListEditor label="מספרי מחסן" items={form.storage_numbers} onChange={v => set('storage_numbers', v)} placeholder="למשל: B4" />
          <ListEditor label="מפתחות / תגים" items={form.key_numbers} onChange={v => set('key_numbers', v)} placeholder="למשל: A1" />
          <ListEditor label="טלפון לפתיחת שער חניה" items={form.parking_gate_phones} onChange={v => set('parking_gate_phones', v)} placeholder="למשל: *3456" />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={form.board_member} onChange={e => set('board_member', e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            חבר ועד
          </label>
          <label className="text-xs text-slate-500 block">הערות
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className={`${inputCls} resize-none`} />
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
          <Row icon={Hash}    label="מספר דירה" value={unit.unit_number || unit.number} />
          <Row icon={Home}    label="סוג"       value={unitType === 'rented' ? 'שכירות' : 'בבעלות'} />
          <Row icon={Layers}  label="קומה"      value={unit.floor} />
          <Row icon={Home}    label="חדרים"     value={unit.rooms} />
          <Row icon={Ruler}   label="שטח"       value={unit.area ? `${unit.area} מ״ר` : ''} />
          <Row icon={Car}     label="חניות"     value={parkingList.join(', ')} />
          <Row icon={KeyRound} label="מחסנים"   value={storageList.join(', ')} />
          <Row icon={KeyRound} label="מפתחות"   value={keyList.join(', ')} />
          <Row icon={Phone}   label="שער חניה"  value={gatePhones.join(', ')} />
          <Row icon={Star}    label="חבר ועד"   value={unit.board_member ? 'כן' : 'לא'} />
          {effectiveFee != null && (
            <Row icon={CreditCard} label="דמי ועד" value={formatCurrency(effectiveFee)} />
          )}
          {unit.notes && <Row icon={StickyNote} label="הערות" value={unit.notes} />}
        </div>
      )}

      {/* ── Owner details — only for rented units (stored on the unit) ── */}
      {unitType === 'rented' && (
        <OwnerDetails unit={unit} onSaved={onSaved} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Residents — grouped by unit type (owned vs rented)
   ════════════════════════════════════════════════════════════════ */
const EMPTY_PERSON = { first_name: '', last_name: '', phone: '', email: '' }
const personFieldCls = 'px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

// Module-level so it doesn't remount on each keystroke (would steal focus)
function PersonFields({ value, onChange }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" required placeholder="שם פרטי *" value={value.first_name}
          onChange={e => onChange({ ...value, first_name: e.target.value })} className={personFieldCls} />
        <input type="text" placeholder="שם משפחה" value={value.last_name}
          onChange={e => onChange({ ...value, last_name: e.target.value })} className={personFieldCls} />
      </div>
      <input type="tel" placeholder="טלפון" value={value.phone}
        onChange={e => onChange({ ...value, phone: e.target.value })} className={`w-full ${personFieldCls}`} />
      <input type="email" placeholder="אימייל" value={value.email}
        onChange={e => onChange({ ...value, email: e.target.value })} className={`w-full ${personFieldCls}`} />
    </>
  )
}

// One titled card with add / edit / remove for a single resident group.
// resident_type is fixed per group (owner / tenant) — derived from unit type.
function ResidentGroup({ title, subtitle, icon: Icon, residents, defaultType, profile, onChanged, addLabel }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_PERSON)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_PERSON)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const hasPrimary = residents.some(r => r.is_primary)
  const editingRes = residents.find(r => r.id === editingId) || null
  const editingIsPrimary = !!editingRes?.is_primary
  // First resident in a unit becomes primary automatically.
  const newIsPrimary = residents.length === 0
  // A primary resident must have name + mobile + email.
  const addValid = form.first_name.trim() && (!newIsPrimary || (form.phone.trim() && form.email.trim()))
  const editValid = editForm.first_name.trim() && (!editingIsPrimary || (editForm.phone.trim() && editForm.email.trim()))

  const add = async (e) => {
    e.preventDefault()
    if (!addValid) { setError(newIsPrimary ? 'לדייר הראשי חובה שם, נייד ומייל.' : 'יש למלא שם פרטי.'); return }
    setSaving(true); setError(null)
    const { error } = await supabase.from('unit_residents').insert({
      unit_id: profile.unit_id,
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      phone: form.phone.trim(), email: form.email.trim(),
      resident_type: defaultType, is_primary: newIsPrimary,
    })
    setSaving(false)
    if (error) { console.error('resident insert error', error); setError('שגיאה בהוספה. נסה שוב.'); return }
    setForm(EMPTY_PERSON); setAdding(false); onChanged()
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({ first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '', email: r.email || '' })
    setError(null)
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editValid) { setError(editingIsPrimary ? 'לדייר הראשי חובה שם, נייד ומייל.' : 'יש למלא שם פרטי.'); return }
    setSaving(true); setError(null)
    const { error } = await supabase.from('unit_residents').update({
      first_name: editForm.first_name.trim(), last_name: editForm.last_name.trim(),
      phone: editForm.phone.trim(), email: editForm.email.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', editingId)
    setSaving(false)
    if (error) { console.error('resident update error', error); setError('שגיאה בעדכון.'); return }
    setEditingId(null); onChanged()
  }
  const remove = async (r) => {
    if (r.is_primary) { setError('לא ניתן להסיר דייר ראשי — הגדר דייר אחר כראשי תחילה.'); return }
    if (!window.confirm(`להסיר את ${r.first_name || 'הדייר'} מהדירה?`)) return
    const { error } = await supabase.from('unit_residents').update({ archived: true }).eq('id', r.id)
    if (error) { console.error('resident archive error', error); return }
    onChanged()
  }
  // Mark a resident as primary (requires mobile + email). Clears the previous primary.
  const makePrimary = async (r) => {
    if (r.is_primary) return
    if (!r.phone || !r.email) { setError('לדייר ראשי חובה נייד ומייל — עדכן את הפרטים תחילה.'); startEdit(r); return }
    setError(null)
    await supabase.from('unit_residents').update({ is_primary: false }).eq('unit_id', profile.unit_id).eq('archived', false)
    const { error } = await supabase.from('unit_residents').update({ is_primary: true }).eq('id', r.id)
    if (error) { console.error('set primary error', error); setError('שגיאה בהגדרת דייר ראשי.'); return }
    onChanged()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-500" />
          <p className="font-bold text-slate-800 text-sm">{title}</p>
        </div>
        <button onClick={() => { setAdding(a => !a); setError(null) }}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
          {adding ? <><X className="h-3.5 w-3.5" /> ביטול</> : <><Plus className="h-3.5 w-3.5" /> {addLabel}</>}
        </button>
      </div>
      {subtitle && <p className="text-xs text-slate-400 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}

      {adding && (
        <form onSubmit={add} className="space-y-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
          {newIsPrimary && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              דייר ראשי — נייד ומייל חובה
            </p>
          )}
          <PersonFields value={form} onChange={setForm} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !addValid}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            הוספה
          </button>
        </form>
      )}

      {!adding && !editingId && error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {residents.length > 0 && !hasPrimary && (
        <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
          <Star className="h-3 w-3" /> יש להגדיר דייר ראשי (לחיצה על הכוכב)
        </p>
      )}

      {residents.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">יש להוסיף לפחות דייר אחד (ייקבע כראשי)</p>
      ) : (
        <div className="space-y-2">
          {residents.map(r => {
            const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'
            const initial = (r.first_name || '?').charAt(0)

            if (editingId === r.id) {
              return (
                <form key={r.id} onSubmit={saveEdit} className="space-y-3 p-3 rounded-xl bg-slate-50 border border-teal-200">
                  <PersonFields value={editForm} onChange={setEditForm} />
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
                    {r.is_primary && <span className="text-[10px] text-teal-600 font-medium mr-1.5">• ראשי</span>}
                  </p>
                  {(r.phone || r.email) && (
                    <p className="text-xs text-slate-400 truncate">{[r.phone, r.email].filter(Boolean).join(' • ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => makePrimary(r)} title={r.is_primary ? 'דייר ראשי' : 'הגדר כדייר ראשי'}
                    className={`p-1.5 ${r.is_primary ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}>
                    <Star className={`h-3.5 w-3.5 ${r.is_primary ? 'fill-amber-400' : ''}`} />
                  </button>
                  <button onClick={() => startEdit(r)} className="p-1.5 text-slate-400 hover:text-blue-600" title="עריכה">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!r.is_primary && (
                    <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-red-500" title="הסרה">
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

function ResidentsSection({ unit, residents, profile, onChanged }) {
  const unitType = unit?.custom_fields?.unit_type || 'owned'
  // "דיירי הדירה" always lists everyone who lives in the unit, unchanged when
  // the unit type is toggled. Owner contact info lives separately in the unit
  // card (custom_fields.owner), so nothing here is reclassified.
  const defaultType = unitType === 'rented' ? 'tenant' : 'owner'

  return (
    <ResidentGroup
      title="דיירי הדירה" icon={Users} residents={residents} defaultType={defaultType}
      profile={profile} onChanged={onChanged} addLabel="הוסף דייר"
    />
  )
}
