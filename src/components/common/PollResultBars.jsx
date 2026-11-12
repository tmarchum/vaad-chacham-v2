import { cn } from '@/lib/utils'

// Tally for one poll. Bars and percentages appear only when poll_results says
// the caller may see them; the turnout line is always shown.
export function PollResultBars({ poll, result, compact = false }) {
  if (!result) return null
  const counts = result.counts || []
  const max = Math.max(1, ...counts)
  return (
    <div className="space-y-1.5">
      {(poll.options || []).map((label, i) => {
        const n = counts[i] ?? 0
        const pct = result.voted_units ? Math.round((n / result.voted_units) * 100) : 0
        const mine = result.my_option === i
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-[12px] mb-0.5">
              <span className={cn('font-semibold', mine && 'text-[var(--primary)]')}>{label}{mine ? ' · הבחירה שלך' : ''}</span>
              {result.visible && <span className="num-tabular text-[var(--text-secondary)]">{n} · {pct}%</span>}
            </div>
            {result.visible && (
              <div className={cn('rounded-full bg-[var(--surface-container)] overflow-hidden', compact ? 'h-1.5' : 'h-2')}>
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            )}
          </div>
        )
      })}
      <p className="text-[11px] text-[var(--text-muted)] num-tabular pt-0.5">
        הצביעו {result.voted_units} מתוך {result.total_units} דירות
        {!result.visible && ' · התוצאות יוצגו בהמשך'}
      </p>
    </div>
  )
}
