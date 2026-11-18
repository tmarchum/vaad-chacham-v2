import { forwardRef, useEffect } from 'react'
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

  // Escape closes, as people expect from a window.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onOpenChange?.(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0b1c30]/40 premium-dialog-overlay transition-opacity"
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
      // Width comes from the overlay's padding, not margins: w-full + mx-4 was
      // 32px wider than a phone screen and let every dialog pan sideways.
      'relative z-50 w-full min-w-0 max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xl)]',
      'animate-fade-in-up',
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
    <div className={cn('mb-4 pb-3 flex flex-col gap-1.5 border-b border-[var(--border)]', className)} {...props}>
      {children}
    </div>
  )
}

function DialogTitle({ className, children, ...props }) {
  return (
    <h2
      className={cn('text-[18px] leading-7 font-semibold text-[var(--text-primary)]', className)}
      {...props}
    >
      {children}
    </h2>
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle }
