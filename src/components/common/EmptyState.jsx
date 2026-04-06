import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {Icon && (
        <div className="mb-4 rounded-full bg-[var(--surface-hover)] p-4">
          <Icon className="h-10 w-10 text-[var(--text-muted)]" />
        </div>
      )}
      {title && (
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-4">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}

export { EmptyState }
