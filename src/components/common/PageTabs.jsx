import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useBuildingContext } from '@/hooks/useStore'
import { canSee, ROUTE_FEATURE } from '@/lib/access'
import { cn } from '@/lib/utils'
import { PAGE_HUBS } from '@/lib/pageHubs'

export function PageTabs() {
  const { pathname } = useLocation()
  const { isAdmin } = useAuth()
  const { selectedBuilding } = useBuildingContext()
  const current = '/' + (pathname.split('/')[1] || '')
  const hub = PAGE_HUBS.find((h) => h.some((t) => t.to === current))
  if (!hub) return null
  // A tab the viewer's plan does not include is left out rather than shown
  // locked; the page itself is still guarded if reached by link.
  const tabs = hub.filter((t) => canSee(ROUTE_FEATURE[t.to], { isAdmin, building: selectedBuilding }))
  if (tabs.length < 2) return null
  return (
    <div className="mb-5 flex gap-1 border-b border-[var(--border)]" role="tablist">
      {tabs.map((t) => {
        const on = t.to === current
        return (
          <Link key={t.to} to={t.to} role="tab" aria-selected={on}
            className={cn('px-4 py-2.5 -mb-px border-b-2 text-[14px] font-semibold transition-colors',
              on ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

export default PageTabs
