import { cn } from '@/lib/utils'

/**
 * Premium segmented filter pills.
 *
 * Usage:
 *   <FilterPills
 *     options={[{ key: 'all', label: 'הכל' }, { key: 'open', label: 'פתוחים' }]}
 *     value="all"
 *     onChange={(key) => setFilter(key)}
 *   />
 */
function FilterPills({ options, value, onChange, className }) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-light)]', className)}>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer',
            value === opt.key
              ? 'bg-white text-[var(--text-primary)] shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
        >
          {opt.label}
          {opt.count != null && (
            <span className={cn(
              'mr-1.5 text-[11px] font-semibold',
              value === opt.key ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
            )}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export { FilterPills }
