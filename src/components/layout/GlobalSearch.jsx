import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Home, Wrench, Store, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { cn } from '@/lib/utils'

// Header search: residents/units, issues, vendors. Data loads lazily on the
// first focus (nothing is fetched for users who never search), then filters
// locally as you type. Enter opens the first hit; Esc closes.
export function GlobalSearch({ buildingId, className }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [issues, setIssues] = useState([])
  const [vendors, setVendors] = useState([])
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef(null)
  const { units } = useUnitDirectory(armed ? buildingId : null)

  useEffect(() => {
    if (!armed || !buildingId) return
    let active = true
    Promise.all([
      supabase.from('issues').select('id, title, category, status').eq('building_id', buildingId)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('vendors').select('id, name, category').limit(1000),
    ]).then(([iss, ven]) => {
      if (!active) return
      setIssues(iss.data || [])
      setVendors(ven.data || [])
    })
    return () => { active = false }
  }, [armed, buildingId])

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 1) return []
    const hit = (s) => String(s || '').toLowerCase().includes(term)
    const out = []
    units
      .filter((u) => String(u.number) === term || hit(u.name) || hit(u.phone))
      .slice(0, 6)
      .forEach((u) => out.push({ key: `u${u.id}`, icon: Home, group: 'דירות ודיירים', label: u.label, sub: u.phone, to: `/residents?unit=${u.id}` }))
    issues
      .filter((i) => hit(i.title) || hit(i.category))
      .slice(0, 5)
      .forEach((i) => out.push({ key: `i${i.id}`, icon: Wrench, group: 'תקלות', label: i.title, sub: i.category, to: `/issues?open=${i.id}` }))
    vendors
      .filter((v) => hit(v.name) || hit(v.category))
      .slice(0, 5)
      .forEach((v) => out.push({ key: `v${v.id}`, icon: Store, group: 'ספקים', label: v.name, sub: v.category, to: `/vendors?q=${encodeURIComponent(v.name)}` }))
    return out
  }, [q, units, issues, vendors])

  const go = (r) => {
    if (!r) return
    navigate(r.to)
    setOpen(false)
    setQ('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[cursor]) }
  }

  let lastGroup = null
  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--text-muted)] pointer-events-none" />
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0) }}
        onFocus={() => { setArmed(true); setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder="חיפוש דייר, דירה, קריאה או ספק..."
        className="w-full h-[38px] pr-10 pl-8 bg-[var(--bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/80 border border-[var(--outline-variant)] rounded-[var(--radius)] text-[12px] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-colors"
      />
      {q && (
        <button onClick={() => { setQ(''); setOpen(false) }} className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && q.trim() && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 max-h-[60vh] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] py-1">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">אין תוצאות עבור «{q}»</p>
          ) : results.map((r, idx) => {
            const header = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            return (
              <div key={r.key}>
                {header && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[var(--text-muted)]">{header}</p>}
                <button
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() => go(r)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-right transition-colors',
                    idx === cursor ? 'bg-[var(--surface-secondary)]' : 'hover:bg-[var(--surface-secondary)]'
                  )}
                >
                  <r.icon className="h-4 w-4 text-[var(--primary)] shrink-0" strokeWidth={1.75} />
                  <span className="text-[13px] text-[var(--text-primary)] truncate">{r.label}</span>
                  {r.sub && <span className="text-[11px] text-[var(--text-muted)] truncate mr-auto">{r.sub}</span>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
