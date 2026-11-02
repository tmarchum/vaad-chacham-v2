import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default:
    'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary-light)] shadow-sm',
  outline:
    'border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:border-slate-300 focus-visible:ring-[var(--primary-light)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--primary-light)]',
  destructive:
    'bg-[var(--danger)] text-white hover:bg-red-700 focus-visible:ring-red-400 shadow-sm',
}

const sizes = {
  default: 'h-9 px-4 py-2 text-[13px]',
  sm: 'h-8 px-3 text-xs',
  icon: 'h-9 w-9 p-0',
}

const Button = forwardRef(
  ({ className, variant = 'default', size = 'default', disabled, children, ...props }, ref) => {
    // For icon-only buttons: auto-apply aria-label as title for native tooltip
    const isIconOnly = size === 'icon'
    const titleProp = isIconOnly && props['aria-label'] && !props.title
      ? { title: props['aria-label'] }
      : {}
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        {...titleProp}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
