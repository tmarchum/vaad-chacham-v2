import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { UserCheck, Check, X } from 'lucide-react'

/**
 * Admin/committee approval queue for residents who self-registered.
 * A self-onboarded resident has profiles.unit_id set but is_verified = false,
 * and has NO data access until approved here.
 */
export function PendingApprovals({ allUnits = [] }) {
  const [pending, setPending] = useState([])
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, unit_id')
      .eq('is_verified', false)
      .not('unit_id', 'is', null)
    setPending(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  if (pending.length === 0) return null

  const unitNum = (uid) => {
    const u = allUnits.find(x => x.id === uid)
    return u ? (u.number || u.unit_number) : '—'
  }
  const approve = async (p) => {
    setBusy(p.id)
    const { error } = await supabase.from('profiles').update({ is_verified: true }).eq('id', p.id)
    setBusy(null)
    if (error) { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה באישור', type: 'error' } })); return }
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'הדייר אושר', type: 'success' } }))
    load()
  }
  const reject = async (p) => {
    if (!window.confirm('לדחות את הבקשה ולנתק את המשתמש מהדירה?')) return
    setBusy(p.id)
    await supabase.from('profiles').update({ unit_id: null, building_id: null }).eq('id', p.id)
    setBusy(null)
    load()
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <UserCheck className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-bold text-amber-800">בקשות הצטרפות ממתינות לאישור ({pending.length})</h3>
      </div>
      <div className="space-y-2">
        {pending.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-amber-100 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}
              </p>
              <p className="text-xs text-slate-400 truncate">{p.email} · דירה {unitNum(p.unit_id)}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" disabled={busy === p.id} onClick={() => approve(p)} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                <Check className="h-3.5 w-3.5" />אשר
              </Button>
              <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => reject(p)} className="gap-1">
                <X className="h-3.5 w-3.5" />דחה
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
