import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AlertsPanel } from './AlertsPanel'
import { GlobalSearch } from './GlobalSearch'
import { Menu, X, AlertCircle, CheckCircle, Bell, FileText, PlusCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useBuildingPulse } from '@/hooks/useBuildingPulse'
import { BrandLogo } from '@/components/common/BrandLogo'

// Monotonic toast ids — Date.now() collides when a bulk flow fires several
// toasts inside the same millisecond.
let toastSeq = 0
const nextToastId = () => ++toastSeq

// ── Global toast system ──────────────────────────────────────────────────────
// Modules call toast()/toastError() from src/lib/toast.js, which dispatches
// the 'app-toast' window event rendered here.
function Toast({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90vw] max-w-md pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius)] px-4 py-3 shadow-[var(--shadow-lg)] text-[13px] font-medium pointer-events-auto animate-fade-in-up border',
            t.type === 'error'
              ? 'bg-[var(--danger-light)] border-[var(--danger)]/20 text-[var(--danger)]'
              : t.type === 'success'
              ? 'bg-[var(--success-light)] border-[var(--success)]/20 text-[var(--success)]'
              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-primary)]'
          )}
        >
          {t.type === 'error'
            ? <AlertCircle className="h-4 w-4 shrink-0" />
            : <CheckCircle className="h-4 w-4 shrink-0" />
          }
          <span className="flex-1">{t.message}</span>
          {t.count > 1 && (
            <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[11px] font-bold num-tabular">×{t.count}</span>
          )}
          <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const location = useLocation()
  const { selectedBuilding } = useBuildingContext()
  const { data: allAlerts, refresh: refreshAlerts } = useCollection('agentAlerts', { building_id: selectedBuilding?.id })
  const unreadCount = allAlerts.filter(a => !a.is_read && !a.is_dismissed).length
  // Shell vitals refresh on every page change — counts only, no rows.
  const pulse = useBuildingPulse(selectedBuilding?.id, location.pathname)

  // A bulk flow fires one store toast per row, so the same line used to stack
  // ten or fifteen times. An identical message that is still on screen only
  // bumps a counter and restarts its timer — one line, "עודכן בהצלחה ✓ ×12".
  const timers = useRef({})
  const addToast = (message, type = 'info') => {
    let reused = false
    setToasts(prev => {
      const existing = prev.find(t => t.message === message && t.type === type)
      if (!existing) return [...prev, { id: nextToastId(), message, type, count: 1 }]
      reused = true
      return prev.map(t => (t === existing ? { ...t, count: (t.count || 1) + 1 } : t))
    })
    // The timer belongs to the message, not to this call: restart it either way.
    const key = `${type}|${message}`
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      delete timers.current[key]
      setToasts(prev => prev.filter(t => !(t.message === message && t.type === type)))
    }, reused ? 3000 : 5000)
  }
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  useEffect(() => {
    const handler = (e) => addToast(e.detail?.message || 'שגיאה לא ידועה', e.detail?.type || 'error')
    window.addEventListener('app-toast', handler)
    return () => window.removeEventListener('app-toast', handler)
  }, [])

  const balance = selectedBuilding?.balance
  const statusOk = pulse.urgentIssues === 0

  return (
    <div dir="rtl" className="flex h-screen bg-[var(--bg)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} pulse={pulse} />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* ── Top bar ── */}
        <header className="h-16 shrink-0 z-30 flex items-center gap-3 bg-[var(--surface)] border-b border-[var(--border)] px-4 lg:px-6">
          <button
            className="p-2 -mr-1 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] transition-colors lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="תפריט"
          >
            <Menu className="h-5 w-5 text-[var(--text-primary)]" />
          </button>
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <BrandLogo className="w-7 h-7 rounded-md" />
            <span className="font-bold text-[var(--primary)]">ועדלי</span>
          </Link>

          <GlobalSearch buildingId={selectedBuilding?.id} className="hidden md:block w-full max-w-sm" />

          <div className="mr-auto flex items-center gap-2 lg:gap-4">
            {/* Building status */}
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)]">
              <span className={cn('h-2 w-2 rounded-full', statusOk ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} />
              <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                סטטוס שוטף: <strong className="text-[var(--text-primary)]">{statusOk ? 'תקין' : `${pulse.urgentIssues} דחופות`}</strong>
              </span>
            </div>

            {/* Treasury balance */}
            {balance != null && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[11px] text-[var(--text-muted)]">יתרת קופה:</span>
                <span className={cn('text-[15px] font-bold num-tabular', balance >= 0 ? 'text-[var(--primary)]' : 'text-[var(--danger)]')}>
                  {formatCurrency(balance)}
                </span>
              </div>
            )}

            <div className="hidden lg:block h-5 w-px bg-[var(--outline-variant)]/60" />

            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="relative p-2 rounded-[var(--radius)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors"
              aria-label="התראות"
              title="התראות"
            >
              <Bell className="h-[22px] w-[22px]" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-bold text-white px-1 ring-2 ring-[var(--surface)]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <Link
              to="/reports"
              className="hidden md:flex h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[var(--text-primary)] text-[12px] font-semibold items-center gap-2 transition-all active:scale-95"
            >
              <FileText className="h-[18px] w-[18px] text-[var(--primary)]" strokeWidth={1.75} />
              הפקת דוח כספי
            </Link>
            <Link
              to="/issues?new=1"
              className="h-[38px] px-3 sm:px-3.5 rounded-[var(--radius)] bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-[12px] font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-[var(--shadow)]"
            >
              <PlusCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="hidden sm:inline">קריאה חדשה</span>
            </Link>
          </div>
        </header>

        {/* ── Page canvas ── */}
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8 lg:py-6">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <AlertsPanel
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        alerts={allAlerts}
        refreshAlerts={refreshAlerts}
      />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export { Layout }
