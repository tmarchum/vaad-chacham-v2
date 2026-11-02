import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[80px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 py-2 text-[13px]',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'transition-colors resize-y',
      'focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))

Textarea.displayName = 'Textarea'

export { Textarea }
