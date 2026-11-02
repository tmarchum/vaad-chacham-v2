import { cn } from '@/lib/utils'

/**
 * Civic Blue KPI card: label + tinted icon tile on top, big tabular value
 * (with optional inline note/delta), a muted sub-line, and an optional
 * footer strip — either a progress bar (`progress` 0–100) or any node.
 *
 *   <StatCard label="גבייה חודשית" value="₪14,800" note="+8%" icon={Wallet}
 *     color="blue" sub="מתוך ₪16,200" progress={91} />
 */
const TONES = {
  blue:    { icon: 'bg-[var(--surface-secondary)] text-[var(--primary)]', value: 'text-[var(--text-primary)]', bar: 'bg-[var(--primary)]' },
  emerald: { icon: 'bg-[var(--success-light)] text-[var(--success)]',     value: 'text-[var(--text-primary)]', bar: 'bg-[var(--success)]' },
  red:     { icon: 'bg-[var(--danger-light)] text-[var(--danger)]',       value: 'text-[var(--danger)]',       bar: 'bg-[var(--danger)]' },
  amber:   { icon: 'bg-[var(--warning-light)] text-[var(--warning)]',     value: 'text-[var(--text-primary)]', bar: 'bg-[var(--warning)]' },
  purple:  { icon: 'bg-[var(--surface-variant)] text-[var(--primary)]',   value: 'text-[var(--text-primary)]', bar: 'bg-[var(--primary)]' },
  slate:   { icon: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]', value: 'text-[var(--text-primary)]', bar: 'bg-[var(--text-muted)]' },
  cyan:    { icon: 'bg-[var(--surface-variant)] text-[var(--primary)]',   value: 'text-[var(--text-primary)]', bar: 'bg-[var(--primary)]' },
}

function StatCard({ label, value, note, icon: Icon, color = 'blue', sub, progress, footer, className, valueClassName }) {
  const t = TONES[color] || TONES.blue
  const hasFooter = progress != null || footer
  return (
    <div className={cn(
      'p-4 sm:p-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex flex-col justify-between',
      className
    )}>
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[12px] leading-4 font-medium text-[var(--text-secondary)] truncate">{label}</span>
          {Icon && (
            <span className={cn('p-1.5 rounded-[var(--radius)] shrink-0', t.icon)}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('text-[26px] sm:text-[30px] leading-9 font-bold tracking-[-0.02em] num-tabular', t.value, valueClassName)}>{value}</span>
          {note && <span className="text-[11px] leading-[14px] font-semibold text-[var(--text-muted)] num-tabular">{note}</span>}
        </div>
        {sub && <p className="text-[12px] leading-[18px] text-[var(--text-muted)] mt-1 num-tabular">{sub}</p>}
      </div>
      {hasFooter && (
        <div className="mt-4 pt-3 border-t border-[var(--border-light)] text-[11px] leading-[14px] text-[var(--text-secondary)]">
          {progress != null ? (
            <div className="w-full h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all duration-700', t.bar)} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
          ) : footer}
        </div>
      )}
    </div>
  )
}

export { StatCard }
