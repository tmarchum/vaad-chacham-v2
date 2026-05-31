import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Home, CreditCard, Megaphone, LogOut, Building2,
  CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'

const STATUS_MAP = {
  paid:    { label: 'שולם', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  partial: { label: 'חלקי', color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
  pending: { label: 'ממתין', color: 'text-amber-600',  bg: 'bg-amber-50',   icon: Clock },
  overdue: { label: 'באיחור', color: 'text-red-600',   bg: 'bg-red-50',     icon: AlertCircle },
  unpaid:  { label: 'לא שולם', color: 'text-red-600',  bg: 'bg-red-50',     icon: AlertCircle },
}

export function ResidentPortal() {
  const { profile, user, signOut } = useAuth()
  const [unit, setUnit]               = useState(null)
  const [building, setBuilding]       = useState(null)
  const [payments, setPayments]       = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading]         = useState(true)
  const [expandedAnn, setExpandedAnn] = useState(null)

  useEffect(() => {
    if (!profile?.unit_id) { setLoading(false); return }

    Promise.all([
      // Unit info
      supabase.from('units').select('*').eq('id', profile.unit_id).maybeSingle(),
      // Payments — last 12 months
      supabase.from('payments').select('*')
        .eq('unit_id', profile.unit_id)
        .order('month', { ascending: false })
        .limit(12),
    ]).then(([unitRes, paymentsRes]) => {
      const u = unitRes.data
      setUnit(u)
      setPayments(paymentsRes.data || [])

      // Load announcements once we know the building_id
      const bid = u?.building_id || profile.building_id
      if (bid) {
        supabase.from('buildings').select('*').eq('id', bid).maybeSingle()
          .then(({ data }) => setBuilding(data))
        supabase.from('announcements').select('*')
          .eq('building_id', bid)
          .order('created_at', { ascending: false })
          .limit(8)
          .then(({ data }) => setAnnouncements(data || []))
      }
      setLoading(false)
    })
  }, [profile?.unit_id, profile?.building_id])

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentPayment = payments.find(p => p.month === currentMonth)
  const unitNumber = unit?.unit_number || unit?.number || '—'
  const ownerName = `${user?.user_metadata?.given_name || ''} ${user?.user_metadata?.family_name || ''}`.trim()

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
