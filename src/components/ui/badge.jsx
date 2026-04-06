import { cn } from '@/lib/utils'

const variantStyles = {
  default:
    'bg-[var(--primary-bg)] text-[var(--primary)]',
  success:
    'bg-green-50 text-[var(--success)]',
  warning:
    'bg-amber-50 text-[var(--warning)]',
  danger:
    'bg-red-50 text-[var(--danger)]',
  info:
    'bg-cyan-50 text-[var(--info)]',
}

function Badge({ className, variant = 'default', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { Badge }
