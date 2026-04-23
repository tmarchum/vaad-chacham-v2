import { X, AlertTriangle, AlertCircle, Info, CheckCircle, Eye, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import supabaseStore from '@/data/supabaseStore'

const SEVERITY_CONFIG = {
  high: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', label: 'גבוה' },
  medium: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200', label: 'בינוני' },
  low: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200', label: 'נמוך' },
}

const AGENT_LABELS = {
  expense_analysis: 'ניתוח הוצאות',
  collection: 'גבייה',
  budget: 'תקציב',
}

function AlertsPanel({ open, onClose, alerts, refreshAlerts }) {
  if (!open) return null

  const activeAlerts = alerts.filter(a => !a.is_dismissed)
  const unread = activeAlerts.filter(a => !a.is_read)
  const read = activeAlerts.filter(a => a.is_read)

  const markRead = async (id) => {
    await supabaseStore.agentAlerts.update(id, { is_read: true })
    refreshAlerts()
  }

  const dismiss = async (id) => {
    await supabaseStore.agentAlerts.update(id, { is_dismissed: true })
    refreshAlerts()
  }

  const markAllRead = async () => {
    for (const a of unread) {
      await supabaseStore.agentAlerts.update(a.id, { is_read: true })
    }
    refreshAlerts()
  }

  const formatDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth() + 1} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 premium-dialog-overlay" onClick={onClose} />
      <div className="fixed top-0 left-0 z-[70] h-full w-96 max-w-[90vw] bg-[var(--surface)] border-r border-[var(--border)] shadow-2xl flex flex-col animate-fade-in-up" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">התראות סוכנים</h2>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                סמן הכל כנקרא
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-hover)]">
              <X className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Alerts list */}
        <div className="flex-1 overflow-y-auto">
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <CheckCircle className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">אין התראות</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {[...unread, ...read].map(alert => {
                const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low
                const Icon = sev.icon
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'px-4 py-3 transition-colors',
                      !alert.is_read ? 'bg-[var(--primary)]/5' : ''
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', sev.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {alert.title}
                          </span>
                          {!alert.is_read && (
                            <span className="inline-block w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                          )}
                        </div>
                        {alert.description && (
                          <p className="text-xs text-[var(--text-secondary)] mb-1 leading-relaxed">
                            {alert.description}
                          </p>
                        )}
                        {alert.recommendation && (
                          <p className="text-xs text-[var(--primary)] mb-1">
                            💡 {alert.recommendation}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', sev.bg)}>
                            {sev.label}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {AGENT_LABELS[alert.agent_type] || alert.agent_type}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatDate(alert.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!alert.is_read && (
                          <button
                            onClick={() => markRead(alert.id)}
                            className="p-1 rounded hover:bg-[var(--surface-hover)]"
                            title="סמן כנקרא"
                          >
                            <Eye className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                          </button>
                        )}
                        <button
                          onClick={() => dismiss(alert.id)}
                          className="p-1 rounded hover:bg-red-50"
                          title="מחק"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export { AlertsPanel }
