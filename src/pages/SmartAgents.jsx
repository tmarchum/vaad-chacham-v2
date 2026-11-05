import { useState, useMemo, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { callVaadAgent } from '@/lib/vaadAgent'
import { toast, toastError } from '@/lib/toast'
import {
  CreditCard, Store, PiggyBank, ShieldCheck,
  Play, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Bot,
  MessageSquare, UserX, TrendingUp, TrendingDown,
  Plus, Bell, BellOff, Sparkles, Loader2, Wallet, FileText, Copy,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Marketplace vendor data
// ---------------------------------------------------------------------------

const MARKETPLACE_VENDORS = [
  { name: 'חברת כתר אינסטלציה', category: 'אינסטלציה', phone: '052-1234567', area: 'גוש דן', rating: 4.5, description: 'תיקוני אינסטלציה, נזילות, גז', available_24_7: true },
  { name: 'מגדל חשמל', category: 'חשמל', phone: '054-9876543', area: 'גוש דן', rating: 4.8, description: 'חשמלאי מוסמך, לוחות חשמל, תאורה', available_24_7: false },
  { name: 'קלין פרו ניקיון', category: 'ניקיון', phone: '053-4567890', area: 'ארצי', rating: 4.2, description: 'ניקיון בניינים ומדרגות', available_24_7: false },
  { name: 'אלפא מעליות', category: 'מעליות', phone: '03-5554444', area: 'מרכז', rating: 4.7, description: 'תחזוקה ותיקון מעליות מוסמך', available_24_7: true },
  { name: 'גן עדן גינון', category: 'גינון', phone: '050-3334444', area: 'מרכז', rating: 4.0, description: 'גינון ותחזוקת שטחים ירוקים', available_24_7: false },
  { name: 'קריר מיזוג', category: 'מיזוג', phone: '052-7778888', area: 'גוש דן', rating: 4.3, description: 'התקנה ותחזוקת מזגנים', available_24_7: false },
  { name: 'מנעול מאסטר', category: 'מנעולנות', phone: '054-1112222', area: 'ארצי', rating: 4.6, description: 'מנעולנות, פריצה, החלפת גלילים', available_24_7: true },
  { name: 'צבע ועיצוב', category: 'צבע', phone: '053-5556666', area: 'מרכז', rating: 4.1, description: 'צביעה פנימית וחיצונית', available_24_7: false },
  { name: 'איטום ישראל', category: 'איטום', phone: '03-7778899', area: 'ארצי', rating: 4.4, description: 'איטום גגות, מרפסות, מרתפים', available_24_7: false },
  { name: 'הדברה כוללת', category: 'הדברה', phone: '052-9990011', area: 'ארצי', rating: 4.2, description: 'הדברה מקצועית לבניינים', available_24_7: false },
]

// ---------------------------------------------------------------------------
// Building requirements database
// ---------------------------------------------------------------------------

function getBuildingRequirements(building, existingCompliance, existingTasks) {
  const complianceTitles = existingCompliance.map(c => c.title.toLowerCase())
  const taskTitles = existingTasks.map(t => t.title.toLowerCase())

  const hasRec = (keywords) => keywords.some(k =>
    complianceTitles.some(t => t.includes(k)) || taskTitles.some(t => t.includes(k))
  )

  const alwaysRequired = [
    { title: 'ביטוח מבנה', frequency: 'annually', category: 'ביטוח', law: 'חוק המקרקעין', priority: 'high', type: 'compliance' },
    { title: 'ניקיון חדר מדרגות', frequency: 'monthly', category: 'ניקיון', law: 'תקנות הבתים המשותפים', priority: 'medium', type: 'task' },
    { title: 'בדיקת מערכת הצנרת המשותפת', frequency: 'annually', category: 'אינסטלציה', law: 'תקנות הבתים המשותפים', priority: 'medium', type: 'task' },
    { title: 'בדיקת לוח החשמל הראשי', frequency: 'annually', category: 'חשמל', law: 'תקנות החשמל', priority: 'high', type: 'compliance' },
    { title: 'אסיפת דיירים שנתית', frequency: 'annually', category: 'ניהול', law: 'חוק המקרקעין סעיף 71', priority: 'high', type: 'task' },
    { title: 'ניקיון גג הבניין', frequency: 'quarterly', category: 'ניקיון', law: 'תקנות הבתים המשותפים', priority: 'low', type: 'task' },
    { title: 'בדיקת מד מים ראשי', frequency: 'annually', category: 'אינסטלציה', law: 'תקנות המים', priority: 'medium', type: 'task' },
  ]

  if (building.elevators > 0 || building.elevators === undefined) {
    alwaysRequired.push(
      { title: 'בדיקת מעלית - מכון התקנים', frequency: 'annually', category: 'מעלית', law: 'תקן ישראלי 1130', priority: 'high', type: 'compliance' },
      { title: 'תחזוקה שוטפת מעלית', frequency: 'monthly', category: 'מעלית', law: 'תקן ישראלי 1130', priority: 'high', type: 'task' },
      { title: 'חידוש רישיון תפעול מעלית', frequency: 'annually', category: 'מעלית', law: 'פקודת הבטיחות בעבודה', priority: 'high', type: 'compliance' }
    )
  }

  if (building.fire_suppression) {
    alwaysRequired.push(
      { title: 'בדיקת מערכת כיבוי אש', frequency: 'biannually', category: 'כיבוי אש', law: 'תקנות כיבוי האש', priority: 'high', type: 'compliance' },
      { title: 'טעינת מטפי אש', frequency: 'annually', category: 'כיבוי אש', law: 'תקנות כיבוי האש', priority: 'high', type: 'task' }
    )
  }

  if (building.generator) {
    alwaysRequired.push(
      { title: 'בדיקת גנרטור חירום', frequency: 'quarterly', category: 'גנרטור', law: 'תקנות הבטיחות', priority: 'medium', type: 'task' },
      { title: 'טסט הפעלה שנתי לגנרטור', frequency: 'annually', category: 'גנרטור', law: 'תקנות הבטיחות', priority: 'medium', type: 'compliance' }
    )
  }

  if (building.pool) {
    alwaysRequired.push(
      { title: 'בדיקת מי הבריכה', frequency: 'weekly', category: 'בריכה', law: 'תקנות בריאות הציבור', priority: 'high', type: 'task' },
      { title: 'רישיון הפעלת בריכה', frequency: 'annually', category: 'בריכה', law: 'תקנות בריאות הציבור', priority: 'high', type: 'compliance' }
    )
  }

  const yearBuilt = parseInt(building.year_built)
  if (yearBuilt && (new Date().getFullYear() - yearBuilt) > 30) {
    alwaysRequired.push(
      { title: 'בדיקת יציבות מבנה', frequency: 'annually', category: 'מבנה', law: 'תקן ישראלי 466', priority: 'high', type: 'compliance' },
      { title: 'בדיקת צנרת מים ישנה', frequency: 'biannually', category: 'אינסטלציה', law: 'תקנות המים', priority: 'medium', type: 'task' }
    )
  }

  if (building.floors > 5 || building.elevators > 0) {
    alwaysRequired.push(
      { title: 'בדיקת נגישות - חוק שוויון זכויות', frequency: 'annually', category: 'נגישות', law: 'חוק שוויון זכויות לאנשים עם מוגבלות', priority: 'medium', type: 'compliance' }
    )
  }

  return alwaysRequired.map(req => ({
    ...req,
    covered: hasRec([req.title.toLowerCase().slice(0, 8)])
  }))
}

// ---------------------------------------------------------------------------
// Frequency label helper
// ---------------------------------------------------------------------------

function frequencyLabel(freq) {
  const map = {
    weekly: 'שבועי',
    monthly: 'חודשי',
    quarterly: 'רבעוני',
    biannually: 'חצי שנתי',
    annually: 'שנתי',
  }
  return map[freq] || freq
}

// ---------------------------------------------------------------------------
// Small Civic Blue helpers (local)
// ---------------------------------------------------------------------------

const CALLOUT_TONES = {
  danger:  'border-[var(--danger)]/20 bg-[var(--danger-light)] text-[var(--danger)]',
  warning: 'border-[var(--warning)]/20 bg-[var(--warning-light)] text-[var(--warning)]',
  info:    'border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)]',
  success: 'border-[var(--success)]/20 bg-[var(--success-light)] text-[var(--success)]',
}

function Callout({ tone = 'info', icon: Icon, title, children }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-[13px]', CALLOUT_TONES[tone])}>
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0 mt-0.5" strokeWidth={1.75} />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  )
}

function Bar({ value, tone = 'primary' }) {
  const color = tone === 'success' ? 'bg-[var(--success)]' : tone === 'warning' ? 'bg-[var(--warning)]' : tone === 'danger' ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'
  return (
    <div className="w-full h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function rateTone(rate, good = 80, ok = 60) {
  return rate >= good ? 'success' : rate >= ok ? 'warning' : 'danger'
}

function NoBuilding() {
  return (
    <SectionCard>
      <EmptyState icon={AlertTriangle} title="לא נבחר בניין" description="בחר בניין מהתפריט הראשי." />
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// AiInsightsPanel — Claude AI response panel (shared by all agents),
// rendered as a chat card: the request bubble + Claude's answer bubble.
// ---------------------------------------------------------------------------

const AGENT_LABELS = {
  collection: { title: 'ניתוח גבייה', color: 'blue' },
  vendor:     { title: 'ניתוח ספקים', color: 'emerald' },
  budget:     { title: 'ניתוח תקציב', color: 'purple' },
  compliance: { title: 'ניתוח רגולציה', color: 'amber' },
}

function sevClass(item) {
  if (item?.severity === 'high' || item?.urgency === 'high') return 'text-[var(--danger)]'
  if (item?.severity === 'medium' || item?.urgency === 'medium') return 'text-[var(--warning)]'
  return 'text-[var(--primary)]'
}

function AiInsightsPanel({ agentType, ai, onAsk, buildingName }) {
  const label = AGENT_LABELS[agentType] || { title: 'ניתוח AI', color: 'blue' }

  return (
    <SectionCard
      icon={Sparkles}
      title={`${label.title} — Claude AI`}
      subtitle="עוזר AI • ניתוח מעמיק של נתוני הבניין"
      tone="primary"
      actions={
        <Button size="sm" onClick={onAsk} disabled={ai?.loading}>
          {ai?.loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />מנתח...</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" />{ai?.result ? 'נתח שוב' : 'שאל את Claude'}</>
          )}
        </Button>
      }
      bodyClassName="p-4 space-y-3 bg-[var(--bg)]"
    >
      {/* Empty state */}
      {!ai && (
        <div className="flex flex-col items-center text-center py-6">
          <span className="p-2.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] mb-2">
            <Bot className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="text-[13px] text-[var(--text-secondary)] max-w-[260px]">
            לחץ "שאל את Claude" לניתוח AI מעמיק של הנתונים
          </p>
        </div>
      )}

      {ai && (
        <>
          {/* Request bubble */}
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[var(--radius-lg)] rounded-tr-sm bg-[var(--primary)] text-white px-3.5 py-2 text-[13px] shadow-[var(--shadow)]">
              נתח את נתוני ה{label.title.replace('ניתוח ', '')} של {buildingName}
            </div>
          </div>

          {/* Answer bubble */}
          <div className="flex justify-end">
            <div className="flex items-start gap-2 max-w-full w-full">
              <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0">
                <Bot className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="flex-1 min-w-0 rounded-[var(--radius-lg)] rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow)] space-y-4">
                {/* Error */}
                {ai.error && (
                  <Callout tone="danger" icon={XCircle}>{ai.error}</Callout>
                )}

                {/* Loading skeleton */}
                {ai.loading && (
                  <div className="space-y-2.5 animate-pulse">
                    <div className="h-3.5 bg-[var(--surface-container)] rounded w-3/4" />
                    <div className="h-3.5 bg-[var(--surface-container)] rounded w-full" />
                    <div className="h-3.5 bg-[var(--surface-container)] rounded w-2/3" />
                  </div>
                )}

                {/* Result */}
                {ai.result && !ai.loading && (
                  <>
                    {ai.result.summary && (
                      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed border-r-[3px] border-[var(--primary)] pr-3">
                        {ai.result.summary}
                      </p>
                    )}

                    {(ai.result.insights || ai.result.alerts || ai.result.critical_gaps || ai.result.gaps) && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">
                          {ai.result.alerts ? 'התראות' : ai.result.critical_gaps ? 'פערים קריטיים' : 'תובנות'}
                        </p>
                        <ul className="space-y-2">
                          {(ai.result.insights || ai.result.alerts || ai.result.critical_gaps || ai.result.gaps || []).map((item, i) => (
                            <li key={i} className="flex gap-2 text-[13px] text-[var(--text-primary)]">
                              <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', sevClass(item))} />
                              <span>{typeof item === 'string' ? item : (item.description || item.title || item.reason || JSON.stringify(item))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(ai.result.savings_opportunities || ai.result.best_practices || ai.result.vendor_recommendations) && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2">המלצות</p>
                        <ul className="space-y-2">
                          {(ai.result.savings_opportunities || ai.result.best_practices || ai.result.vendor_recommendations || []).map((item, i) => (
                            <li key={i} className="flex gap-2 text-[13px] text-[var(--text-primary)]">
                              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--success)]" />
                              <span>{typeof item === 'string' ? item : (item.description || item.how || item.why || item.benefit || item.category || JSON.stringify(item))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(ai.result.forecast || ai.result.legal_tip || ai.result.market_insights || ai.result.reserve_fund_recommendation) && (
                      <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[13px] text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {ai.result.legal_tip ? 'טיפ משפטי: ' :
                           ai.result.market_insights ? 'תובנת שוק: ' :
                           ai.result.reserve_fund_recommendation ? 'קרן רזרבה: ' : 'תחזית: '}
                        </span>
                        {ai.result.forecast || ai.result.legal_tip || ai.result.market_insights || ai.result.reserve_fund_recommendation}
                      </div>
                    )}

                    {ai.result.recommended_message && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">הודעה מומלצת לחייבים</p>
                        <pre className="text-[13px] whitespace-pre-wrap bg-[var(--surface-secondary)] p-3 rounded-[var(--radius)] border border-[var(--border-light)] text-[var(--text-primary)] font-sans">
                          {ai.result.recommended_message}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => navigator.clipboard.writeText(ai.result.recommended_message)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          העתק הודעה
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// CollectionAgentPanel
// ---------------------------------------------------------------------------

function CollectionAgentPanel({ analysis, nameOf, onShowMessage, onMarkOverdue, onCreateAnnouncement, notificationsEnabled }) {
  if (!analysis) return <NoBuilding />

  const { debtors, collectionRate, thisMonthTotal, thisMonthPaid } = analysis
  const msgTitle = !notificationsEnabled ? 'הפעל התראות גבייה כדי לשלוח הודעות' : undefined

  return (
    <div className="space-y-4">
      {!notificationsEnabled && (
        <Callout tone="warning" icon={BellOff} title="שליחת התראות גבייה כבויה.">
          עבור למסך <em>מעקב גבייה</em> כדי להפעיל את המתג ולאפשר שליחת הודעות.
        </Callout>
      )}

      <SectionCard
        icon={CreditCard}
        title="רשימת חייבים"
        subtitle={`ב-3 חודשים אחרונים • ${thisMonthPaid} מתוך ${thisMonthTotal} שילמו החודש (${collectionRate}%)`}
        actions={debtors.length > 0 && (
          <Button size="sm" variant="outline" onClick={onCreateAnnouncement} disabled={!notificationsEnabled} title={msgTitle}>
            {notificationsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            צור הודעה לכולם
          </Button>
        )}
        footer={debtors.length > 0 ? `${debtors.length} חייבים` : undefined}
      >
        <div className="px-4 pt-3"><Bar value={collectionRate} tone={rateTone(collectionRate)} /></div>
        {debtors.length === 0 ? (
          <EmptyState icon={CheckCircle} title="כל הדיירים שילמו בזמן!" description="אין חובות פתוחים ב-3 החודשים האחרונים." />
        ) : (
          <>
            {/* Desktop ledger */}
            <div className="hidden md:block overflow-x-auto mt-3 border-t border-[var(--border)]">
              <table className="ds-table">
                <thead>
                  <tr><th>דירה</th><th>חודשים פתוחים</th><th className="!text-left">חוב כולל</th><th></th></tr>
                </thead>
                <tbody>
                  {debtors.map((debtor, idx) => {
                    const name = nameOf(debtor.unit)
                    return (
                      <tr key={idx}>
                        <td className="whitespace-nowrap">
                          <span className="text-[13px] font-semibold num-tabular">דירה {debtor.unit.number}</span>
                          {name && <span className="block text-[11px] text-[var(--text-muted)]">{name}</span>}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {debtor.months.map(m => <Badge key={m} variant="danger" className="num-tabular">{m}</Badge>)}
                          </div>
                          <span className="block text-[11px] text-[var(--text-muted)] mt-1 num-tabular">
                            {debtor.unpaidCount} חודשים{debtor.oldestUnpaid && ` · חוב ישן מ: ${debtor.oldestUnpaid}`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap !text-left">
                          <span className="text-[14px] font-bold text-[var(--danger)] num-tabular">{formatCurrency(debtor.totalDebt)}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex gap-1.5 justify-end">
                            <Button size="sm" variant="outline" onClick={() => onShowMessage(debtor)} disabled={!notificationsEnabled} title={msgTitle}>
                              {notificationsEnabled ? <MessageSquare className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                              {notificationsEnabled ? 'צפה בהודעה' : 'התראות כבויות'}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => onMarkOverdue(debtor)}>
                              <AlertTriangle className="h-3.5 w-3.5" />
                              סמן כבאיחור
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-3 space-y-2">
              {debtors.map((debtor, idx) => {
                const name = nameOf(debtor.unit)
                return (
                  <div key={idx} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold num-tabular">דירה {debtor.unit.number}</p>
                        {name && <p className="text-[11px] text-[var(--text-muted)] truncate">{name}</p>}
                      </div>
                      <span className="text-[14px] font-bold text-[var(--danger)] num-tabular">{formatCurrency(debtor.totalDebt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {debtor.months.map(m => <Badge key={m} variant="danger" className="num-tabular">{m}</Badge>)}
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => onShowMessage(debtor)} disabled={!notificationsEnabled} title={msgTitle}>
                        {notificationsEnabled ? <MessageSquare className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                        {notificationsEnabled ? 'צפה בהודעה' : 'התראות כבויות'}
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => onMarkOverdue(debtor)}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        סמן כבאיחור
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VendorAgentPanel
// ---------------------------------------------------------------------------

function VendorAgentPanel({ analysis, onAddVendor }) {
  if (!analysis) return <NoBuilding />

  const { issueCategoriesWithoutVendor, expiringInsurance, suggestions, blacklistedAssigned } = analysis

  return (
    <div className="space-y-4">
      {blacklistedAssigned.length > 0 && (
        <Callout tone="danger" icon={UserX} title="ספקים בלתי רצויים מוקצים לתקלות פתוחות">
          <ul className="space-y-0.5">
            {blacklistedAssigned.map(v => <li key={v.id}>• {v.name}</li>)}
          </ul>
        </Callout>
      )}

      {expiringInsurance.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} title="ביטוח ספקים פג תוקף בקרוב (60 ימים)">
          <ul className="space-y-0.5">
            {expiringInsurance.map(v => (
              <li key={v.id} className="num-tabular">• {v.name} — תפוגה: {formatDate(v.insurance_expiry)}</li>
            ))}
          </ul>
        </Callout>
      )}

      {issueCategoriesWithoutVendor.length > 0 && (
        <Callout tone="info" icon={AlertTriangle} title="קטגוריות תקלות ללא ספק מוקצה">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {issueCategoriesWithoutVendor.map(cat => <Badge key={cat} variant="info">{cat}</Badge>)}
          </div>
        </Callout>
      )}

      <SectionCard
        icon={Store}
        title="ספקים מומלצים מהשוק"
        subtitle={`${suggestions.length} ספקים שעדיין אינם ברשימה שלך`}
      >
        {suggestions.length === 0 ? (
          <EmptyState icon={CheckCircle} title="כל הספקים מהשוק כבר ברשימה שלך!" />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>ספק</th><th>תחום</th><th>אזור</th><th>דירוג</th><th>טלפון</th><th></th></tr>
                </thead>
                <tbody>
                  {suggestions.map((vendor, idx) => (
                    <tr key={idx}>
                      <td className="min-w-[200px]">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold">{vendor.name}</span>
                          {vendor.available_24_7 && <Badge variant="success">24/7</Badge>}
                        </span>
                        <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{vendor.description}</span>
                      </td>
                      <td className="whitespace-nowrap"><Badge>{vendor.category}</Badge></td>
                      <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)]">{vendor.area}</td>
                      <td className="whitespace-nowrap text-[12px]">
                        <span className="text-[var(--warning)]">{'★'.repeat(Math.round(vendor.rating))}</span>
                        <span className="text-[var(--text-muted)] num-tabular"> ({vendor.rating})</span>
                      </td>
                      <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)] num-tabular" dir="ltr">{vendor.phone}</td>
                      <td className="whitespace-nowrap">
                        <Button size="sm" variant="soft" onClick={() => onAddVendor(vendor)}>
                          <Plus className="h-3.5 w-3.5" />
                          הוסף
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden p-3 space-y-2">
              {suggestions.map((vendor, idx) => (
                <div key={idx} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold flex items-center gap-1.5">
                        {vendor.name}
                        {vendor.available_24_7 && <Badge variant="success">24/7</Badge>}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">{vendor.description}</p>
                    </div>
                    <Button size="sm" variant="soft" onClick={() => onAddVendor(vendor)}>
                      <Plus className="h-3.5 w-3.5" />
                      הוסף
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-[var(--text-secondary)]">
                    <Badge>{vendor.category}</Badge>
                    <span>אזור: {vendor.area}</span>
                    <span className="text-[var(--warning)]">{'★'.repeat(Math.round(vendor.rating))}</span>
                    <span dir="ltr" className="num-tabular">{vendor.phone}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BudgetAgentPanel
// ---------------------------------------------------------------------------

const HEBREW_MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function monthLabel(monthStr) {
  const [, m] = monthStr.split('-')
  return HEBREW_MONTH_NAMES[parseInt(m, 10) - 1] || monthStr
}

function BudgetAgentPanel({ analysis, onCreateAlert, onExportReport }) {
  if (!analysis) return <NoBuilding />

  const {
    annualExpected, totalExpensesYTD, monthlyBudget,
    monthlyData, byCategory, overrunMonths, projectedAnnual, projectedGap,
    ytdIncome,
  } = analysis

  const projectedSurplus = projectedGap >= 0
  const maxCategoryValue = Math.max(...Object.values(byCategory), 1)

  return (
    <div className="space-y-4">
      {/* Projected year-end */}
      <Callout
        tone={projectedSurplus ? 'success' : 'danger'}
        icon={projectedSurplus ? TrendingUp : TrendingDown}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="font-semibold num-tabular">
              תחזית סוף שנה: {projectedSurplus ? 'עודף' : 'גירעון'} של {formatCurrency(Math.abs(projectedGap))}
            </p>
            <p className="text-[12px] text-[var(--text-secondary)] num-tabular">
              תקציב חודשי: {formatCurrency(monthlyBudget)} · הוצאה חודשית ממוצעת: {formatCurrency(projectedAnnual / 12)} · תקציב שנתי: {formatCurrency(annualExpected)}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onExportReport} className="shrink-0">
            <FileText className="h-3.5 w-3.5" />
            יצא דוח
          </Button>
        </div>
      </Callout>

      {/* Overrun months */}
      {overrunMonths.length > 0 && (
        <SectionCard icon={AlertTriangle} title="חודשים בחריגת תקציב" subtitle={`${overrunMonths.length} חודשים מעל התקציב החודשי`}>
          <div className="divide-y divide-[var(--border-light)]">
            {overrunMonths.map((m, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{monthLabel(m.month)}</p>
                  <p className="text-[11px] text-[var(--text-muted)] num-tabular">
                    הוצאות: {formatCurrency(m.expenses)} · הכנסות: {formatCurrency(m.income)}
                  </p>
                </div>
                <div className="text-left">
                  <span className="text-[13px] font-bold text-[var(--danger)] num-tabular">{formatCurrency(m.expenses - monthlyBudget)}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">חריגה</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => onCreateAlert(m)}>
                  <Bell className="h-3.5 w-3.5" />
                  צור התראה
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Monthly ledger */}
      <SectionCard
        icon={PiggyBank}
        title="פירוט חודשי"
        subtitle={`שנת ${new Date().getFullYear()} עד היום`}
        footer={<span className="num-tabular">הכנסות מצטברות {formatCurrency(ytdIncome)} · הוצאות מצטברות {formatCurrency(totalExpensesYTD)}</span>}
      >
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[480px]">
            <thead>
              <tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>מאזן</th><th>סטטוס</th></tr>
            </thead>
            <tbody>
              {monthlyData.map((m, idx) => (
                <tr key={idx}>
                  <td className="font-semibold">{monthLabel(m.month)}</td>
                  <td className="text-[var(--success)] num-tabular">{formatCurrency(m.income)}</td>
                  <td className="text-[var(--danger)] num-tabular">{formatCurrency(m.expenses)}</td>
                  <td className={cn('font-semibold num-tabular', m.net >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
                    {formatCurrency(m.net)}
                  </td>
                  <td>
                    {m.overBudget ? <Badge variant="danger">חריגה</Badge> : <Badge variant="success">תקין</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <SectionCard icon={Wallet} title="הוצאות לפי קטגוריה" bodyClassName="p-4 space-y-3">
          {Object.entries(byCategory)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, val]) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1 text-[12px]">
                  <span className="font-medium text-[var(--text-primary)]">{cat}</span>
                  <span className="font-semibold text-[var(--text-primary)] num-tabular">{formatCurrency(val)}</span>
                </div>
                <Bar value={(val / maxCategoryValue) * 100} />
              </div>
            ))}
        </SectionCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ComplianceAgentPanel
// ---------------------------------------------------------------------------

function ComplianceAgentPanel({ analysis, onAddTask, onAddCompliance }) {
  const [showCovered, setShowCovered] = useState(false)

  if (!analysis) return <NoBuilding />

  const { missing, covered, coverageRate, expired, overdue } = analysis

  function priorityBadgeVariant(priority) {
    if (priority === 'high') return 'danger'
    if (priority === 'medium') return 'warning'
    return 'success'
  }

  function priorityLabel(priority) {
    if (priority === 'high') return 'גבוהה'
    if (priority === 'medium') return 'בינונית'
    return 'נמוכה'
  }

  return (
    <div className="space-y-4">
      {/* Coverage score */}
      <SectionCard icon={ShieldCheck} title="כיסוי רגולטורי" subtitle="דרישות חוק ופרקטיקה לפי מאפייני הבניין" bodyClassName="p-4">
        <div className="flex items-center gap-4">
          <span className="text-[30px] leading-9 font-bold tracking-[-0.02em] text-[var(--text-primary)] num-tabular">{coverageRate}%</span>
          <div className="flex-1 space-y-2">
            <Bar value={coverageRate} tone={rateTone(coverageRate, 80, 50)} />
            <div className="flex items-center gap-3 text-[12px] text-[var(--text-secondary)] num-tabular">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--success)]" />{covered.length} מכוסות</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--danger)]" />{missing.length} חסרות</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Expired and overdue alerts */}
      {(expired.length > 0 || overdue.length > 0) && (
        <Callout tone="danger" icon={XCircle}>
          <div className="space-y-2">
            {expired.length > 0 && (
              <div>
                <p className="font-semibold mb-0.5">רגולציה שפגה תוקפה ({expired.length})</p>
                <ul className="space-y-0.5 num-tabular">
                  {expired.map(c => <li key={c.id}>• {c.title} — פג: {formatDate(c.expiry_date)}</li>)}
                </ul>
              </div>
            )}
            {overdue.length > 0 && (
              <div>
                <p className="font-semibold mb-0.5">משימות שעבר מועדן ({overdue.length})</p>
                <ul className="space-y-0.5 num-tabular">
                  {overdue.map(t => <li key={t.id}>• {t.title} — היה ב: {formatDate(t.next_due_date)}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Callout>
      )}

      {/* Missing requirements */}
      {missing.length > 0 && (
        <SectionCard icon={AlertTriangle} title="דרישות חסרות" subtitle={`${missing.length} דרישות ללא משימה או רשומת רגולציה`}>
          <div className="divide-y divide-[var(--border-light)]">
            {missing.map((req, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{req.title}</span>
                    <Badge variant={priorityBadgeVariant(req.priority)}>{priorityLabel(req.priority)}</Badge>
                    <Badge variant="neutral">{req.category}</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">{req.law} · {frequencyLabel(req.frequency)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => req.type === 'task' ? onAddTask(req) : onAddCompliance(req)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {req.type === 'task' ? 'הוסף כמשימה' : 'הוסף לרגולציה'}
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Covered requirements (collapsible) */}
      {covered.length > 0 && (
        <SectionCard
          icon={CheckCircle}
          title={`דרישות מכוסות (${covered.length})`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setShowCovered(v => !v)}>
              {showCovered ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showCovered ? 'הסתר' : 'הצג'}
            </Button>
          }
        >
          {showCovered && (
            <div className="divide-y divide-[var(--border-light)]">
              {covered.map((req, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                  <CheckCircle className="h-4 w-4 text-[var(--success)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">{req.title}</span>
                    <span className="block text-[11px] text-[var(--text-muted)]">{req.law}</span>
                  </div>
                  <Badge variant="success">{req.category}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SmartAgents page
// ---------------------------------------------------------------------------

export default function SmartAgents() {
  const { selectedBuilding } = useBuildingContext()

  // Read the notifications toggle from the building record (set by CollectionCases page)
  const notificationsEnabled = selectedBuilding?.collection_notifications_enabled === true

  // Building-scoped SERVER-SIDE (vendors stays global); unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: allPayments, isLoading } = useCollection('payments', scope)
  const { data: allUnits } = useCollection('units', scope)
  const { data: allExpenses } = useCollection('expenses', scope)
  const { data: allCompliance } = useCollection('compliance', scope)
  const { data: allTasks } = useCollection('recurringTasks', scope)
  const { data: allVendors, create: createVendor } = useCollection('vendors')
  const { data: allIssues } = useCollection('issues', scope)
  const { create: createAnnouncement } = useCollection('announcements', scope)
  const { create: createRecurringTask } = useCollection('recurringTasks', scope)
  const { create: createCompliance } = useCollection('compliance', scope)
  const { update: updatePayment } = useCollection('payments', scope)

  // Resident names live in unit_residents (units has no owner_name column).
  const directory = useUnitDirectory(selectedBuilding?.id)
  // Family name from the resident directory. units has no name column.
  const nameOf = (unit) => directory.byId?.[unit.id]?.name || ''

  const [activeAgent, setActiveAgent] = useState(null)
  const [messageDialog, setMessageDialog] = useState({ open: false, title: '', content: '' })

  // AI state: per agent { loading, result, error }
  const [aiState, setAiState] = useState({})

  const askClaude = useCallback(async (agentType, contextData) => {
    setAiState(prev => ({ ...prev, [agentType]: { loading: true, result: null, error: null } }))
    try {
      // Always pass notificationsEnabled so Edge Function can gate email sending
      const result = await callVaadAgent(agentType, selectedBuilding?.name ?? 'הבניין', {
        ...contextData,
        notificationsEnabled,
      })
      setAiState(prev => ({ ...prev, [agentType]: { loading: false, result, error: null } }))
    } catch (err) {
      setAiState(prev => ({ ...prev, [agentType]: { loading: false, result: null, error: err.message } }))
    }
  }, [selectedBuilding, notificationsEnabled])

  // -------------------------------------------------------------------------
  // Agent 1: Collection analysis
  // -------------------------------------------------------------------------
  const collectionAnalysis = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id
    const bUnits = allUnits.filter(u => u.buildingId === bId)

    const months = []
    for (let i = 0; i < 3; i++) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }

    const debtors = []
    bUnits.forEach(unit => {
      const unitPayments = allPayments.filter(p => p.unitId === unit.id && months.includes(p.month))
      const unpaid = unitPayments.filter(p => p.status !== 'paid')
      const totalDebt = unpaid.reduce((s, p) => s + (p.amount || 0), 0)
      if (unpaid.length > 0) {
        debtors.push({
          unit,
          unpaidCount: unpaid.length,
          totalDebt,
          months: unpaid.map(p => p.month),
          payments: unpaid,
          oldestUnpaid: unpaid.sort((a, b) => a.month.localeCompare(b.month))[0]?.month
        })
      }
    })

    const currentMonth = new Date().toISOString().slice(0, 7)
    const thisMonthPayments = allPayments.filter(p => p.buildingId === bId && p.month === currentMonth)
    const paid = thisMonthPayments.filter(p => p.status === 'paid')
    const collectionRate = thisMonthPayments.length > 0 ? Math.round(paid.length / thisMonthPayments.length * 100) : 0
    const totalOutstanding = debtors.reduce((s, d) => s + d.totalDebt, 0)

    return {
      debtors, collectionRate, totalOutstanding,
      thisMonthTotal: thisMonthPayments.length,
      thisMonthPaid: paid.length
    }
  }, [selectedBuilding, allUnits, allPayments])

  // -------------------------------------------------------------------------
  // Agent 2: Vendor analysis
  // -------------------------------------------------------------------------
  const vendorAnalysis = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id

    const openIssues = allIssues.filter(i =>
      i.buildingId === bId && !['resolved', 'closed', 'completed'].includes(i.status)
    )
    const issueCategoriesWithoutVendor = []
    const existingCategories = allVendors.map(v => v.category)

    openIssues.forEach(issue => {
      if (issue.category && !existingCategories.includes(issue.category)) {
        if (!issueCategoriesWithoutVendor.includes(issue.category)) {
          issueCategoriesWithoutVendor.push(issue.category)
        }
      }
    })

    const in60 = new Date()
    in60.setDate(in60.getDate() + 60)
    const expiringInsurance = allVendors.filter(v =>
      v.insurance_expiry &&
      new Date(v.insurance_expiry) <= in60 &&
      new Date(v.insurance_expiry) >= new Date()
    )

    const existingNames = allVendors.map(v => v.name.toLowerCase())
    const suggestions = MARKETPLACE_VENDORS.filter(mv => !existingNames.includes(mv.name.toLowerCase()))

    const blacklistedAssigned = allVendors
      .filter(v => v.is_blacklisted)
      .filter(bv => openIssues.some(i => i.vendor_name === bv.name))

    return { issueCategoriesWithoutVendor, expiringInsurance, suggestions, blacklistedAssigned }
  }, [selectedBuilding, allIssues, allVendors])

  // -------------------------------------------------------------------------
  // Agent 3: Budget analysis
  // -------------------------------------------------------------------------
  const budgetAnalysis = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id

    const bUnits = allUnits.filter(u => u.buildingId === bId)
    const monthlyExpected = bUnits.reduce((s, u) => s + (u.monthlyFee || 0), 0)
    const annualExpected = monthlyExpected * 12

    const currentYear = new Date().getFullYear()
    const bExpenses = allExpenses.filter(e =>
      e.buildingId === bId && e.date?.startsWith(String(currentYear))
    )
    const totalExpensesYTD = bExpenses.reduce((s, e) => s + (e.amount || 0), 0)

    const currentMonth = new Date().getMonth() + 1
    const monthlyBudget = annualExpected / 12

    const monthlyData = []
    for (let m = 1; m <= currentMonth; m++) {
      const monthStr = `${currentYear}-${String(m).padStart(2, '0')}`
      const mExpenses = bExpenses.filter(e => e.date?.startsWith(monthStr))
      const mTotal = mExpenses.reduce((s, e) => s + (e.amount || 0), 0)
      const mPayments = allPayments.filter(p => p.buildingId === bId && p.month === monthStr)
      const mIncome = mPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0)
      monthlyData.push({
        month: monthStr,
        expenses: mTotal,
        income: mIncome,
        net: mIncome - mTotal,
        overBudget: mTotal > monthlyBudget
      })
    }

    const byCategory = {}
    bExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
    })

    const overrunMonths = monthlyData.filter(m => m.overBudget)
    const avgMonthly = currentMonth > 0 ? totalExpensesYTD / currentMonth : 0
    const projectedAnnual = avgMonthly * 12
    const projectedGap = annualExpected - projectedAnnual
    const ytdIncome = monthlyData.reduce((s, m) => s + m.income, 0)
    const ytdNet = ytdIncome - totalExpensesYTD

    return {
      monthlyExpected, annualExpected, totalExpensesYTD, monthlyBudget,
      monthlyData, byCategory, overrunMonths, projectedAnnual, projectedGap,
      ytdIncome, ytdNet, currentMonth
    }
  }, [selectedBuilding, allUnits, allExpenses, allPayments])

  // -------------------------------------------------------------------------
  // Agent 4: Compliance analysis
  // -------------------------------------------------------------------------
  const complianceAnalysis = useMemo(() => {
    if (!selectedBuilding) return null
    const bId = selectedBuilding.id
    const bCompliance = allCompliance.filter(c => c.buildingId === bId)
    const bTasks = allTasks.filter(t => t.buildingId === bId)

    const requirements = getBuildingRequirements(selectedBuilding, bCompliance, bTasks)
    const missing = requirements.filter(r => !r.covered)
    const covered = requirements.filter(r => r.covered)
    const coverageRate = requirements.length > 0 ? Math.round(covered.length / requirements.length * 100) : 0

    const expired = bCompliance.filter(c => c.expiry_date && new Date(c.expiry_date) < new Date())
    const overdue = bTasks.filter(t => t.next_due_date && new Date(t.next_due_date) < new Date())

    return { requirements, missing, covered, coverageRate, expired, overdue }
  }, [selectedBuilding, allCompliance, allTasks])

  // -------------------------------------------------------------------------
  // Helper: generate reminder message
  // -------------------------------------------------------------------------
  function generateReminderMessage(debtor) {
    // Addressed to the household — flat + family name, never a first name.
    const family = nameOf(debtor.unit)
    const who = family ? `משפחת ${family}` : `דיירי דירה ${debtor.unit.number}`
    return `שלום ${who},\n\nאנו פונים אליך בנושא תשלום דמי ועד בית עבור דירה ${debtor.unit.number} בבניין ${selectedBuilding?.name}.\n\nנמצאו ${debtor.unpaidCount} חודשים שטרם שולמו בסכום כולל של ${formatCurrency(debtor.totalDebt)}.\n\nנבקשך להסדיר את התשלום בהקדם האפשרי.\n\nבברכה,\nועד הבית`
  }

  // -------------------------------------------------------------------------
  // Action handlers — Collection
  // -------------------------------------------------------------------------
  function handleShowMessage(debtor) {
    setMessageDialog({
      open: true,
      title: `הודעת תזכורת — דירה ${debtor.unit.number}`,
      content: generateReminderMessage(debtor)
    })
  }

  async function handleMarkOverdue(debtor) {
    try {
      for (const p of debtor.payments) {
        await updatePayment(p.id, { status: 'overdue' })
      }
    } catch (err) {
      console.error('Failed to mark payments as overdue:', err)
      toastError('שגיאה בעדכון סטטוס תשלומים')
    }
  }

  async function handleCreateAnnouncement() {
    if (!collectionAnalysis || collectionAnalysis.debtors.length === 0) return
    const debtorList = collectionAnalysis.debtors
      .map(d => `• דירה ${d.unit.number} — ${formatCurrency(d.totalDebt)}`)
      .join('\n')
    try {
      await createAnnouncement({
        buildingId: selectedBuilding.id,
        type: 'urgent',
        title: 'תזכורת תשלום ועד בית',
        content: `נמצאו דיירים שטרם שילמו את דמי ועד הבית:\n\n${debtorList}\n\nנבקשכם להסדיר את התשלום בהקדם האפשרי.`,
        date: new Date().toISOString().slice(0, 10),
      })
      setMessageDialog({
        open: true,
        title: 'הודעה נוצרה בהצלחה',
        content: `הודעה דחופה נשלחה לכלל הדיירים עם רשימת החייבים:\n\n${debtorList}`
      })
    } catch (err) {
      console.error('Failed to create announcement:', err)
      toastError('שגיאה ביצירת הודעה')
    }
  }

  // -------------------------------------------------------------------------
  // Action handlers — Vendor
  // -------------------------------------------------------------------------
  async function handleAddVendor(vendor) {
    try {
      await createVendor({
        buildingId: selectedBuilding.id,
        name: vendor.name,
        category: vendor.category,
        phone: vendor.phone,
        area: vendor.area,
        rating: vendor.rating,
        description: vendor.description,
        available_24_7: vendor.available_24_7,
      })
      toast('ספק נוסף בהצלחה')
    } catch (err) {
      console.error('Failed to add vendor:', err)
      toastError('שגיאה בהוספת ספק')
    }
  }

  // -------------------------------------------------------------------------
  // Action handlers — Budget
  // -------------------------------------------------------------------------
  function handleCreateBudgetAlert(monthData) {
    createAnnouncement({
      buildingId: selectedBuilding.id,
      type: 'urgent',
      priority: 'high',
      title: `התראת חריגת תקציב — ${monthData.month}`,
      content: `נרשמה חריגת תקציב בחודש ${monthData.month}.\nהוצאות: ${formatCurrency(monthData.expenses)}\nהכנסות: ${formatCurrency(monthData.income)}\nחריגה: ${formatCurrency(monthData.expenses - (budgetAnalysis?.monthlyBudget || 0))}`,
      date: new Date().toISOString().slice(0, 10),
    })
  }

  function handleExportBudgetReport() {
    if (!budgetAnalysis) return
    const lines = [
      `דוח תקציב — ${selectedBuilding?.name}`,
      `תאריך הפקה: ${new Date().toLocaleDateString('he-IL')}`,
      '',
      `תקציב חודשי: ${formatCurrency(budgetAnalysis.monthlyBudget)}`,
      `תקציב שנתי: ${formatCurrency(budgetAnalysis.annualExpected)}`,
      `הוצאות מצטברות: ${formatCurrency(budgetAnalysis.totalExpensesYTD)}`,
      `הכנסות מצטברות: ${formatCurrency(budgetAnalysis.ytdIncome)}`,
      `מאזן נוכחי: ${formatCurrency(budgetAnalysis.ytdNet)}`,
      `תחזית סוף שנה: ${formatCurrency(budgetAnalysis.projectedAnnual)}`,
      `פער תחזיתי: ${formatCurrency(budgetAnalysis.projectedGap)}`,
      '',
      'פירוט קטגוריות:',
      ...Object.entries(budgetAnalysis.byCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, val]) => `  ${cat}: ${formatCurrency(val)}`),
    ]
    setMessageDialog({
      open: true,
      title: 'דוח תקציב',
      content: lines.join('\n')
    })
  }

  // -------------------------------------------------------------------------
  // Action handlers — Compliance
  // -------------------------------------------------------------------------
  function handleAddTask(req) {
    const today = new Date().toISOString().slice(0, 10)
    createRecurringTask({
      buildingId: selectedBuilding.id,
      title: req.title,
      frequency: req.frequency,
      category: req.category,
      is_required_by_law: true,
      next_due_date: today,
      law_reference: req.law,
    })
  }

  function handleAddCompliance(req) {
    createCompliance({
      buildingId: selectedBuilding.id,
      title: req.title,
      type: req.category,
      category: req.category,
      law_reference: req.law,
      frequency: req.frequency,
      priority: req.priority,
    })
  }

  // -------------------------------------------------------------------------
  // Agent definitions
  // -------------------------------------------------------------------------
  const AGENTS = [
    {
      id: 'collection',
      title: 'סוכן גבייה',
      icon: CreditCard,
      description: 'מזהה חייבים, מחשב חובות ומייצר הודעות תזכורת',
    },
    {
      id: 'vendor',
      title: 'סוכן ספקים',
      icon: Store,
      description: 'מנתח פערים בכיסוי ספקים ומציע ספקים חדשים',
    },
    {
      id: 'budget',
      title: 'סוכן תקציב',
      icon: PiggyBank,
      description: 'מנתח הכנסות והוצאות ומתריע על חריגות תקציביות',
    },
    {
      id: 'compliance',
      title: 'סוכן רגולציה ופרקטיקה',
      icon: ShieldCheck,
      description: 'מגדיר מה נדרש לביצוע תקופתי לפי חוק ופרקטיקה',
    },
  ]

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const header = (
    <div className="min-w-0">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">סוכנים חכמים</h1>
      <p className="text-[13px] text-[var(--text-secondary)] mt-1">
        סוכני AI שמנתחים את נתוני הבניין ומייצרים פעולות מומלצות{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
      </p>
    </div>
  )

  if (isLoading) return (
    <div className="space-y-6" dir="rtl">
      {header}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  const AGENT_STATUS = {
    collection: collectionAnalysis ? `${collectionAnalysis.debtors.length} חייבים` : '—',
    vendor: vendorAnalysis ? `${vendorAnalysis.suggestions.length} הצעות ספקים` : '—',
    budget: budgetAnalysis ? `${budgetAnalysis.overrunMonths.length} חודשי חריגה` : '—',
    compliance: complianceAnalysis ? `${complianceAnalysis.missing.length} דרישות חסרות` : '—',
  }
  const activeDef = AGENTS.find(a => a.id === activeAgent)

  const aiPanelProps = {
    collection: { onAsk: () => askClaude('collection', collectionAnalysis) },
    vendor: {
      onAsk: () => askClaude('vendor', {
        vendors: allVendors,
        openIssues: allIssues.filter(i => i.buildingId === selectedBuilding?.id && !['resolved','closed','completed'].includes(i.status)),
        issueCategoriesWithoutVendor: vendorAnalysis?.issueCategoriesWithoutVendor,
        expiringInsurance: vendorAnalysis?.expiringInsurance,
      }),
    },
    budget: { onAsk: () => askClaude('budget', budgetAnalysis) },
    compliance: {
      onAsk: () => askClaude('compliance', {
        building: selectedBuilding,
        missingRequirements: complianceAnalysis?.missing,
        expired: complianceAnalysis?.expired,
        overdueTasks: complianceAnalysis?.overdue,
        coverageRate: complianceAnalysis?.coverageRate,
      }),
    },
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        {header}
        {activeAgent && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setActiveAgent(null)}>סגור סוכן</Button>
            <Button onClick={aiPanelProps[activeAgent].onAsk} disabled={aiState[activeAgent]?.loading}>
              {aiState[activeAgent]?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              שאל את Claude
            </Button>
          </div>
        )}
      </div>

      {/* No building selected warning */}
      {!selectedBuilding && (
        <Callout tone="warning" icon={AlertTriangle}>
          לא נבחר בניין. בחר בניין מהתפריט הראשי כדי להפעיל את הסוכנים.
        </Callout>
      )}

      {/* KPI row — derived from the analyses the page already computes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="אחוז גבייה החודש" icon={CreditCard} color="blue"
          value={collectionAnalysis ? `${collectionAnalysis.collectionRate}%` : '—'}
          sub={collectionAnalysis ? `${collectionAnalysis.thisMonthPaid} מתוך ${collectionAnalysis.thisMonthTotal} שילמו` : 'לא נבחר בניין'}
          progress={collectionAnalysis ? collectionAnalysis.collectionRate : undefined}
        />
        <StatCard
          label="חוב פתוח (3 חודשים)" icon={Wallet}
          color={collectionAnalysis?.totalOutstanding > 0 ? 'red' : 'emerald'}
          value={collectionAnalysis ? formatCurrency(collectionAnalysis.totalOutstanding) : '—'}
          sub={collectionAnalysis ? `${collectionAnalysis.debtors.length} חייבים פעילים` : undefined}
        />
        <StatCard
          label="מאזן מתחילת השנה" icon={PiggyBank}
          color={budgetAnalysis && budgetAnalysis.ytdNet < 0 ? 'red' : 'emerald'}
          value={budgetAnalysis ? formatCurrency(budgetAnalysis.ytdNet) : '—'}
          sub={budgetAnalysis ? `הכנסות ${formatCurrency(budgetAnalysis.ytdIncome)} · הוצאות ${formatCurrency(budgetAnalysis.totalExpensesYTD)}` : undefined}
        />
        <StatCard
          label="כיסוי רגולטורי" icon={ShieldCheck}
          color={complianceAnalysis && complianceAnalysis.coverageRate < 50 ? 'amber' : 'purple'}
          value={complianceAnalysis ? `${complianceAnalysis.coverageRate}%` : '—'}
          sub={complianceAnalysis ? `${complianceAnalysis.missing.length} דרישות חסרות` : undefined}
          progress={complianceAnalysis ? complianceAnalysis.coverageRate : undefined}
        />
      </div>

      {/* Agent selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {AGENTS.map(agent => {
          const isActive = activeAgent === agent.id
          return (
            <div
              key={agent.id}
              className={cn(
                'rounded-[var(--radius)] border bg-[var(--surface)] shadow-[var(--shadow)] p-4 cursor-pointer transition-colors flex flex-col',
                isActive ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30' : 'border-[var(--border)] hover:border-[var(--outline-variant)]'
              )}
              onClick={() => setActiveAgent(isActive ? null : agent.id)}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className={cn('p-1.5 rounded-[var(--radius)] shrink-0', isActive ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-secondary)] text-[var(--primary)]')}>
                  <agent.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{agent.title}</h3>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed flex-1">{agent.description}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--success-light)] text-[var(--success)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                    פעיל
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)] num-tabular">{AGENT_STATUS[agent.id]}</span>
                )}
                <Button
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveAgent(isActive ? null : agent.id)
                  }}
                >
                  {isActive ? <><CheckCircle className="h-3.5 w-3.5" />פעיל</> : <><Play className="h-3.5 w-3.5" />הפעל</>}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Active agent workspace */}
      {!activeDef ? (
        <SectionCard>
          <EmptyState icon={Bot} title="בחר סוכן להפעלה" description="כל סוכן מנתח תחום אחר בבניין ומציע פעולות. ניתן גם לבקש ניתוח מעמיק מ-Claude." />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 space-y-4 min-w-0">
            {activeAgent === 'collection' && (
              <CollectionAgentPanel
                analysis={collectionAnalysis}
                nameOf={nameOf}
                onShowMessage={handleShowMessage}
                onMarkOverdue={handleMarkOverdue}
                onCreateAnnouncement={handleCreateAnnouncement}
                notificationsEnabled={notificationsEnabled}
              />
            )}
            {activeAgent === 'vendor' && (
              <VendorAgentPanel analysis={vendorAnalysis} onAddVendor={handleAddVendor} />
            )}
            {activeAgent === 'budget' && (
              <BudgetAgentPanel
                analysis={budgetAnalysis}
                onCreateAlert={handleCreateBudgetAlert}
                onExportReport={handleExportBudgetReport}
              />
            )}
            {activeAgent === 'compliance' && (
              <ComplianceAgentPanel
                analysis={complianceAnalysis}
                onAddTask={handleAddTask}
                onAddCompliance={handleAddCompliance}
              />
            )}
          </div>
          <aside className="xl:col-span-4 xl:sticky xl:top-20 min-w-0">
            <AiInsightsPanel
              agentType={activeAgent}
              ai={aiState[activeAgent]}
              onAsk={aiPanelProps[activeAgent].onAsk}
              buildingName={selectedBuilding?.name ?? 'הבניין'}
            />
          </aside>
        </div>
      )}

      {/* Message / export dialog */}
      <Dialog
        open={messageDialog.open}
        onOpenChange={(o) => !o && setMessageDialog(p => ({ ...p, open: false }))}
      >
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>{messageDialog.title}</DialogTitle>
          </DialogHeader>
          <pre className="text-[13px] whitespace-pre-wrap bg-[var(--surface-secondary)] p-4 rounded-[var(--radius)] border border-[var(--border)] text-[var(--text-primary)] font-sans max-h-80 overflow-y-auto">
            {messageDialog.content}
          </pre>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigator.clipboard?.writeText(messageDialog.content)}
          >
            <Copy className="h-4 w-4" />
            העתק טקסט
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
