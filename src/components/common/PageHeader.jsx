import { cn } from '@/lib/utils'

/**
 * Premium page header with icon, title, subtitle, and actions.
 *
 * Usage:
 *   <PageHeader
 *     icon={CreditCard}
 *     iconColor="blue"
 *     title="תשלומים"
 *     subtitle="24 תשלומים"
 *     actions={<Button>...</Button>}
 *   />
 */

const ICON_COLORS = {
  blue:    'from-blue-500 to-blue-700 shadow-blue-500/20',
  amber:   'from-amber-500 to-amber-700 shadow-amber-500/20',
  purple:  'from-purple-500 to-purple-700 shadow-purple-500/20',
  emerald: 'from-emerald-500 to-emerald-700 shadow-emerald-500/20',
  red:     'from-red-500 to-red-700 shadow-red-500/20',
  cyan:    'from-cyan-500 to-cyan-700 shadow-cyan-500/20',
  slate:   'from-slate-500 to-slate-700 shadow-slate-500/20',
  indigo:  'from-indigo-500 to-indigo-700 shadow-indigo-500/20',
}

function PageHeader({ icon: Icon, iconColor = 'blue', title, subtitle, actions, children, className }) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn(
            'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0',
            ICON_COLORS[iconColor]
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
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
