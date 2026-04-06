import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu, X, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
            'flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium pointer-events-auto',
            t.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : t.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]'
          )}
        >
          {t.type === 'error'
            ? <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            : <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          }
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts] = useState([])

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
        {/* Mobile header */}
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:hidden">
          <button
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-[var(--text-primary)]" />
          </button>
          <span className="font-semibold text-[var(--text-primary)]">ועד חכם</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export { Layout }
