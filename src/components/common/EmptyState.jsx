import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {Icon && (
        <div className="empty-state-icon">
          <Icon className="h-8 w-8 text-[var(--text-muted)]" />
        </div>
      )}
      {title && (
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-[13px] text-[var(--text-muted)] max-w-xs mb-5 leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-xl px-5">{actionLabel}</Button>
      )}
    </div>
  )
}

export { EmptyState }
