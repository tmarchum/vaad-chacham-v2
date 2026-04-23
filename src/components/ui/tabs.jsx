import { cn } from '@/lib/utils'

function TabGroup({ tabs = [], activeTab, onChange, className, ...props }) {
  return (
    <div
      className={cn('flex gap-0.5 border-b border-[var(--border)]', className)}
      role="tablist"
      {...props}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          onClick={() => onChange?.(tab.key)}
          className={cn(
            'px-4 py-2.5 text-[13px] font-semibold transition-all duration-150 cursor-pointer',
            '-mb-px border-b-2 rounded-t-lg',
            activeTab === tab.key
              ? 'border-[var(--primary)] text-[var(--primary)] bg-blue-50/50'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]'
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export { TabGroup }
