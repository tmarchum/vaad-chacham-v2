import { cn } from '@/lib/utils'

// Civic Blue segmented control: tinted track, white raised active segment
// with primary ink. Same component for page tabs and table filters.
function TabGroup({ tabs = [], activeTab, onChange, className, ...props }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-[var(--radius-lg)] bg-[var(--surface-secondary)] border border-[var(--border)] max-w-full overflow-x-auto',
        className
      )}
      role="tablist"
      {...props}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(tab.key)}
            className={cn(
              'px-3 py-1.5 rounded-[var(--radius)] text-[12px] leading-4 transition-all duration-150 cursor-pointer whitespace-nowrap',
              active
                ? 'bg-[var(--surface)] text-[var(--primary)] font-semibold shadow-[var(--shadow)]'
                : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]'
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
              {tab.label}
              {tab.count != null && <span className="num-tabular opacity-80">({tab.count})</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export { TabGroup }
