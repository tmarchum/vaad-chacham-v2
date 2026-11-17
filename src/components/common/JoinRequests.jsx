import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast, toastError } from '@/lib/toast'
import { UserPlus } from 'lucide-react'

// People who picked an apartment in this building and wait for the committee.
// Shown on every screen while there is someone waiting; renders nothing otherwise.
export function JoinRequests({ buildingId }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!buildingId) { setRows([]); return }
    const { data, error } = await supabase.rpc('pending_residents', { p_building: buildingId })
    setRows(error ? [] : data || [])
  }, [buildingId])
  useEffect(() => { load() }, [load])

  const decide = async (r, approve) => {
    if (!approve && !window.confirm(`לדחות את הבקשה של ${r.name || r.email} לדירה ${r.unit_number}?`)) return
    setBusy(r.id)
    const { error } = await supabase.rpc('decide_resident', { p_profile: r.id, p_approve: approve })
    setBusy('')
    if (error) { toastError('הפעולה נכשלה'); return }
    toast(approve ? `אושר — דירה ${r.unit_number}` : 'הבקשה נדחתה')
    load()
  }

  if (!rows.length) return null

  return (
    <div className="mb-5 rounded-[var(--radius)] border border-[var(--warning)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-light)]">
        <UserPlus className="h-5 w-5 text-[var(--warning)]" strokeWidth={1.75} />
        <p className="text-[14px] font-bold text-[var(--text-primary)]">בקשות הצטרפות לבניין ({rows.length})</p>
      </div>
      <div className="divide-y divide-[var(--border-light)]">
        {rows.map((r) => (
          <div key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-[13px]">
              <p className="font-semibold">דירה {r.unit_number} · {r.name || 'ללא שם'}</p>
              <p className="text-[12px] text-[var(--text-muted)] break-all" dir="ltr">{r.email}</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {r.registered ? `כבר רשומים בדירה: ${r.registered}` : 'עוד אין דיירים רשומים בדירה'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => decide(r, true)} disabled={!!busy}>{busy === r.id ? '...' : 'אישור'}</Button>
              <Button size="sm" variant="outline" onClick={() => decide(r, false)} disabled={!!busy}>דחייה</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
