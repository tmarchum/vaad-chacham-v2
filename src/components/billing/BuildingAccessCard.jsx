import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { useBuildingAccess, ACCESS_REASON } from '@/lib/buildingAccess'
import { ShieldAlert } from 'lucide-react'

const OPTIONS = [
  ['', 'אוטומטי — לפי הכללים במסלולים ותמחור'],
  ['active', 'פתוח תמיד (למשל: הבניין משלם בדרך אחרת)'],
  ['suspended', 'מושהה — לחסום עכשיו'],
]

// System admin only: whether the building's committee and residents can use the app.
export function BuildingAccessCard({ buildingId, onChange }) {
  const [value, setValue] = useState('')
  const acc = useBuildingAccess(buildingId)
  useEffect(() => {
    if (!buildingId) return
    supabase.from('buildings').select('access_override').eq('id', buildingId).maybeSingle()
      .then(({ data }) => setValue(data?.access_override || ''))
  }, [buildingId])

  const save = async (v) => {
    setValue(v)
    const { error } = await supabase.rpc('set_building_access', { p_building: buildingId, p_override: v || null })
    if (error) { toastError('העדכון נכשל'); return }
    toast('הגישה עודכנה')
    onChange?.()
  }

  return (
    <SectionCard icon={ShieldAlert} title="גישה לאפליקציה" subtitle="בניין חסום רואה רק את חשבון ועד1. מנהל המערכת לא נחסם">
      <div className="p-4 space-y-3">
        <p className={`text-[13px] font-semibold ${acc.blocked ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
          {acc.loading ? 'בודק...' : acc.blocked ? `חסום — ${ACCESS_REASON[acc.reason] || ''}` : 'פתוח'}
        </p>
        <select className="h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px]"
          value={value} onChange={(e) => save(e.target.value)}>
          {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </SectionCard>
  )
}
