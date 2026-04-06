import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Card = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm',
      'transition-shadow hover:shadow-md',
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
    className={cn('flex flex-col gap-1.5 p-5 pb-0', className)}
    {...props}
  >
    {children}
  </div>
))
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold text-[var(--text-primary)]', className)}
    {...props}
  >
    {children}
  </h3>
))
CardTitle.displayName = 'CardTitle'

const CardContent = forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn('p-5', className)} {...props}>
    {children}
  </div>
))
CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardTitle, CardContent }
