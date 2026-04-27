import { useState, useMemo, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/utils'
import { callVaadAgent } from '@/lib/vaadAgent'
import { PageHeader } from '@/components/common/PageHeader'
import {
  CreditCard, Store, PiggyBank, ShieldCheck,
  Play, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Zap,
  MessageSquare, UserX, TrendingUp, TrendingDown,
  Plus, Bell, Sparkles, Loader2
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
  const requirements = []
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
// AiInsightsPanel — Claude AI response panel (shared by all agents)
// ---------------------------------------------------------------------------

const AGENT_LABELS = {
  collection: { title: 'ניתוח גבייה', color: 'blue' },
  vendor:     { title: 'ניתוח ספקים', color: 'emerald' },
  budget:     { title: 'ניתוח תקציב', color: 'purple' },
  compliance: { title: 'ניתוח רגולציה', color: 'amber' },
}

function AiInsightsPanel({ agentType, ai, onAsk }) {
  const label = AGENT_LABELS[agentType] || { title: 'ניתוח AI', color: 'blue' }

  return (
    <Card className="border-2 border-[var(--primary)]/20 bg-gradient-to-l from-[var(--primary)]/5 to-transparent">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" />
            <span className="font-semibold text-[var(--text-primary)]">
              {label.title} — Claude AI
            </span>
          </div>
          <Button
            size="sm"
            onClick={onAsk}
            disabled={ai?.loading}
            className="gap-2"
          >
            {ai?.loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />מנתח...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />{ai?.result ? 'נתח שוב' : 'שאל את Claude'}</>
            )}
          </Button>
        </div>

        {/* Error */}
        {ai?.error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{ai.error}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {ai?.loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-[var(--border)] rounded w-3/4" />
            <div className="h-4 bg-[var(--border)] rounded w-full" />
            <div className="h-4 bg-[var(--border)] rounded w-2/3" />
          </div>
        )}

        {/* Result */}
        {ai?.result && !ai.loading && (
          <div className="space-y-4">
            {/* Summary */}
            {ai.result.summary && (
              <p className="text-sm text-[var(--text-primary)] leading-relaxed border-r-4 border-[var(--primary)] pr-3">
                {ai.result.summary}
              </p>
            )}

            {/* Insights / Alerts / Critical gaps */}
            {(ai.result.insights || ai.result.alerts || ai.result.critical_gaps || ai.result.gaps) && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
                  {ai.result.alerts ? 'התראות' : ai.result.critical_gaps ? 'פערים קריטיים' : 'תובנות'}
                </p>
                <ul className="space-y-2">
                  {(ai.result.insights || ai.result.alerts || ai.result.critical_gaps || ai.result.gaps || []).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-primary)]">
                      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
                        item.severity === 'high' || item.urgency === 'high' ? 'text-red-500' :
                        item.severity === 'medium' || item.urgency === 'medium' ? 'text-amber-500' : 'text-blue-500'
                      }`} />
                      <span>{typeof item === 'string' ? item : (item.description || item.title || item.reason || JSON.stringify(item))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations / savings / best_practices */}
            {(ai.result.savings_opportunities || ai.result.best_practices || ai.result.vendor_recommendations) && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">המלצות</p>
                <ul className="space-y-2">
                  {(ai.result.savings_opportunities || ai.result.best_practices || ai.result.vendor_recommendations || []).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-primary)]">
                      <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-green-500" />
                      <span>{typeof item === 'string' ? item : (item.description || item.how || item.why || item.benefit || item.category || JSON.stringify(item))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Forecast / legal tip */}
            {(ai.result.forecast || ai.result.legal_tip || ai.result.market_insights || ai.result.reserve_fund_recommendation) && (
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {ai.result.legal_tip ? '⚖️ טיפ משפטי: ' :
                   ai.result.market_insights ? '📊 תובנת שוק: ' :
                   ai.result.reserve_fund_recommendation ? '🏦 קרן רזרבה: ' : '📈 תחזית: '}
                </span>
                {ai.result.forecast || ai.result.legal_tip || ai.result.market_insights || ai.result.reserve_fund_recommendation}
              </div>
            )}

            {/* Recommended message */}
            {ai.result.recommended_message && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wide">הודעה מומלצת לחייבים</p>
                <pre className="text-sm whitespace-pre-wrap bg-[var(--surface)] p-3 rounded-lg border border-[var(--border)] text-[var(--text-primary)] font-sans">
                  {ai.result.recommended_message}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => navigator.clipboard.writeText(ai.result.recommended_message)}
                >
                  העתק הודעה
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!ai && (
          <p className="text-sm text-[var(--text-secondary)] text-center py-4">
            לחץ "שאל את Claude" לניתוח AI מעמיק של הנתונים
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CollectionAgentPanel
// ---------------------------------------------------------------------------

function CollectionAgentPanel({ analysis, onShowMessage, onMarkOverdue, onCreateAnnouncement }) {
  if (!analysis) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-[var(--text-secondary)]">
          לא נבחר בניין. בחר בניין מהתפריט הראשי.
        </CardContent>
      </Card>
    )
  }

  const { debtors, collectionRate, totalOutstanding, thisMonthTotal, thisMonthPaid } = analysis

  const rateColor = collectionRate >= 80 ? '#22c55e' : collectionRate >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative rounded-xl border bg-white overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-600" />
          <div className="p-4">
            <p className="text-xs text-[var(--text-secondary)] mb-1">אחוז גבייה חודש נוכחי</p>
            <p className="text-2xl font-bold mb-2" style={{ color: rateColor }}>{collectionRate}%</p>
            <Progress value={collectionRate} color={rateColor} />
            <p className="text-xs text-[var(--text-secondary)] mt-1">{thisMonthPaid} מתוך {thisMonthTotal} שילמו</p>
          </div>
        </div>
        <div className="relative rounded-xl border bg-white overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-red-500 to-red-600" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">חייבים פעילים</p>
            </div>
            <p className="text-2xl font-bold text-red-500">{debtors.length}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">ב-3 חודשים אחרונים</p>
          </div>
        </div>
        <div className="relative rounded-xl border bg-white overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-red-500" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">סה"כ חוב פתוח</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">לגבייה</p>
          </div>
        </div>
      </div>

      {/* Actions bar */}
      {debtors.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onCreateAnnouncement}
            className="gap-1.5"
          >
            <Bell className="h-3.5 w-3.5" />
            צור הודעה לכולם
          </Button>
        </div>
      )}

      {/* Debtors list */}
      {debtors.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="text-[var(--text-primary)] font-medium">כל הדיירים שילמו בזמן!</p>
            <p className="text-sm text-[var(--text-secondary)]">אין חובות פתוחים ב-3 חודשים האחרונים.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">רשימת חייבים</h3>
          {debtors.map((debtor, idx) => (
            <div
              key={idx}
              className="group flex items-center gap-4 p-4 rounded-xl border border-red-100 bg-white hover:shadow-md hover:border-red-200 transition-all"
            >
              {/* Unit number circle */}
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                {debtor.unit.number}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                    דירה {debtor.unit.number}
                  </span>
                  {(debtor.unit.ownerName || debtor.unit.tenant_name) && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {debtor.unit.ownerName || debtor.unit.tenant_name}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {debtor.months.map(m => (
                    <Badge key={m} variant="danger" className="text-xs">{m}</Badge>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {debtor.unpaidCount} חודשים שלא שולמו
                  {debtor.oldestUnpaid && <span> · חוב ישן מ: {debtor.oldestUnpaid}</span>}
                </p>
              </div>

              {/* Debt amount */}
              <div className="text-left min-w-[90px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                  <span className="text-[15px] font-bold text-red-600">{formatCurrency(debtor.totalDebt)}</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">חוב כולל</span>
              </div>

              {/* Actions (visible on hover) */}
              <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onShowMessage(debtor)}
                  className="gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  צפה בהודעה
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onMarkOverdue(debtor)}
                  className="gap-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  סמן כבאיחור
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VendorAgentPanel
// ---------------------------------------------------------------------------

function VendorAgentPanel({ analysis, onAddVendor }) {
  if (!analysis) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-[var(--text-secondary)]">
          לא נבחר בניין. בחר בניין מהתפריט הראשי.
        </CardContent>
      </Card>
    )
  }

  const { issueCategoriesWithoutVendor, expiringInsurance, suggestions, blacklistedAssigned } = analysis

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {blacklistedAssigned.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <UserX className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700 text-sm mb-1">ספקים בלתי רצויים מוקצים לתקלות פתוחות</p>
                <ul className="text-sm text-red-600 space-y-0.5">
                  {blacklistedAssigned.map(v => (
                    <li key={v.id}>• {v.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expiringInsurance.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-700 text-sm mb-1">ביטוח ספקים פג תוקף בקרוב (60 ימים)</p>
                <ul className="text-sm text-amber-700 space-y-0.5">
                  {expiringInsurance.map(v => (
                    <li key={v.id}>
                      • {v.name} — תפוגה: {formatDate(v.insurance_expiry)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {issueCategoriesWithoutVendor.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-700 text-sm mb-1">קטגוריות תקלות ללא ספק מוקצה</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {issueCategoriesWithoutVendor.map(cat => (
                    <Badge key={cat} variant="info">{cat}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Marketplace suggestions */}
      <div>
        <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-3">
          ספקים מומלצים מהשוק ({suggestions.length})
        </h3>
        {suggestions.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
              <p className="text-[var(--text-primary)] font-medium">כל הספקים מהשוק כבר ברשימה שלך!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {suggestions.map((vendor, idx) => {
              const vendorGradients = [
                'from-blue-500 to-blue-600',
                'from-emerald-500 to-emerald-600',
                'from-purple-500 to-purple-600',
                'from-amber-500 to-amber-600',
                'from-cyan-500 to-cyan-600',
                'from-pink-500 to-pink-600',
                'from-indigo-500 to-indigo-600',
                'from-teal-500 to-teal-600',
                'from-orange-500 to-orange-600',
                'from-rose-500 to-rose-600',
              ]
              const vendorGradient = vendorGradients[idx % vendorGradients.length]
              const initials = vendor.name.split(' ').map(w => w[0]).slice(0, 2).join('')
              return (
                <div
                  key={idx}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all"
                >
                  {/* Vendor initial circle */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${vendorGradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                    {initials}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{vendor.name}</span>
                      {vendor.available_24_7 && (
                        <Badge variant="success" className="text-xs">24/7</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-1">{vendor.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Badge variant="default" className="text-xs">{vendor.category}</Badge>
                      <span>אזור: {vendor.area}</span>
                    </div>
                  </div>

                  {/* Rating & phone */}
                  <div className="text-left min-w-[80px] shrink-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-amber-500 text-sm">{'★'.repeat(Math.round(vendor.rating))}</span>
                      <span className="text-xs text-[var(--text-secondary)]">({vendor.rating})</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]" dir="ltr">{vendor.phone}</span>
                  </div>

                  {/* Add button (visible on hover) */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      size="sm"
                      onClick={() => onAddVendor(vendor)}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      הוסף
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BudgetAgentPanel
// ---------------------------------------------------------------------------

function BudgetAgentPanel({ analysis, onCreateAlert, onExportReport }) {
  if (!analysis) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-[var(--text-secondary)]">
          לא נבחר בניין. בחר בניין מהתפריט הראשי.
        </CardContent>
      </Card>
    )
  }

  const {
    monthlyExpected, annualExpected, totalExpensesYTD, monthlyBudget,
    monthlyData, byCategory, overrunMonths, projectedAnnual, projectedGap,
    ytdIncome, ytdNet, currentMonth
  } = analysis

  const projectedSurplus = projectedGap >= 0
  const maxCategoryValue = Math.max(...Object.values(byCategory), 1)

  const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

  function monthLabel(monthStr) {
    const [, m] = monthStr.split('-')
    return hebrewMonths[parseInt(m, 10) - 1] || monthStr
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'תקציב חודשי', value: formatCurrency(monthlyBudget), gradient: 'from-purple-500 to-purple-600', color: 'text-[var(--text-primary)]' },
          { label: 'הוצאות מצטברות', value: formatCurrency(totalExpensesYTD), gradient: 'from-red-500 to-red-600', color: 'text-red-500' },
          { label: 'הכנסות מצטברות', value: formatCurrency(ytdIncome), gradient: 'from-emerald-500 to-emerald-600', color: 'text-green-600' },
          { label: 'מאזן נוכחי', value: formatCurrency(ytdNet), gradient: ytdNet >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600', color: ytdNet >= 0 ? 'text-green-600' : 'text-red-500' },
        ].map((stat) => (
          <div key={stat.label} className="relative rounded-xl border bg-white overflow-hidden">
            <div className={`h-1 w-full bg-gradient-to-r ${stat.gradient}`} />
            <div className="p-4">
              <p className="text-xs text-[var(--text-secondary)] mb-1">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Projected year-end */}
      <Card className={projectedSurplus ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {projectedSurplus
                ? <TrendingUp className="h-5 w-5 text-green-600" />
                : <TrendingDown className="h-5 w-5 text-red-500" />
              }
              <div>
                <p className={`font-semibold text-sm ${projectedSurplus ? 'text-green-700' : 'text-red-600'}`}>
                  תחזית סוף שנה: {projectedSurplus ? 'עודף' : 'גירעון'} של {formatCurrency(Math.abs(projectedGap))}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  הוצאה חודשית ממוצעת: {formatCurrency(projectedAnnual / 12)} · תקציב שנתי: {formatCurrency(annualExpected)}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={onExportReport} className="gap-1.5 shrink-0">
              יצא דוח
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overrun months */}
      {overrunMonths.length > 0 && (
        <div>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-2">חודשים בחריגת תקציב</h3>
          <div className="space-y-2">
            {overrunMonths.map((m, idx) => (
              <div
                key={idx}
                className="group flex items-center gap-4 p-4 rounded-xl border border-red-200 bg-white hover:shadow-md hover:border-red-300 transition-all"
              >
                {/* Month circle */}
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                  {monthLabel(m.month).slice(0, 3)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-semibold text-[var(--text-primary)]">{monthLabel(m.month)}</span>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-0.5">
                    <span>הוצאות: {formatCurrency(m.expenses)}</span>
                    <span>הכנסות: {formatCurrency(m.income)}</span>
                  </div>
                </div>

                {/* Overrun amount */}
                <div className="text-left min-w-[90px]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                    <span className="text-[13px] font-bold text-red-500">
                      {formatCurrency(m.expenses - monthlyBudget)}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">חריגה</span>
                </div>

                {/* Action (hover) */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreateAlert(m)}
                    className="gap-1.5"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    צור התראה
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly table */}
      <div>
        <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-2">פירוט חודשי</h3>
        <Card>
          <CardContent className="pt-3 pb-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs">
                  <th className="pb-2 text-right font-medium">חודש</th>
                  <th className="pb-2 text-right font-medium">הכנסות</th>
                  <th className="pb-2 text-right font-medium">הוצאות</th>
                  <th className="pb-2 text-right font-medium">מאזן</th>
                  <th className="pb-2 text-right font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m, idx) => (
                  <tr key={idx} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 text-[var(--text-primary)]">{monthLabel(m.month)}</td>
                    <td className="py-2 text-green-600">{formatCurrency(m.income)}</td>
                    <td className="py-2 text-red-500">{formatCurrency(m.expenses)}</td>
                    <td className={`py-2 font-medium ${m.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatCurrency(m.net)}
                    </td>
                    <td className="py-2">
                      {m.overBudget
                        ? <Badge variant="danger">חריגה</Badge>
                        : <Badge variant="success">תקין</Badge>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-2">הוצאות לפי קטגוריה</h3>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              {Object.entries(byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, val]) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--text-primary)]">{cat}</span>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{formatCurrency(val)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--border-light)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-400 transition-all duration-500"
                        style={{ width: `${(val / maxCategoryValue) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ComplianceAgentPanel
// ---------------------------------------------------------------------------

function ComplianceAgentPanel({ analysis, onAddTask, onAddCompliance }) {
  const [showCovered, setShowCovered] = useState(false)

  if (!analysis) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-[var(--text-secondary)]">
          לא נבחר בניין. בחר בניין מהתפריט הראשי.
        </CardContent>
      </Card>
    )
  }

  const { requirements, missing, covered, coverageRate, expired, overdue } = analysis

  const coverageColor = coverageRate >= 80 ? '#22c55e' : coverageRate >= 50 ? '#f59e0b' : '#ef4444'

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

  function priorityBorderClass(priority) {
    if (priority === 'high') return 'border-red-200'
    if (priority === 'medium') return 'border-amber-200'
    return 'border-green-200'
  }

  return (
    <div className="space-y-4">
      {/* Coverage score */}
      <div className="relative rounded-xl border bg-white overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 to-amber-600" />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-sm">
              {coverageRate}%
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">כיסוי רגולטורי</p>
              <Progress value={coverageRate} color={coverageColor} className="mb-2" />
              <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{covered.length} מכוסות</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>{missing.length} חסרות</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expired and overdue alerts */}
      {(expired.length > 0 || overdue.length > 0) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                {expired.length > 0 && (
                  <div>
                    <p className="font-semibold text-red-700 text-sm mb-1">רגולציה שפגה תוקפה ({expired.length})</p>
                    <ul className="text-sm text-red-600 space-y-0.5">
                      {expired.map(c => (
                        <li key={c.id}>• {c.title} — פג: {formatDate(c.expiry_date)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {overdue.length > 0 && (
                  <div>
                    <p className="font-semibold text-red-700 text-sm mb-1">משימות שעבר מועדן ({overdue.length})</p>
                    <ul className="text-sm text-red-600 space-y-0.5">
                      {overdue.map(t => (
                        <li key={t.id}>• {t.title} — היה ב: {formatDate(t.next_due_date)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing requirements */}
      {missing.length > 0 && (
        <div>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-2">
            דרישות חסרות ({missing.length})
          </h3>
          <div className="space-y-2">
            {missing.map((req, idx) => {
              const priorityGradient = req.priority === 'high' ? 'from-red-500 to-red-600' : req.priority === 'medium' ? 'from-amber-500 to-amber-600' : 'from-emerald-500 to-emerald-600'
              const priorityDot = req.priority === 'high' ? 'bg-red-500' : req.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <div
                  key={idx}
                  className={`group flex items-center gap-4 p-4 rounded-xl border bg-white hover:shadow-md transition-all ${priorityBorderClass(req.priority)} hover:border-blue-200`}
                >
                  {/* Category icon circle */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${priorityGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                    <ShieldCheck className="h-5 w-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{req.title}</span>
                      <Badge variant={priorityBadgeVariant(req.priority)}>{priorityLabel(req.priority)}</Badge>
                      <Badge variant="default">{req.category}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {req.law} · {frequencyLabel(req.frequency)}
                    </p>
                  </div>

                  {/* Status dot */}
                  <div className="flex items-center gap-2 min-w-[60px] shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot}`} />
                    <span className="text-[12px] font-medium text-red-600">חסר</span>
                  </div>

                  {/* Action (hover) */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => req.type === 'task' ? onAddTask(req) : onAddCompliance(req)}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {req.type === 'task' ? 'הוסף כמשימה' : 'הוסף לרגולציה'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Covered requirements (collapsible) */}
      {covered.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            onClick={() => setShowCovered(v => !v)}
          >
            {showCovered ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            דרישות מכוסות ({covered.length})
          </button>
          {showCovered && (
            <div className="mt-2 space-y-2">
              {covered.map((req, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 p-3 rounded-xl border border-green-100 bg-green-50/30 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{req.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="success">{req.category}</Badge>
                      <span className="text-xs text-[var(--text-secondary)]">{req.law}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600">מכוסה</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SmartAgents page
// ---------------------------------------------------------------------------

export default function SmartAgents() {
  const { selectedBuilding } = useBuildingContext()

  const { data: allPayments, isLoading } = useCollection('payments')
  const { data: allUnits } = useCollection('units')
  const { data: allExpenses } = useCollection('expenses')
  const { data: allCompliance } = useCollection('compliance')
  const { data: allTasks } = useCollection('recurringTasks')
  const { data: allVendors, create: createVendor } = useCollection('vendors')
  const { data: allIssues } = useCollection('issues')
  const { create: createAnnouncement } = useCollection('announcements')
  const { create: createRecurringTask } = useCollection('recurringTasks')
  const { create: createCompliance } = useCollection('compliance')
  const { update: updatePayment } = useCollection('payments')

  const [activeAgent, setActiveAgent] = useState(null)
  const [messageDialog, setMessageDialog] = useState({ open: false, title: '', content: '' })

  // AI state: per agent { loading, result, error }
  const [aiState, setAiState] = useState({})

  const askClaude = useCallback(async (agentType, contextData) => {
    setAiState(prev => ({ ...prev, [agentType]: { loading: true, result: null, error: null } }))
    try {
      const result = await callVaadAgent(agentType, selectedBuilding?.name ?? 'הבניין', contextData)
      setAiState(prev => ({ ...prev, [agentType]: { loading: false, result, error: null } }))
    } catch (err) {
      setAiState(prev => ({ ...prev, [agentType]: { loading: false, result: null, error: err.message } }))
    }
  }, [selectedBuilding])

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
    const name = debtor.unit.ownerName || debtor.unit.tenant_name || `דירה ${debtor.unit.number}`
    return `שלום ${name},\n\nאנו פונים אליך בנושא תשלום דמי ועד בית עבור דירה ${debtor.unit.number} בבניין ${selectedBuilding?.name}.\n\nנמצאו ${debtor.unpaidCount} חודשים שטרם שולמו בסכום כולל של ${formatCurrency(debtor.totalDebt)}.\n\nנבקשך להסדיר את התשלום בהקדם האפשרי.\n\nבברכה,\nועד הבית`
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בעדכון סטטוס תשלומים', type: 'error' } }))
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה ביצירת הודעה', type: 'error' } }))
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
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'ספק נוסף בהצלחה', type: 'success' } }))
    } catch (err) {
      console.error('Failed to add vendor:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בהוספת ספק', type: 'error' } }))
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
      color: 'blue',
      bgClass: 'bg-blue-50',
      borderClass: 'border-blue-200',
      iconClass: 'text-blue-600',
    },
    {
      id: 'vendor',
      title: 'סוכן ספקים',
      icon: Store,
      description: 'מנתח פערים בכיסוי ספקים ומציע ספקים חדשים',
      color: 'emerald',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
      iconClass: 'text-emerald-600',
    },
    {
      id: 'budget',
      title: 'סוכן תקציב',
      icon: PiggyBank,
      description: 'מנתח הכנסות והוצאות ומתריע על חריגות תקציביות',
      color: 'purple',
      bgClass: 'bg-purple-50',
      borderClass: 'border-purple-200',
      iconClass: 'text-purple-600',
    },
    {
      id: 'compliance',
      title: 'סוכן רגולציה ופרקטיקה',
      icon: ShieldCheck,
      description: 'מגדיר מה נדרש לביצוע תקופתי לפי חוק ופרקטיקה',
      color: 'amber',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
      iconClass: 'text-amber-600',
    },
  ]

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Zap} iconColor="amber" title="סוכנים חכמים" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader icon={Zap} iconColor="amber" title="סוכנים חכמים" subtitle={`סוכני AI שמנתחים את נתוני ${selectedBuilding?.name || 'הבניין'} ומייצרים פעולות מומלצות`} />

      {/* No building selected warning */}
      {!selectedBuilding && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-amber-700 text-sm font-medium">
                לא נבחר בניין. בחר בניין מהתפריט הראשי כדי להפעיל את הסוכנים.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {AGENTS.map(agent => {
          const isActive = activeAgent === agent.id
          const gradientMap = {
            blue: 'from-blue-500 to-blue-600',
            emerald: 'from-emerald-500 to-emerald-600',
            purple: 'from-purple-500 to-purple-600',
            amber: 'from-amber-500 to-amber-600',
          }
          const gradient = gradientMap[agent.color] || gradientMap.blue
          return (
            <div
              key={agent.id}
              className={`group relative rounded-xl border-2 bg-white overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                isActive
                  ? `${agent.borderClass} shadow-md`
                  : 'border-[var(--border)] hover:border-blue-200'
              }`}
              onClick={() => setActiveAgent(isActive ? null : agent.id)}
            >
              {/* Gradient accent bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${gradient}`} />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm shrink-0`}>
                    <agent.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">{agent.title}</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  {agent.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-medium text-emerald-600">פעיל</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <span className="text-xs text-[var(--text-secondary)]">כבוי</span>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isActive ? 'default' : 'outline'}
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveAgent(isActive ? null : agent.id)
                    }}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        פעיל
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        הפעל
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Active agent panels */}
      {activeAgent === 'collection' && (
        <>
          <AiInsightsPanel
            agentType="collection"
            ai={aiState['collection']}
            onAsk={() => askClaude('collection', collectionAnalysis)}
          />
          <CollectionAgentPanel
            analysis={collectionAnalysis}
            onShowMessage={handleShowMessage}
            onMarkOverdue={handleMarkOverdue}
            onCreateAnnouncement={handleCreateAnnouncement}
          />
        </>
      )}

      {activeAgent === 'vendor' && (
        <>
          <AiInsightsPanel
            agentType="vendor"
            ai={aiState['vendor']}
            onAsk={() => askClaude('vendor', {
              vendors: allVendors,
              openIssues: allIssues.filter(i => i.buildingId === selectedBuilding?.id && !['resolved','closed','completed'].includes(i.status)),
              issueCategoriesWithoutVendor: vendorAnalysis?.issueCategoriesWithoutVendor,
              expiringInsurance: vendorAnalysis?.expiringInsurance,
            })}
          />
          <VendorAgentPanel
            analysis={vendorAnalysis}
            onAddVendor={handleAddVendor}
          />
        </>
      )}

      {activeAgent === 'budget' && (
        <>
          <AiInsightsPanel
            agentType="budget"
            ai={aiState['budget']}
            onAsk={() => askClaude('budget', budgetAnalysis)}
          />
          <BudgetAgentPanel
            analysis={budgetAnalysis}
            onCreateAlert={handleCreateBudgetAlert}
            onExportReport={handleExportBudgetReport}
          />
        </>
      )}

      {activeAgent === 'compliance' && (
        <>
          <AiInsightsPanel
            agentType="compliance"
            ai={aiState['compliance']}
            onAsk={() => askClaude('compliance', {
              building: selectedBuilding,
              missingRequirements: complianceAnalysis?.missing,
              expired: complianceAnalysis?.expired,
              overdueTasks: complianceAnalysis?.overdue,
              coverageRate: complianceAnalysis?.coverageRate,
            })}
          />
          <ComplianceAgentPanel
            analysis={complianceAnalysis}
            onAddTask={handleAddTask}
            onAddCompliance={handleAddCompliance}
          />
        </>
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
          <pre className="text-sm whitespace-pre-wrap bg-[var(--surface)] p-4 rounded-lg border border-[var(--border)] text-[var(--text-primary)] font-sans max-h-80 overflow-y-auto">
            {messageDialog.content}
          </pre>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigator.clipboard?.writeText(messageDialog.content)}
          >
            העתק טקסט
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
