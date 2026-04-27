import { useMemo, useState } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { FilterPills } from '@/components/common/FilterPills'
import {
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  Mail, Phone, FileText, Scale, UserCheck, DollarSign, FolderOpen,
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

import { HEBREW_MONTHS } from '@/lib/constants'

function monthLabel(mk) {
  const [y, m] = mk.split('-')
  return `${HEBREW_MONTHS[parseInt(m) - 1]} ${y}`
}

function CollectionCases() {
  const { selectedBuilding } = useBuildingContext()
  const { data: allCases, isLoading } = useCollection('collectionCases')
  const { data: allNotifications } = useCollection('notificationLog')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')
  const [statusFilter, setStatusFilter] = useState('open')
  const [expandedId, setExpandedId] = useState(null)

  // Live lookup: unit_id → { number, residentName, email, phone }
  const unitInfo = useMemo(() => {
    const info = {}
    // Map primary resident per unit
    const primary = {}
    allResidents.forEach(r => {
      if (r.is_primary || !primary[r.unit_id]) {
        primary[r.unit_id] = r
      }
    })
    allUnits.forEach(u => {
      const r = primary[u.id]
      info[u.id] = {
        number: u.unit_number || u.number,
        residentName: r ? `${r.first_name || ''} ${r.last_name || ''}`.trim() : '',
        email: r?.email || '',
        phone: r?.phone || '',
      }
    })
    return info
  }, [allUnits, allResidents])

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
  const maxDebt = Math.max(...cases.map(c => c.total_debt || 0), 1)

  const formatDate = (d) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  }

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={UserCheck} iconColor="red" title="מעקב גבייה חכם" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader icon={UserCheck} iconColor="red" title="מעקב גבייה חכם" />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="סה״כ חוב פתוח" value={formatCurrency(totalDebt)} icon={DollarSign} color="red" />
        <StatCard label="תיקים פתוחים" value={openCount} icon={FolderOpen} color="blue" />
        <StatCard label="הסלמה גבוהה" value={highEscalation} icon={AlertTriangle} color="amber" />
      </div>

      {/* Filter */}
      <FilterPills
        options={[
          { key: 'all', label: 'הכל' },
          { key: 'open', label: 'פתוחים' },
          { key: 'closed', label: 'נסגרו' },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
      />

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cases.map(c => {
            const level = LEVEL_CONFIG[c.escalation_level] || LEVEL_CONFIG.none
            const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.open
            const expanded = expandedId === c.id
            const caseNotifs = allNotifications.filter(n => n.case_id === c.id)
            const live = unitInfo[c.unit_id] || {}
            const unitNumber = live.number || c.unit_number
            const residentName = live.residentName || c.resident_name || '-'
            const debtPct = ((c.total_debt || 0) / maxDebt) * 100
            const escalationLevels = ['none', 'reminder', 'warning', 'formal', 'legal']
            const escalationIdx = escalationLevels.indexOf(c.escalation_level || 'none')

            return (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--border)] bg-white p-5 hover:shadow-md hover:border-blue-200 transition-all group cursor-pointer"
                onClick={() => setExpandedId(expanded ? null : c.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar + unit info */}
                  <div className="shrink-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm ${
                      c.status === 'closed'
                        ? 'bg-gradient-to-br from-green-500 to-green-600'
                        : (c.total_debt || 0) > 2000
                          ? 'bg-gradient-to-br from-red-500 to-red-600'
                          : 'bg-gradient-to-br from-blue-500 to-blue-600'
                    }`}>
                      {unitNumber}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
                          דירה {unitNumber} — {residentName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                            הסלמה:
                            {escalationLevels.slice(0, -1).map((_, i) => (
                              <span
                                key={i}
                                className={`inline-block w-1.5 h-1.5 rounded-full ${
                                  i <= escalationIdx
                                    ? escalationIdx >= 3
                                      ? 'bg-red-500'
                                      : escalationIdx >= 1
                                        ? 'bg-amber-500'
                                        : 'bg-gray-300'
                                    : 'bg-gray-200'
                                }`}
                              />
                            ))}
                            <span className="mr-0.5">{level.label}</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className={`text-xl font-extrabold ${
                          c.status === 'closed'
                            ? 'text-green-600'
                            : (c.total_debt || 0) > 2000
                              ? 'text-red-600'
                              : 'text-amber-600'
                        }`}>
                          {formatCurrency(c.total_debt || 0)}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {c.months_overdue || 0} חודשים
                        </div>
                      </div>
                    </div>

                    {/* Debt bar */}
                    <div className={`h-1.5 w-full rounded-full overflow-hidden mb-3 ${
                      c.status === 'closed' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <div
                        className={`h-full rounded-full ${
                          c.status === 'closed'
                            ? 'bg-gradient-to-l from-green-500 to-green-400'
                            : 'bg-gradient-to-l from-red-500 to-red-400'
                        }`}
                        style={{ width: Math.min(100, debtPct) + '%' }}
                      />
                    </div>

                    {/* Month chips */}
                    {c.unpaid_months && c.unpaid_months.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.unpaid_months.map(m => {
                          const isObj = typeof m === 'object'
                          const mk = isObj ? m.month : m
                          const isDiff = isObj && m.type === 'diff'
                          return (
                            <span
                              key={mk}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                isDiff
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {monthLabel(mk)}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div className="shrink-0 mt-1">
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[var(--text-muted)]">חודשים חייבים:</span>
                        <p className="font-medium text-[var(--text-primary)]">{c.months_overdue || 0}</p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">אימייל:</span>
                        <p className="font-medium text-[var(--text-primary)] truncate">{live.email || c.resident_email || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">טלפון:</span>
                        <p className="font-medium text-[var(--text-primary)]">{live.phone || c.resident_phone || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">פעולה הבאה:</span>
                        <p className="font-medium text-[var(--text-primary)]">{formatDate(c.next_action_date)}</p>
                      </div>
                    </div>

                    {/* Unpaid months detail */}
                    {c.unpaid_months && c.unpaid_months.length > 0 && (
                      <div>
                        <span className="text-sm text-[var(--text-muted)]">פירוט חודשים:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.unpaid_months.map(m => {
                            const isObj = typeof m === 'object'
                            const mk = isObj ? m.month : m
                            const isDiff = isObj && m.type === 'diff'
                            return (
                              <span
                                key={mk}
                                className={`text-xs px-2 py-1 rounded border ${
                                  isDiff
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}
                              >
                                {monthLabel(mk)}
                                {isDiff
                                  ? ` — הפרש ${formatCurrency(m.diff)} (שולם ${formatCurrency(m.paid)})`
                                  : isObj
                                    ? ` — לא שולם (${formatCurrency(m.expected)})`
                                    : ''}
                              </span>
                            )
                          })}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CollectionCases
