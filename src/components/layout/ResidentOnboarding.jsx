import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Home, ChevronLeft, CheckCircle2, Loader2, LogOut } from 'lucide-react'

/**
 * Full-screen wizard shown after Google login when the user's email
 * doesn't match any existing unit_residents record.
 *
 * Step 1 — pick a building
 * Step 2 — pick your unit within that building
 * Confirm → links profile.unit_id / building_id
 */
export function ResidentOnboarding() {
  const { user, completeOnboarding, signOut } = useAuth()

  const [step, setStep]                   = useState(1)
  const [buildings, setBuildings]         = useState([])
  const [units, setUnits]                 = useState([])
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [selectedUnit, setSelectedUnit]   = useState(null)
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [loadingUnits, setLoadingUnits]   = useState(false)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)

  // Load all buildings on mount — direct query now works via new RLS policy
  useEffect(() => {
    // Safe, non-sensitive list via SECURITY DEFINER RPC (no bank details exposed)
    supabase
      .rpc('onboarding_buildings')
      .then(({ data, error }) => {
        if (error) {
          console.error('buildings query error:', error)
          setError(`שגיאה בטעינת בניינים: ${error.message}`)
        } else {
          setBuildings(data || [])
        }
        setLoadingBuildings(false)
      })
  }, [])

  // Load units when a building is selected
  useEffect(() => {
    if (!selectedBuilding) return
    setLoadingUnits(true)
    setUnits([])
    setSelectedUnit(null)
    supabase
      .rpc('onboarding_units', { p_building: selectedBuilding.id })
      .then(({ data, error }) => {
        if (error) console.error('units query error:', error)
        // number is text — sort numerically (1,2,3,…,10) not lexically (1,10,2,…)
        const sorted = (data || []).slice().sort(
          (a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0)
        )
        setUnits(sorted)
        setLoadingUnits(false)
      })
  }, [selectedBuilding])

  const handlePickBuilding = (b) => {
    setSelectedBuilding(b)
    setStep(2)
  }

  const handleBack = () => {
    setStep(1)
    setSelectedBuilding(null)
    setSelectedUnit(null)
  }

  const handleConfirm = async () => {
    if (!selectedUnit || !selectedBuilding) return
    setSaving(true)
    setError(null)
    try {
      // Link the profile to the chosen unit/building. The unit_residents row
      // (primary resident) is created right after, in the mandatory
      // RequirePrimaryResident step in the portal — once the profile is linked
      // the resident is authorised to write it.
      await completeOnboarding(selectedUnit.id, selectedBuilding.id)
    } catch (e) {
      console.error('onboarding error', e)
      setError('אירעה שגיאה. נסה שוב.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden" dir="rtl">
      {/* Background glow */}
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-lg mx-4 overflow-hidden">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-l from-blue-600 via-blue-500 to-indigo-600" />

        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
                <span className="text-white text-sm font-black">+ו</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-gray-900">ברוכים הבאים לוועד+</h1>
                <p className="text-xs text-gray-400">כניסה ראשונה — שייכו את עצמכם לדירתכם</p>
                {user?.email && <p className="text-[11px] text-gray-400 truncate mt-0.5">מחובר כ-{user.email}</p>}
              </div>
            </div>
            <button
              onClick={signOut}
              title="התנתק / החלף חשבון"
              className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              התנתק
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-5">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  s < step ? 'bg-green-500 text-white' :
                  s === step ? 'bg-blue-600 text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
                </div>
                <span className={`text-xs font-medium ${s === step ? 'text-blue-600' : 'text-gray-400'}`}>
                  {s === 1 ? 'בחר בניין' : 'בחר דירה'}
                </span>
                {s < 2 && <div className="w-6 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">

          {/* ── Step 1: Building list ── */}
          {step === 1 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-4">באיזה בניין אתם גרים?</p>
              {loadingBuildings ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : buildings.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  אין בניינים רשומים במערכת. פנו למנהל הבניין.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {buildings.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handlePickBuilding(b)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50 transition-all text-right group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 group-hover:from-blue-100 group-hover:to-blue-200 flex items-center justify-center shrink-0 transition-all">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{b.name}</p>
                        {(() => {
                          const addr = [[b.street, b.house_number].filter(Boolean).join(' '), b.city].filter(Boolean).join(', ')
                          return addr ? <p className="text-xs text-gray-400 truncate">{addr}</p> : null
                        })()}
                      </div>
                      {b.total_units && (
                        <span className="text-xs text-gray-300 shrink-0">{b.total_units} דירות</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Unit list ── */}
          {step === 2 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={handleBack} className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {selectedBuilding?.name}
                </button>
                <span className="text-gray-300">›</span>
                <span className="text-xs text-gray-500">בחרו דירה</span>
              </div>

              {loadingUnits ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : units.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  לא נמצאו דירות בבניין זה.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {units.map((u) => {
                    const num = u.number
                    const isSelected = selectedUnit?.id === u.id
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUnit(u)}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-extrabold transition-all ${
                          isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {num}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900">דירה {num}</p>
                          {u.floor && <p className="text-xs text-gray-400">קומה {u.floor}</p>}
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Confirm button */}
              <div className="mt-5 space-y-2">
                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                <button
                  onClick={handleConfirm}
                  disabled={!selectedUnit || saving}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 hover:-translate-y-0.5 hover:shadow-xl"
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> שומר...</>
                  ) : (
                    <><Home className="h-4 w-4" /> אישור — זו הדירה שלי</>
                  )}
                </button>
                <p className="text-center text-xs text-gray-400">
                  לא מוצאים את הדירה? פנו למנהל הבניין שלכם.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
