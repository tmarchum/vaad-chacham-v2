import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-4 text-center', className)}>
      {Icon && (
        <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center mb-3">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </div>
      )}
      {title && (
        <h3 className="text-[16px] leading-6 font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-[13px] text-[var(--text-secondary)] max-w-xs mb-5 leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}

export { EmptyState }
