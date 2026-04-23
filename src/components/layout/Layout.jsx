import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AlertsPanel } from './AlertsPanel'
import { Menu, X, AlertCircle, CheckCircle, Bell, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCollection, useBuildingContext } from '@/hooks/useStore'

// ── Global toast system ──────────────────────────────────────────────────────
// Other modules dispatch window events to show toasts:
//   window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }))
//   type: 'error' | 'success' | 'info'

function Toast({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90vw] max-w-md pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl text-sm font-medium pointer-events-auto animate-fade-in-up',
            'backdrop-blur-sm',
            t.type === 'error'
              ? 'bg-red-50/95 border border-red-200 text-red-800'
              : t.type === 'success'
              ? 'bg-green-50/95 border border-green-200 text-green-800'
              : 'bg-white/95 border border-[var(--border)] text-[var(--text-primary)]'
          )}
        >
          {t.type === 'error'
            ? <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            : <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          }
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

const PAGE_TITLES = {
  '/': 'דשבורד',
  '/buildings': 'בניינים',
  '/units': 'דירות',
  '/residents': 'דיירים',
  '/payments': 'גבייה',
  '/collection-cases': 'מעקב גבייה',
  '/bank-transactions': 'תנועות בנק',
  '/bank-settings': 'חשבונות בנק',
  '/income': 'הכנסות',
  '/expenses': 'הוצאות',
  '/balance': 'מאזן',
  '/expense-analysis': 'ניתוח הוצאות AI',
  '/reports': 'דוחות',
  '/issues': 'תקלות',
  '/work-orders': 'הזמנות עבודה',
  '/vendor-finder': 'מציאת ספקים',
  '/vendors': 'ספקים',
  '/recurring-tasks': 'משימות חוזרות',
  '/building-assets': 'ציוד ומערכות',
  '/compliance': 'רגולציה',
  '/documents': 'מסמכים',
  '/announcements': 'הודעות',
  '/smart-agents': 'סוכנים חכמים',
  '/building-agent': 'סוכן בריאות',
  '/admin': 'הגדרות מערכת',
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const location = useLocation()
  const { selectedBuilding } = useBuildingContext()
  const { data: allAlerts, refresh: refreshAlerts } = useCollection('agentAlerts')
  const alerts = selectedBuilding
    ? allAlerts.filter(a => a.building_id === selectedBuilding.id)
    : allAlerts
  const unreadCount = alerts.filter(a => !a.is_read && !a.is_dismissed).length

  const pageTitle = PAGE_TITLES[location.pathname] || ''

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  useEffect(() => {
    const handler = (e) => addToast(e.detail?.message || 'שגיאה לא ידועה', e.detail?.type || 'error')
    window.addEventListener('app-toast', handler)
    return () => window.removeEventListener('app-toast', handler)
  }, [])

  return (
    <div dir="rtl" className="flex h-screen bg-[var(--bg)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Header ── */}
        <header className="glass-header sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] px-4 lg:px-6 py-2.5">
          {/* Mobile menu + branding */}
          <button
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-[var(--text-primary)]" />
          </button>
          <span className="font-extrabold text-[var(--text-primary)] lg:hidden">
            וועד<span className="text-[var(--primary)]">+</span>
          </span>

          {/* Page title (desktop) */}
          {pageTitle && (
            <h2 className="hidden lg:block text-[15px] font-semibold text-[var(--text-primary)]">
              {pageTitle}
            </h2>
          )}

          {/* Spacer + actions */}
          <div className="mr-auto flex items-center gap-2">
            {/* Search */}
            <div className="hidden md:flex items-center gap-2 bg-[var(--surface-hover)] rounded-lg px-3 py-1.5 w-56 border border-transparent focus-within:border-[var(--primary)]/20 focus-within:bg-white transition-all">
              <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="חיפוש..."
                className="bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none w-full"
              />
            </div>

            {/* Notifications */}
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="relative p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            >
              <Bell className="h-5 w-5 text-[var(--text-secondary)]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1 shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <AlertsPanel
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        alerts={alerts}
        refreshAlerts={refreshAlerts}
      />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export { Layout }
