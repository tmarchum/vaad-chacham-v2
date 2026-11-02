import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Select = forwardRef(
  ({ className, value, onChange, options = [], placeholder, ...props }, ref) => (
    <select
      ref={ref}
      value={value}
      onChange={onChange}
      className={cn(
        'h-9 w-full appearance-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 pe-8 text-[13px]',
        'text-[var(--text-primary)]',
        'transition-all duration-150',
        'hover:border-slate-300 cursor-pointer',
        'focus:border-[var(--primary)] focus:outline-none focus:ring-[3px] focus:ring-blue-500/8',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50',
        'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")]',
        'bg-[length:12px] bg-[position:left_0.75rem_center] bg-no-repeat',
        className
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
)

Select.displayName = 'Select'

export { Select }
