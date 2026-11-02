import { cn } from '@/lib/utils'

const variantStyles = {
  default:
    'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/10',
  success:
    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10',
  warning:
    'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10',
  danger:
    'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10',
  info:
    'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/10',
}

function Badge({ className, variant = 'default', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold',
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
