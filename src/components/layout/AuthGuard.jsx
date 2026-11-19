import { lazy, Suspense } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { PendingApproval } from './PendingApproval'
import { ResidentAccessGate } from '@/components/common/AccessGate'
import { isResidentPreviewOn } from '@/lib/residentPreview'

// The resident screens are large and the committee never opens them — load
// them only for the user who needs them, not in everyone's first download.
const ResidentOnboarding = lazy(() => import('./ResidentOnboarding').then((m) => ({ default: m.ResidentOnboarding })))
const ResidentPortal = lazy(() => import('./ResidentPortal').then((m) => ({ default: m.ResidentPortal })))
const ResidentPreview = lazy(() => import('./ResidentPreview').then((m) => ({ default: m.ResidentPreview })))

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900" dir="rtl">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-300 text-sm">טוען...</p>
      </div>
    </div>
  )
}

export function AuthGuard() {
  const { user, loading, needsOnboarding, isCommittee, profile } = useAuth()

  if (loading) return <Spinner />

  if (!user) return <Navigate to="/login" replace />

  // New user whose email didn't auto-match a resident → show onboarding wizard
  if (needsOnboarding) return <Suspense fallback={<Spinner />}><ResidentOnboarding /></Suspense>

  // Picked an apartment, not approved by the committee yet → nothing of the building is shown
  if (!isCommittee && profile?.unit_id && profile.is_verified === false) return <PendingApproval />

  // Resident user (not admin/committee) who has been linked to a unit → dedicated portal
  if (!isCommittee && profile?.unit_id) return <ResidentAccessGate buildingId={profile.building_id}><Suspense fallback={<Spinner />}><ResidentPortal /></Suspense></ResidentAccessGate>

  // Admin/committee "view as resident" preview (toggled from the sidebar menu)
  if (isCommittee && isResidentPreviewOn()) return <Suspense fallback={<Spinner />}><ResidentPreview /></Suspense>

  return <Outlet />
}
