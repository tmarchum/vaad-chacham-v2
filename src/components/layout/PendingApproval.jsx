import { useAuth } from '@/hooks/useAuth'
import { Clock, LogOut } from 'lucide-react'

/**
 * Shown to a resident who self-onboarded (picked a building/unit) but has not
 * yet been verified by the vaad. They have NO access to any data until an admin
 * approves them — this is the security gate for self-registration.
 */
export function PendingApproval() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden" dir="rtl">
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-md mx-4 p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-gray-900">הבקשה התקבלה — ממתינה לאישור</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            נרשמת לדירה בבניין, והבקשה ממתינה לאישור נציג הוועד.
            לאחר האישור תקבל/י גישה מלאה לפורטל הדייר.
          </p>
        </div>
        {user?.email && (
          <p className="text-xs text-gray-400">מחובר כ-{user.email}</p>
        )}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
          אם אתה דייר חדש, מומלץ ליידע את ועד הבית כדי לזרז את האישור.
        </div>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          התנתק / החלף חשבון
        </button>
      </div>
    </div>
  )
}
