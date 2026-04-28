import { Link } from 'react-router-dom'
import { Home, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div
      dir="rtl"
      className="flex min-h-[70vh] flex-col items-center justify-center text-center px-6 py-20"
    >
      {/* Large 404 */}
      <div className="select-none text-[120px] font-black leading-none text-slate-100">
        404
      </div>

      {/* Icon */}
      <div className="mt-2 mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
        <Home className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        הדף לא נמצא
      </h1>
      <p className="mt-2 text-sm max-w-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        הכתובת שביקשת אינה קיימת. ייתכן שהקישור שגוי או שהדף הוסר.
      </p>

      <Button asChild className="mt-8 gap-2">
        <Link to="/">
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
      </Button>
    </div>
  )
}
