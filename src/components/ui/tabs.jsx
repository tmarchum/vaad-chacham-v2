import { cn } from '@/lib/utils'

function TabGroup({ tabs = [], activeTab, onChange, className, ...props }) {
  return (
    <div
      className={cn('flex gap-1 border-b border-[var(--border)]', className)}
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
            'px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
            '-mb-px border-b-2',
            activeTab === tab.key
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export { TabGroup }
