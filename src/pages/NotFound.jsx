import { Link } from 'react-router-dom'
import { Compass, ArrowRight } from 'lucide-react'

export default function NotFound() {
  return (
    <div dir="rtl" className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-8 text-center">
        <span className="inline-flex p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]">
          <Compass className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <p className="mt-5 text-[56px] leading-none font-bold tracking-[-0.03em] text-[var(--primary)] num-tabular select-none">
          404
        </p>
        <h1 className="mt-3 text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">
          הדף לא נמצא
        </h1>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-secondary)]">
          הכתובת שביקשת אינה קיימת. ייתכן שהקישור שגוי או שהדף הוסר.
        </p>
        <div className="mt-6 pt-5 border-t border-[var(--border-light)]">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-[var(--radius)] bg-[var(--primary)] text-white text-[13px] font-semibold shadow-[var(--shadow)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
            חזרה לדשבורד
          </Link>
        </div>
      </div>
    </div>
  )
}
