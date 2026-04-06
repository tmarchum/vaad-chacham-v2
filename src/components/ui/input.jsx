import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'transition-colors',
      'focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))

Input.displayName = 'Input'

export { Input }
