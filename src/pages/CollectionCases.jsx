import { useMemo, useState } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import {
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  Mail, Phone, FileText, Scale,
} from 'lucide-react'

const LEVEL_CONFIG = {
  none:     { label: 'ללא',         variant: 'default', icon: Clock },
  reminder: { label: 'תזכורת',      variant: 'warning', icon: Mail },
  warning:  { label: 'אזהרה',       variant: 'warning', icon: AlertTriangle },
  formal:   { label: 'מכתב רשמי',   variant: 'danger',  icon: FileText },
  legal:    { label: 'משפטי',       variant: 'danger',  icon: Scale },
}

const STATUS_CONFIG = {
  open:    { label: 'פתוח',  variant: 'danger' },
  partial: { label: 'חלקי',  variant: 'warning' },
  closed:  { label: 'נסגר',  variant: 'success' },
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function monthLabel(mk) {
  const [y, m] = mk.split('-')
  return `${HEBREW_MONTHS[parseInt(m) - 1]} ${y}`
}

function CollectionCases() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allCases } = useCollection('collectionCases')
  const { data: allNotifications } = useCollection('notificationLog')
  const [statusFilter, setStatusFilter] = useState('open')
  const [expandedId, setExpandedId] = useState(null)

  const cases = useMemo(() => {
    let filtered = selectedBuilding
      ? allCases.filter(c => c.building_id === selectedBuilding.id)
      : allCases
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter)
    }
    return filtered.sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0))
  }, [allCases, selectedBuilding, statusFilter])

  const totalDebt = cases.reduce((s, c) => s + (c.total_debt || 0), 0)
  const openCount = cases.filter(c => c.status === 'open').length
  const highEscalation = cases.filter(c => c.escalation_level === 'formal' || c.escalation_level === 'legal').length

  const formatDate = (d) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        מעקב גבייה חכם
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-[var(--text-secondary)] mb-1">סה"כ חוב פתוח</div>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalDebt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-[var(--text-secondary)] mb-1">תיקים פתוחים</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-[var(--text-secondary)] mb-1">הסלמה גבוהה</div>
            <div className="text-2xl font-bold text-amber-600">{highEscalation}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'הכל' },
          { key: 'open', label: 'פתוחים' },
          { key: 'closed', label: 'נסגרו' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cases list */}
      {cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400 opacity-50" />
            <p className="text-[var(--text-muted)]">
              {statusFilter === 'open' ? 'אין תיקי גבייה פתוחים' : 'אין תיקים'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {cases.map(c => {
            const level = LEVEL_CONFIG[c.escalation_level] || LEVEL_CONFIG.none
            const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.open
            const LevelIcon = level.icon
            const expanded = expandedId === c.id
            const caseNotifs = allNotifications.filter(n => n.case_id === c.id)

            return (
              <Card key={c.id}>
                <CardContent className="py-4">
                  {/* Main row */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="w-full flex items-center gap-4 text-right"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <LevelIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                      <span className="text-lg font-bold text-[var(--text-primary)]">
                        דירה {c.unit_number}
                      </span>
                    </div>

                    <span className="text-sm text-[var(--text-secondary)]">
                      {c.resident_name || '-'}
                    </span>

                    <div className="flex-1" />

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-600">
                        {formatCurrency(c.total_debt || 0)}
                      </span>
                      <Badge variant={level.variant}>{level.label}</Badge>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-[var(--text-muted)]">חודשים חייבים:</span>
                          <p className="font-medium text-[var(--text-primary)]">{c.months_overdue || 0}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">אימייל:</span>
                          <p className="font-medium text-[var(--text-primary)]">{c.resident_email || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">טלפון:</span>
                          <p className="font-medium text-[var(--text-primary)]">{c.resident_phone || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">פעולה הבאה:</span>
                          <p className="font-medium text-[var(--text-primary)]">{formatDate(c.next_action_date)}</p>
                        </div>
                      </div>

                      {/* Unpaid months */}
                      {c.unpaid_months && c.unpaid_months.length > 0 && (
                        <div>
                          <span className="text-sm text-[var(--text-muted)]">חודשים לא שולמו:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.unpaid_months.map(m => (
                              <span key={m} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                                {monthLabel(m)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* History timeline */}
                      {c.history && c.history.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-[var(--text-primary)]">היסטוריה:</span>
                          <div className="mt-2 space-y-2">
                            {[...c.history].reverse().map((h, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-[var(--text-muted)] shrink-0 w-24">
                                  {formatDate(h.date)}
                                </span>
                                <span className="text-[var(--text-primary)]">{h.note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notifications sent */}
                      {caseNotifs.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            הודעות שנשלחו ({caseNotifs.length}):
                          </span>
                          <div className="mt-2 space-y-1">
                            {caseNotifs.map(n => (
                              <div key={n.id} className="flex items-center gap-2 text-xs">
                                <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                                <span className="text-[var(--text-muted)]">{formatDate(n.created_at)}</span>
                                <span className="text-[var(--text-primary)]">{n.subject}</span>
                                <Badge variant={n.status === 'sent' ? 'success' : 'danger'}>
                                  {n.status === 'sent' ? 'נשלח' : 'נכשל'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CollectionCases
