import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ResidentOnboarding } from './ResidentOnboarding'
import { ResidentPortal } from './ResidentPortal'

export function AuthGuard() {
  const { user, loading, needsOnboarding, isCommittee, profile } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-300 text-sm">טוען...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // New user whose email didn't auto-match a resident → show onboarding wizard
  if (needsOnboarding) return <ResidentOnboarding />

  // Resident user (not admin/committee) who has been linked to a unit → dedicated portal
  if (!isCommittee && profile?.unit_id) return <ResidentPortal />

  return <Outlet />
}
