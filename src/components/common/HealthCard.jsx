import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, ChevronLeft } from 'lucide-react'

// "Is everything OK?" — the first thing a committee member wants to know, and
// the thing the dashboard used to make them work out from a grid of numbers.
// Each check is a sentence and a link; when none of them fire, the card says
// so plainly. Severity orders the list: things that are actually wrong
// (danger) before things that only want a look (warning).
export function HealthCard({ checks, title = 'מה דורש טיפול' }) {
  const items = (checks || []).filter(Boolean)
    .sort((a, b) => (a.severity === 'danger' ? 0 : 1) - (b.severity === 'danger' ? 0 : 1))

  if (items.length === 0) {
    return (
      <div className="p-5 rounded-[var(--radius)] border border-[var(--success)]/30 bg-[var(--success-light)] flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-[var(--success)] shrink-0" />
        <div>
          <p className="text-[17px] font-bold text-[var(--text-primary)]">הכל תקין</p>
          <p className="text-[13px] text-[var(--text-secondary)]">אין תקלות שממתינות, אין חובות חריגים ואין בדיקות שעבר מועדן.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="px-4 py-3 border-b border-[var(--border-light)] flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="px-2 py-0.5 rounded-full bg-[var(--surface-container)] text-[11px] font-bold num-tabular">{items.length}</span>
      </div>
      <div className="divide-y divide-[var(--border-light)]">
        {items.map((c) => (
          <Link key={c.key} to={c.to} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.severity === 'danger' ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} />
              <span className="text-[14px] text-[var(--text-primary)] truncate">{c.text}</span>
            </span>
            <ChevronLeft className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default HealthCard
