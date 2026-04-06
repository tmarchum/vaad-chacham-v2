import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default:
    'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary-light)]',
  outline:
    'border border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:ring-[var(--primary-light)]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:ring-[var(--primary-light)]',
  destructive:
    'bg-[var(--danger)] text-white hover:bg-red-700 focus-visible:ring-red-400',
}

const sizes = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  icon: 'h-10 w-10 p-0',
}

const Button = forwardRef(
  ({ className, variant = 'default', size = 'default', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
