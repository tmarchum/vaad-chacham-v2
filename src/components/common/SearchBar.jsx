import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function SearchBar({ value, onChange, placeholder = 'חיפוש...', className }) {
  const [internal, setInternal] = useState(value || '')
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)

  // Sync from parent when value prop changes
  useEffect(() => {
    setInternal(value || '')
  }, [value])

  const handleChange = (e) => {
    const val = e.target.value
    setInternal(val)

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange?.(val)
    }, 300)
  }

  const handleClear = () => {
    setInternal('')
    clearTimeout(timerRef.current)
    onChange?.('')
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  return (
    <div className={cn('relative', className)}>
      <Search className={cn(
        'absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
        focused ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
      )} />
      <input
        type="text"
        value={internal}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={cn(
          'h-10 w-full rounded-xl border bg-white pr-10 pl-10 py-2 text-[13px]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'transition-all duration-200',
          focused
            ? 'border-[var(--primary)] shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
            : 'border-[var(--border)] hover:border-slate-300'
        )}
      />
      {internal && (
        <button
          onClick={handleClear}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
        >
          <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </button>
      )}
    </div>
  )
}

export { SearchBar }
