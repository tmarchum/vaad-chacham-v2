import { cn } from '@/lib/utils'

// Civic Blue status pills: fully rounded, tinted fill + matching ink and a
// faint hairline. `solid` (e.g. "דחוף") is the loud variant.
const variantStyles = {
  default: 'bg-[var(--surface-container)] text-[var(--primary-dark)] border-[var(--primary)]/15',
  success: 'bg-[var(--success-light)] text-[var(--success)] border-[var(--success)]/20',
  warning: 'bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning)]/20',
  danger:  'bg-[var(--danger-light)] text-[var(--danger)] border-[var(--danger)]/20',
  info:    'bg-[var(--surface-variant)] text-[var(--primary-dark)] border-[var(--primary)]/15',
  neutral: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
  outline: 'bg-transparent text-[var(--text-secondary)] border-[var(--outline-variant)]',
  solid:   'bg-[var(--danger)] text-white border-transparent',
}

function Badge({ className, variant = 'default', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] leading-[16px] font-semibold whitespace-nowrap',
        variantStyles[variant] || variantStyles.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { Badge }
