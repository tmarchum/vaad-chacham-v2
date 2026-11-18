import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useBuildingContext } from '@/hooks/useStore'
import { useBuildingAccess, ACCESS_REASON } from '@/lib/buildingAccess'
import { periodLabel, nis } from '@/lib/statements'
import { Ban } from 'lucide-react'

// A building that does not pay keeps only "חשבון ועד1" open, so the committee
// can see what is owed. The system admin is never blocked.
export function AccessGate({ children }) {
  const { pathname } = useLocation()
  const { isAdmin } = useAuth()
  const { selectedBuilding } = useBuildingContext()
  const acc = useBuildingAccess(isAdmin ? null : selectedBuilding?.id)
  if (isAdmin || acc.loading || !acc.blocked || pathname.startsWith('/charges')) return children
  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-3">
      <Ban className="h-10 w-10 mx-auto text-[var(--danger)]" />
      <h1 className="text-[20px] font-bold">הגישה לבניין מוגבלת</h1>
      <p className="text-[14px] text-[var(--text-secondary)]">{ACCESS_REASON[acc.reason] || 'יש בעיה בתשלום לוועד1.'}</p>
      {acc.reason === 'unpaid' && acc.period && (
        <p className="text-[13px] text-[var(--text-secondary)]">חשבון {periodLabel(acc.period)} · {nis(acc.total)} לפני מע"מ</p>
      )}
      <p className="text-[13px] text-[var(--text-secondary)]">כדי לפתוח את הגישה מחדש, צרו קשר עם ועד1.</p>
      <Link to="/charges" className="inline-block text-[13px] font-semibold text-[var(--primary)] hover:underline">לחשבון ועד1</Link>
    </div>
  )
}

/** Residents of a blocked building see one plain line instead of the portal. */
export function ResidentAccessGate({ buildingId, children }) {
  const acc = useBuildingAccess(buildingId)
  if (acc.loading || !acc.blocked) return children
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" dir="rtl">
      <div className="max-w-sm text-center space-y-3">
        <Ban className="h-10 w-10 mx-auto text-red-500" />
        <h1 className="text-lg font-bold text-gray-900">השירות בבניין מושהה זמנית</h1>
        <p className="text-sm text-gray-600">לפרטים פנו לוועד הבית.</p>
      </div>
    </div>
  )
}

export default AccessGate
