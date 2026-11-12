import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Wallet, Wrench, Megaphone, Download } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { BrandLogo } from '@/components/common/BrandLogo'

const HIGHLIGHTS = [
  { icon: Wallet, title: 'גבייה ותשלומים', text: 'מעקב חובות, תשלומים והוצאות במקום אחד' },
  { icon: Wrench, title: 'תקלות וספקים', text: 'פתיחת קריאות, מעקב טיפול ושיבוץ ספקים' },
  { icon: Megaphone, title: 'תקשורת עם דיירים', text: 'הודעות, סקרים והזמנת חללים משותפים' },
]

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--bg)]" dir="rtl">
      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-[var(--primary-dark)] text-white">
        <div className="flex items-center gap-3">
          <BrandLogo className="w-10 h-10 rounded-[var(--radius)]" />
          <span className="text-[20px] font-bold tracking-[-0.015em]">ועד1</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-[32px] leading-10 font-bold tracking-[-0.02em]">
            ניהול הבניין, בלי כאב ראש.
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-white/75">
            כל מה שוועד הבית צריך — כספים, תקלות, דיירים ותקשורת — בממשק אחד פשוט וברור.
          </p>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="p-2 rounded-[var(--radius)] bg-white/10 shrink-0">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold">{title}</p>
                  <p className="text-[13px] text-white/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-white/60 flex items-center gap-1.5">
          <Building2 className="h-4 w-4" />
          ניהול בתים משותפים חכם
        </p>
      </aside>

      {/* Sign-in panel */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-6 sm:p-8">
            {/* Logo */}
            <div className="flex flex-col items-center text-center gap-2">
              <BrandLogo className="w-14 h-14 rounded-[var(--radius-lg)]" />
              <h1 className="mt-2 text-[28px] leading-9 font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                ועד<span className="text-[var(--primary)]">1</span>
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)]">ניהול בתים משותפים חכם</p>
            </div>

            <div className="my-6 border-t border-[var(--border-light)]" />

            {/* Google Sign In */}
            <div className="space-y-3">
              <p className="text-[12px] font-medium text-[var(--text-secondary)] text-center">כניסה באמצעות חשבון גוגל</p>
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
                className="w-full flex items-center justify-center gap-3 h-11 px-4 border border-[var(--outline-variant)] rounded-[var(--radius)] bg-[var(--surface)] text-[14px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] hover:border-[var(--primary)] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
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
              {error && (
                <p className="text-center text-[12px] font-medium px-3 py-2 rounded-[var(--radius)] bg-[var(--danger-light)] text-[var(--danger)]">
                  {error}
                </p>
              )}
            </div>

            <p className="mt-5 text-[12px] text-[var(--text-muted)] text-center">
              הגישה מותרת לדיירים, חברי ועד ומנהלים בלבד
            </p>
          </div>

          {/* Android app download */}
          <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
            <a
              href="https://github.com/tmarchum/vaad-chacham-v2/releases/download/android-latest/vaadplus.apk"
              className="w-full flex items-center justify-center gap-2 h-[38px] px-4 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] text-[13px] font-semibold hover:bg-[var(--surface-container)] transition-colors"
            >
              <Download className="h-4 w-4" />
              הורד אפליקציית אנדרואיד
            </a>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">לאנדרואיד בלבד · התקנה ישירה (APK)</p>
            <p dir="ltr" className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">build {import.meta.env.VITE_BUILD || 'dev'}</p>
          </div>
        </div>
      </main>
    </div>
  )
}
