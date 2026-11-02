import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Civic Blue buttons: 38px default height, 8px radius, semibold 12–13px
// labels, press-scale feedback.
const variants = {
  default:
    'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary)]/40 shadow-[var(--shadow)]',
  outline:
    'border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] focus-visible:ring-[var(--primary)]/30',
  soft:
    'bg-[var(--surface-secondary)] text-[var(--primary)] hover:bg-[var(--surface-container)] focus-visible:ring-[var(--primary)]/30',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--primary)]/30',
  destructive:
    'bg-[var(--danger)] text-white hover:opacity-90 focus-visible:ring-red-400 shadow-[var(--shadow)]',
}

const sizes = {
  default: 'h-[38px] px-3.5 text-[13px]',
  sm: 'h-8 px-2.5 text-[12px]',
  lg: 'h-11 px-5 text-[14px]',
  icon: 'h-8 w-8 p-0',
}

const Button = forwardRef(
  ({ className, variant = 'default', size = 'default', disabled, children, ...props }, ref) => {
    // Icon-only buttons: surface aria-label as a native tooltip.
    const isIconOnly = size === 'icon'
    const titleProp = isIconOnly && props['aria-label'] && !props.title
      ? { title: props['aria-label'] }
      : {}
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] font-semibold transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer active:scale-[0.97] whitespace-nowrap',
          variants[variant] || variants.default,
          sizes[size] || sizes.default,
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
