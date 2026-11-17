import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Hourglass, LogOut, RefreshCw } from 'lucide-react'

// Shown to someone who picked an apartment and waits for the committee.
// Until approval they see nothing of the building.
export function PendingApproval() {
  const { user, signOut, refetchProfile } = useAuth()
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    await refetchProfile()
    setChecking(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center space-y-4">
        <BrandLogo className="w-12 h-12 rounded-xl mx-auto" />
        <Hourglass className="h-8 w-8 text-amber-500 mx-auto" />
        <h1 className="text-lg font-extrabold text-gray-900">הבקשה שלך ממתינה לאישור הוועד</h1>
        <p className="text-sm text-gray-600">
          ביקשת להצטרף לדירה בבניין. חבר ועד צריך לאשר את הבקשה, ואז ייפתח לך האזור האישי.
          אם זה לוקח זמן, אפשר לפנות לוועד הבית.
        </p>
        {user?.email && <p className="text-xs text-gray-400" dir="ltr">{user.email}</p>}
        <button onClick={check} disabled={checking}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />{checking ? 'בודק...' : 'בדיקה אם אושר'}
        </button>
        <button onClick={signOut} className="flex items-center justify-center gap-1 text-xs font-medium text-gray-400 hover:text-red-500 mx-auto">
          <LogOut className="h-3.5 w-3.5" />התנתקות
        </button>
      </div>
    </div>
  )
}
