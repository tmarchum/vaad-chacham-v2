import { useState } from 'react'
import { Type } from 'lucide-react'
import { TEXT_SIZES, getTextSize, setTextSize } from '@/lib/textSize'
import { cn } from '@/lib/utils'

/**
 * Three buttons, no menu to discover. Shown to committee members in the
 * sidebar and to residents in the portal header — residents are the larger
 * and older audience, so it cannot live only in an admin screen.
 */
export function TextSizeControl({ className, compact = false }) {
  const [size, setSize] = useState(getTextSize)

  const pick = (id) => { setTextSize(id); setSize(id) }

  // Compact: the three letters alone, for an app bar with no room for a label.
  if (compact) {
    return (
      <div className={cn('flex gap-0.5 shrink-0', className)} role="group" aria-label="גודל טקסט">
        {TEXT_SIZES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => pick(s.id)}
            aria-pressed={size === s.id}
            title={`גודל טקסט: ${s.label}`}
            className={cn(
              'w-7 h-7 rounded-[var(--radius)] border leading-none transition-colors',
              i === 0 ? 'text-[11px]' : i === 1 ? 'text-[13px]' : 'text-[15px]',
              size === s.id
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white font-bold'
                : 'border-[var(--outline-variant)] text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]',
            )}
          >
            א
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
        <Type className="h-3.5 w-3.5" />גודל טקסט
      </span>
      <div className="flex gap-1" role="group" aria-label="גודל טקסט">
        {TEXT_SIZES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => pick(s.id)}
            aria-pressed={size === s.id}
            className={cn(
              'flex-1 rounded-[var(--radius)] border py-1.5 transition-colors',
              // The button itself grows with the level it sets, so the choice
              // is legible before it is made.
              i === 0 ? 'text-[12px]' : i === 1 ? 'text-[14px]' : 'text-[16px]',
              size === s.id
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white font-bold'
                : 'border-[var(--outline-variant)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]',
            )}
          >
            א
          </button>
        ))}
      </div>
    </div>
  )
}

export default TextSizeControl
