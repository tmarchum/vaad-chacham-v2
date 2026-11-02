import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px]',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/80',
      'transition-colors duration-150',
      'focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--bg)]',
      className
    )}
    {...props}
  />
))

Input.displayName = 'Input'

export { Input }
