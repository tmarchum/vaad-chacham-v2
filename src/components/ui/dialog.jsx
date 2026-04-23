import { forwardRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 premium-dialog-overlay transition-opacity"
        onClick={() => onOpenChange?.(false)}
      />
      {children}
    </div>,
    document.body
  )
}

const DialogContent = forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative z-50 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl',
      'mx-4 animate-fade-in-up',
      className
    )}
    {...props}
  >
    {children}
  </div>
))
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, children, ...props }) {
  return (
    <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...props}>
      {children}
    </div>
  )
}

function DialogTitle({ className, children, ...props }) {
  return (
    <h2
      className={cn('text-[17px] font-bold text-[var(--text-primary)]', className)}
      {...props}
    >
      {children}
    </h2>
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle }
