import { useState } from 'react'
import { useBuildingContext } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Search, Star, MapPin, RefreshCw } from 'lucide-react'

// Admin tool: find vendor candidates on Google by trade + area, keep only
// those with an Israeli mobile and a rating/review count above the threshold,
// and add the chosen ones to the pool as "ממתין להזמנה". Nobody is contacted
// from here — invites go out from the list below, and a vendor joins only by
// answering "מאשר".

const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'

const ERRORS = {
  no_key: 'חסר מפתח Google Places — יש להגדיר אותו פעם אחת בשרת',
  forbidden: 'הפעולה זמינה למנהל המערכת בלבד',
  daily_cap: 'הגעת לתקרת 100 החיפושים היומית בגוגל (הגנה מחיוב). אפשר להמשיך מחר',
}

async function call(payload) {
  const { data, error } = await supabase.functions.invoke('vendor-sourcing', { body: payload })
  if (error) {
    let code = ''
    try { code = (await error.context?.json())?.error || '' } catch { /* ignore */ }
    throw new Error(ERRORS[code] || 'החיפוש בגוגל נכשל')
  }
  return data
}

export function GoogleSourcing({ categoryOptions, defaultArea = '', onAdded }) {
  const { selectedBuilding } = useBuildingContext()
  const [q, setQ] = useState({ category: categoryOptions[0]?.value || '', area: defaultArea || selectedBuilding?.city || '', minRating: 4.5, minReviews: 15, maxKm: 20 })
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState('')

  const search = async () => {
    setBusy('search'); setResults(null)
    try {
      const { results: r } = await call({ action: 'search', ...q, minRating: Number(q.minRating), minReviews: Number(q.minReviews), maxKm: Number(q.maxKm) || null, buildingId: selectedBuilding?.id })
      setResults(r)
      setPicked(new Set(r.filter((x) => x.qualifies).map((x) => x.place_id)))
    } catch (e) { toastError(e.message) }
    setBusy('')
  }

  const add = async () => {
    const chosen = results.filter((x) => picked.has(x.place_id))
    if (!chosen.length) return
    setBusy('add')
    try {
      const { added } = await call({ action: 'add', category: q.category, area: q.area, candidates: chosen })
      toast(`${added} ספקים נוספו למאגר כממתינים להזמנה`)
      setResults(null); setPicked(new Set())
      onAdded?.()
    } catch (e) { toastError(e.message) }
    setBusy('')
  }

  const enrich = async () => {
    setBusy('enrich')
    try {
      const r = await call({ action: 'enrich', limit: 40 })
      toast(`נבדקו ${r.checked} ספקים קיימים · ${r.matched} קיבלו דירוג מגוגל${r.left ? ` · נותרו ${r.left} לבדיקה` : ''}`)
      onAdded?.()
    } catch (e) { toastError(e.message) }
    setBusy('')
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const qualifying = results?.filter((x) => x.qualifies).length || 0

  return (
    <SectionCard icon={Search} title="איתור ספקים מגוגל"
      subtitle={`לפי תחום ואזור${selectedBuilding ? `, עם מרחק מ${selectedBuilding.name}` : ''}. נשארים רק עסקים עם נייד, דירוג מעל הסף ובטווח המרחק — ונכנסים למאגר כממתינים להזמנה`}
      actions={<Button size="sm" variant="outline" onClick={enrich} disabled={!!busy}>
        <RefreshCw className={cn('h-4 w-4', busy === 'enrich' && 'animate-spin')} />{busy === 'enrich' ? 'בודק...' : 'דירוג גוגל לספקים הקיימים'}
      </Button>}>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
          <label className="col-span-2 lg:col-span-1 text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>תחום</span>
            <Select value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })} options={categoryOptions} />
          </label>
          <label className="col-span-2 lg:col-span-1 text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>אזור</span>
            <input className={field} value={q.area} placeholder="פתח תקווה" onChange={(e) => setQ({ ...q, area: e.target.value })} />
          </label>
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>דירוג מינימלי</span>
            <input type="number" step="0.1" min="0" max="5" dir="ltr" className={field} value={q.minRating} onChange={(e) => setQ({ ...q, minRating: e.target.value })} />
          </label>
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>מינימום ביקורות</span>
            <input type="number" min="0" dir="ltr" className={field} value={q.minReviews} onChange={(e) => setQ({ ...q, minReviews: e.target.value })} />
          </label>
          <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1">
            <span>מרחק מקסימלי מהבניין (ק"מ)</span>
            <input type="number" min="0" dir="ltr" className={field} value={q.maxKm} onChange={(e) => setQ({ ...q, maxKm: e.target.value })} />
          </label>
          <Button onClick={search} disabled={!!busy || !q.category}>{busy === 'search' ? 'מחפש...' : 'חיפוש'}</Button>
        </div>

        {results && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
              <span>{results.length} תוצאות · {qualifying} עומדים בתנאים · {picked.size} נבחרו</span>
              <Button size="sm" onClick={add} disabled={!!busy || picked.size === 0}>
                {busy === 'add' ? 'מוסיף...' : `הוספת ${picked.size} למאגר`}
              </Button>
            </div>
            <div className="rounded-[var(--radius)] border border-[var(--border)] divide-y divide-[var(--border-light)] max-h-[420px] overflow-y-auto">
              {results.map((r) => (
                <label key={r.place_id} className={cn('flex items-start gap-3 p-2.5 text-[13px]', r.qualifies ? 'cursor-pointer' : 'opacity-55')}>
                  <input type="checkbox" className="mt-1 accent-[var(--primary)]" disabled={!r.phone || r.exists}
                    checked={picked.has(r.place_id)} onChange={() => toggle(r.place_id)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{r.address}</p>
                    {r.reasons.length > 0 && <p className="text-[11px] text-[var(--warning)]">{r.reasons.join(' · ')}</p>}
                  </div>
                  <div className="shrink-0 text-left text-[12px] space-y-0.5">
                    <p className="flex items-center gap-1 justify-end font-semibold num-tabular">
                      <Star className="h-3.5 w-3.5 text-[var(--warning)]" fill="currentColor" />{r.rating || '—'}
                      <span className="font-normal text-[var(--text-muted)]">({r.reviews})</span>
                    </p>
                    <p dir="ltr" className="num-tabular text-[var(--text-secondary)]">{r.phone || r.landline || '—'}</p>
                    {r.distance_km != null && <p className="num-tabular text-[var(--text-secondary)]">📍 {r.distance_km < 10 ? r.distance_km : Math.round(r.distance_km)} ק"מ</p>}
                    {r.maps_url && <a href={r.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[var(--primary)]"><MapPin className="h-3 w-3" />מפה</a>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
