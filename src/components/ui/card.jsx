import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Civic Blue cards: white, 1px architectural border, 8px radius, near-flat
// elevation. A CardHeader is a bordered section header (icon + title +
// subtitle on one side, actions on the other); CardFooter is the muted
// summary strip at the bottom of ledgers and lists.

const Card = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]',
      'shadow-[var(--shadow)]',
      className
    )}
    {...props}
  >
    {children}
  </div>
))
Card.displayName = 'Card'

const CardHeader = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col gap-1 px-4 py-3.5 border-b border-[var(--border)]', className)}
    {...props}
  >
    {children}
  </div>
))
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-[16px] leading-6 font-semibold text-[var(--text-primary)]', className)}
    {...props}
  >
    {children}
  </h3>
))
CardTitle.displayName = 'CardTitle'

const CardContent = forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn('p-4', className)} {...props}>
    {children}
  </div>
))
CardContent.displayName = 'CardContent'

const CardFooter = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-between gap-3 px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)]',
      'rounded-b-[var(--radius)] text-[11px] leading-[14px] text-[var(--text-secondary)]',
      className
    )}
    {...props}
  >
    {children}
  </div>
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardContent, CardFooter }
