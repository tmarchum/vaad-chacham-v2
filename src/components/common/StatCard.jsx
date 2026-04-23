import { cn } from '@/lib/utils'

/**
 * Premium stat card with colored accent bar and optional icon.
 *
 * Usage:
 *   <StatCard
 *     label="סה״כ נגבה"
 *     value="₪12,500"
 *     icon={CreditCard}
 *     color="blue"
 *     sub="מתוך ₪15,000"
 *   />
 */

const ACCENT_COLORS = {
  blue:    { bar: 'bg-blue-500',    icon: 'bg-blue-50 text-blue-600',    value: 'text-blue-700' },
  emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  red:     { bar: 'bg-red-500',     icon: 'bg-red-50 text-red-600',      value: 'text-red-700' },
  amber:   { bar: 'bg-amber-500',   icon: 'bg-amber-50 text-amber-600',  value: 'text-amber-700' },
  purple:  { bar: 'bg-purple-500',  icon: 'bg-purple-50 text-purple-600', value: 'text-purple-700' },
  slate:   { bar: 'bg-slate-400',   icon: 'bg-slate-100 text-slate-600', value: 'text-[var(--text-primary)]' },
  cyan:    { bar: 'bg-cyan-500',    icon: 'bg-cyan-50 text-cyan-600',    value: 'text-cyan-700' },
}

function StatCard({ label, value, icon: Icon, color = 'slate', sub, className }) {
  const c = ACCENT_COLORS[color] || ACCENT_COLORS.slate
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border border-[var(--border)] bg-white p-4 transition-all duration-200 hover:shadow-md group',
      className
    )}>
      {/* Right accent bar */}
      <div className={cn('absolute top-0 right-0 w-1 h-full rounded-r-xl', c.bar)} />

      <div className="flex items-start justify-between gap-3 pr-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1 truncate">{label}</p>
          <p className={cn('text-2xl font-extrabold leading-none tracking-tight', c.value)}>{value}</p>
          {sub && <p className="text-[11px] text-[var(--text-muted)] mt-1.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105', c.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  )
}

export { StatCard }
