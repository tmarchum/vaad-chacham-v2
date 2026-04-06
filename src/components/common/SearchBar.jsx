import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function SearchBar({ value, onChange, placeholder = 'חיפוש...', className }) {
  const [internal, setInternal] = useState(value || '')
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
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
      <input
        type="text"
        value={internal}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pr-9 pl-9 py-2 text-sm',
          'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'transition-colors',
          'focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]/25'
        )}
      />
      {internal && (
        <button
          onClick={handleClear}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
        >
          <X className="h-4 w-4 text-[var(--text-muted)]" />
        </button>
      )}
    </div>
  )
}

export { SearchBar }
