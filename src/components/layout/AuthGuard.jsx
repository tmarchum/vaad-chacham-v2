import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ResidentOnboarding } from './ResidentOnboarding'
import { ResidentPortal } from './ResidentPortal'
import { ResidentPreview } from './ResidentPreview'
import { isResidentPreviewOn } from '@/lib/residentPreview'

export function AuthGuard() {
  const { user, loading, needsOnboarding, isCommittee, profile } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-stone-300 text-sm">טוען...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // New user whose email didn't auto-match a resident → show onboarding wizard
  if (needsOnboarding) return <ResidentOnboarding />

  // Resident user (not admin/committee) who has been linked to a unit → dedicated portal
  if (!isCommittee && profile?.unit_id) return <ResidentPortal />

  // Admin/committee "view as resident" preview (toggled from the sidebar menu)
  if (isCommittee && isResidentPreviewOn()) return <ResidentPreview />

  return <Outlet />
}
