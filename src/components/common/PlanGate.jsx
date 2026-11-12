import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useBuildingContext } from '@/hooks/useStore'
import { access, ROUTE_FEATURE, PLAN_LABELS, PLAN_PITCH } from '@/lib/access'
import { Lock, ShieldCheck } from 'lucide-react'

// Wraps the page canvas. A committee member who reaches a page their plan
// does not include (by a saved link, a search result or a typed URL) sees
// what the page is and which plan includes it, instead of a page that half
// works. The management side always passes.
export function PlanGate({ children }) {
  const { pathname } = useLocation()
  const { isAdmin } = useAuth()
  const { selectedBuilding } = useBuildingContext()
  const feature = ROUTE_FEATURE['/' + (pathname.split('/')[1] || '')]
  const res = access(feature, { isAdmin, building: selectedBuilding })
  if (res.ok) return children

  if (res.needs === 'staff') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldCheck className="h-10 w-10 mx-auto text-[var(--text-muted)]" />
        <h1 className="text-[20px] font-bold">כלי של חברת הניהול</h1>
        <p className="text-[14px] text-[var(--text-secondary)]">העמוד הזה משמש את חברת הניהול לעבודה מול ספקים ואחזקה, ואינו חלק מממשק הוועד.</p>
        <Link to="/" className="inline-block text-[13px] font-semibold text-[var(--primary)] hover:underline">חזרה לדשבורד</Link>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-3">
      <Lock className="h-10 w-10 mx-auto text-[var(--primary)]" />
      <h1 className="text-[20px] font-bold">זמין במסלול {PLAN_LABELS[res.needs]}</h1>
      <p className="text-[14px] text-[var(--text-secondary)]">{PLAN_PITCH[res.needs]}</p>
      <p className="text-[12px] text-[var(--text-muted)]">
        הבניין כרגע במסלול {PLAN_LABELS[selectedBuilding?.service_plan] || '—'}. לשדרוג פנו לחברת הניהול.
      </p>
      <Link to="/" className="inline-block text-[13px] font-semibold text-[var(--primary)] hover:underline">חזרה לדשבורד</Link>
    </div>
  )
}

export default PlanGate
