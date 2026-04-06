import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Progress = forwardRef(({ value = 0, color, className, ...props }, ref) => {
  const clampedValue = Math.min(100, Math.max(0, value))

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'h-2.5 w-full overflow-hidden rounded-full bg-[var(--border-light)]',
        className
      )}
      {...props}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${clampedValue}%`,
          backgroundColor: color || 'var(--primary)',
        }}
      />
    </div>
  )
})

Progress.displayName = 'Progress'

export { Progress }
