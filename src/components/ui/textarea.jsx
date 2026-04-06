import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[80px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'transition-colors resize-y',
      'focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))

Textarea.displayName = 'Textarea'

export { Textarea }
