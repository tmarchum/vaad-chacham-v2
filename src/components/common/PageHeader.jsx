import { cn } from '@/lib/utils'

/**
 * Civic Blue page header: a quiet icon tile, 24px title, muted subtitle,
 * actions on the far (left, in RTL) side. `iconColor` is accepted for
 * backwards compatibility; the tile is always the brand tint now.
 */
function PageHeader({ icon: Icon, title, subtitle, actions, children, className }) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--surface-container)] text-[var(--primary)] flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[24px] leading-8 font-semibold tracking-[-0.015em] text-[var(--text-primary)] truncate">{title}</h1>
          {subtitle && (
            <p className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{subtitle}</p>
          )}
        </div>
      </div>
      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions || children}
        </div>
      )}
    </div>
  )
}

export { PageHeader }
