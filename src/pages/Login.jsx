import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden" dir="rtl">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/20 p-10 w-full max-w-[380px] text-center space-y-8">
        {/* Accent gradient line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-l from-blue-600 via-blue-500 to-indigo-600 rounded-t-2xl" />

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-1">
            <span className="text-white text-xl font-black">+ו</span>
          </div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tight">
            וועד<span className="text-blue-600">+</span>
          </h1>
          <p className="text-sm text-gray-400 font-light">ניהול בתים משותפים חכם</p>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* Google Sign In */}
        <div className="space-y-4">
          <p className="text-sm text-gray-500 font-medium">כניסה באמצעות חשבון גוגל</p>
          <button
            onClick={async () => {
              setError(null)
              try {
                await signInWithGoogle()
              } catch {
                setError('ההתחברות נכשלה. נסה שוב.')
              }
            }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                מתחבר...
              </span>
            ) : (
              <>
                {/* Google G logo SVG */}
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                המשך עם Google
              </>
            )}
          </button>
          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        </div>

        <p className="text-xs text-gray-400">
          הגישה מותרת לדיירים, חברי ועד ומנהלים בלבד
        </p>
      </div>
    </div>
  )
}
