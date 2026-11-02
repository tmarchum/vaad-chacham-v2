import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-9 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px]',
      'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
      'transition-all duration-150',
      'hover:border-slate-300',
      'focus:border-[var(--primary)] focus:outline-none focus:ring-[3px] focus:ring-blue-500/8',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50',
      className
    )}
    {...props}
  />
))

Input.displayName = 'Input'

export { Input }
