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
        'h-2 w-full overflow-hidden rounded-full bg-slate-100',
        className
      )}
      {...props}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${clampedValue}%`,
          background: color
            ? `linear-gradient(90deg, ${color}, ${color}dd)`
            : 'linear-gradient(90deg, var(--primary), var(--primary-light))',
        }}
      />
    </div>
  )
})

Progress.displayName = 'Progress'

export { Progress }
