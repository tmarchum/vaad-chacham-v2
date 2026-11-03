import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, FormTextarea } from '@/components/common/FormField'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { waLink, telHref } from '@/lib/phone'
import { toastError } from '@/lib/toast'
import {
  Search, MessageCircle, Star, CheckCircle, ExternalLink,
  Phone, Plus, ChevronRight, Clock, ThumbsUp, ThumbsDown,
  Wrench, Send, FileText, Award, AlertTriangle, Store, X, ArrowRight, CalendarDays,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Directory URLs
// ---------------------------------------------------------------------------

const DIRECTORY_URLS = {
  'אינסטלציה': {
    madrag: 'https://www.madrag.co.il/אינסטלטורים',
    hamektzoanim: 'https://www.hamektzoanim.co.il/plumber',
    google: 'https://www.google.com/search?q=אינסטלטור+בניין+',
  },
  'חשמל': {
    madrag: 'https://www.madrag.co.il/חשמלאים',
    hamektzoanim: 'https://www.hamektzoanim.co.il/electrician',
    google: 'https://www.google.com/search?q=חשמלאי+בניין+',
  },
  'ניקיון': {
    madrag: 'https://www.madrag.co.il/ניקיון',
    hamektzoanim: 'https://www.hamektzoanim.co.il/cleaning',
    google: 'https://www.google.com/search?q=חברת+ניקיון+בניינים+',
  },
  'מעליות': {
    madrag: 'https://www.madrag.co.il/מעליות',
    hamektzoanim: 'https://www.hamektzoanim.co.il/elevator',
    google: 'https://www.google.com/search?q=תחזוקת+מעליות+',
  },
  'גינון': {
    madrag: 'https://www.madrag.co.il/גננים',
    hamektzoanim: 'https://www.hamektzoanim.co.il/gardening',
    google: 'https://www.google.com/search?q=גנן+בניינים+',
  },
  'צבע': {
    madrag: 'https://www.madrag.co.il/צבעים',
    hamektzoanim: 'https://www.hamektzoanim.co.il/painter',
    google: 'https://www.google.com/search?q=צבעי+בניינים+',
  },
  'מיזוג': {
    madrag: 'https://www.madrag.co.il/מיזוג-אוויר',
    hamektzoanim: 'https://www.hamektzoanim.co.il/ac',
    google: 'https://www.google.com/search?q=טכנאי+מיזוג+',
  },
  'איטום': {
    madrag: 'https://www.madrag.co.il/איטום',
    hamektzoanim: 'https://www.hamektzoanim.co.il/waterproofing',
    google: 'https://www.google.com/search?q=איטום+גגות+',
  },
  'מנעולנות': {
    madrag: 'https://www.madrag.co.il/מנעולנים',
    hamektzoanim: 'https://www.hamektzoanim.co.il/locksmith',
    google: 'https://www.google.com/search?q=מנעולן+',
  },
  'הדברה': {
    madrag: 'https://www.madrag.co.il/הדברה',
    hamektzoanim: 'https://www.hamektzoanim.co.il/pest-control',
    google: 'https://www.google.com/search?q=הדברה+בניינים+',
  },
}

function getDirectoryUrls(category, city = '') {
  const urls = DIRECTORY_URLS[category] || {
    madrag: `https://www.madrag.co.il/search?q=${encodeURIComponent(category)}`,
    hamektzoanim: `https://www.hamektzoanim.co.il/search?q=${encodeURIComponent(category)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(category + ' בניין ' + city)}`,
  }
  return {
    ...urls,
    google: urls.google + encodeURIComponent(city),
  }
}

// ---------------------------------------------------------------------------
// WhatsApp helpers
// ---------------------------------------------------------------------------

function generateWhatsAppMessage(issue, buildingName, vendorName = '') {
  const greeting = vendorName ? `שלום ${vendorName},` : 'שלום,'
  return `${greeting}

אנחנו ועד הבניין של ${buildingName}.

יש לנו תקלה הדורשת טיפול מקצועי:
📍 תיאור: ${issue.title}
🔧 קטגוריה: ${issue.category || 'כללי'}
⚡ עדיפות: ${issue.priority === 'urgent' ? 'דחוף' : issue.priority === 'high' ? 'גבוה' : 'רגיל'}
${issue.description ? `📝 פרטים: ${issue.description}` : ''}

נשמח לקבל הצעת מחיר לטיפול בהקדם.
ניתן לפנות אלינו בחזרה בוואטסאפ.

תודה,
ועד הבית - ${buildingName}`
}

// WhatsApp link via the shared, validated helper (the old hand-rolled version
// mangled non-Israeli / already-international numbers); falls back to a phone
// call for numbers WhatsApp can't reach (short-codes, 1-800…).
function buildWhatsAppUrl(phone, message) {
  return waLink(phone || '', message) || telHref(phone || '') || '#'
}

// ---------------------------------------------------------------------------
// Workflow stages
// ---------------------------------------------------------------------------

const WORKFLOW_STAGES = [
  { key: 'search',   label: 'חיפוש ספק',     icon: Search },
  { key: 'contact',  label: 'פנייה בוואטסאפ', icon: MessageCircle },
  { key: 'quote',    label: 'קבלת הצעה',      icon: FileText },
  { key: 'approval', label: 'אישור ועד',       icon: CheckCircle },
  { key: 'work',     label: 'ביצוע עבודה',     icon: Wrench },
  { key: 'rating',   label: 'דירוג ואישור',    icon: Star },
]

// ---------------------------------------------------------------------------
// Priority / status helpers
// ---------------------------------------------------------------------------

const PRIORITY_LABELS = { urgent: 'דחוף', high: 'גבוה', medium: 'בינוני', low: 'נמוך' }
const PRIORITY_VARIANTS = { urgent: 'danger', high: 'warning', medium: 'default', low: 'info' }
const STATUS_LABELS = { open: 'פתוח', in_progress: 'בטיפול', completed: 'הושלם', closed: 'סגור' }
const STATUS_VARIANTS = { open: 'default', in_progress: 'warning', completed: 'success', closed: 'info' }

// ---------------------------------------------------------------------------
// Local Civic Blue helpers
// ---------------------------------------------------------------------------

// WhatsApp deep-link button: opens wa.me in a new tab for the user to send
// manually — nothing is sent by the app itself.
const WA_BTN = 'inline-flex items-center justify-center gap-2 h-[38px] px-3.5 rounded-[var(--radius)] bg-[var(--success)] text-white text-[13px] font-semibold shadow-[var(--shadow)] hover:opacity-90 transition-opacity'
const LINK_BTN = 'inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--text-primary)] text-[13px] font-semibold hover:bg-[var(--surface-secondary)] transition-colors'

function KeyVal({ rows }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.filter(Boolean).map(([k, v, cls]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--text-secondary)]">{k}</dt>
          <dd className={cn('text-[var(--text-primary)] font-medium', cls)}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function priorityTone(priority) {
  if (priority === 'urgent') return 'bg-[var(--danger-light)] text-[var(--danger)]'
  if (priority === 'high') return 'bg-[var(--warning-light)] text-[var(--warning)]'
  return 'bg-[var(--surface-secondary)] text-[var(--primary)]'
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepProgress({ currentStep }) {
  return (
    <ol className="space-y-1">
      {WORKFLOW_STAGES.map((stage, idx) => {
        const done = idx < currentStep
        const active = idx === currentStep
        const Icon = stage.icon
        return (
          <li
            key={stage.key}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius)]',
              active && 'bg-[var(--surface-container)]'
            )}
          >
            <span
              className={cn(
                'w-7 h-7 rounded-[var(--radius)] flex items-center justify-center shrink-0',
                done
                  ? 'bg-[var(--success-light)] text-[var(--success)]'
                  : active
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
              )}
            >
              {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span
              className={cn(
                'text-[13px] flex-1',
                active ? 'text-[var(--primary-dark)] font-semibold' : done ? 'text-[var(--success)] font-medium' : 'text-[var(--text-secondary)]'
              )}
            >
              {stage.label}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] num-tabular">{idx + 1}/{WORKFLOW_STAGES.length}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — חיפוש ספק
// ---------------------------------------------------------------------------

function StepSearch({ issue, buildingCity, existingVendors, pendingVendors, setPendingVendors, onNext }) {
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [selectedExistingId, setSelectedExistingId] = useState('')

  const dirUrls = getDirectoryUrls(issue.category || '', buildingCity)

  const filteredExisting = existingVendors.filter(
    (v) => !issue.category || !v.category || v.category === issue.category
  )

  function addManualVendor() {
    if (!manualName.trim() || !manualPhone.trim()) return
    setPendingVendors((prev) => [
      ...prev,
      { id: Date.now().toString(), name: manualName.trim(), phone: manualPhone.trim(), contacted: false, contactedAt: null, fromExisting: false },
    ])
    setManualName('')
    setManualPhone('')
    setShowManualForm(false)
  }

  function addExistingVendor() {
    if (!selectedExistingId) return
    const vendor = existingVendors.find((v) => v.id === selectedExistingId)
    if (!vendor) return
    if (pendingVendors.some((v) => v.id === vendor.id)) return
    setPendingVendors((prev) => [
      ...prev,
      { id: vendor.id, name: vendor.name, phone: vendor.phone || '', contacted: false, contactedAt: null, fromExisting: true },
    ])
    setSelectedExistingId('')
  }

  function removeVendor(id) {
    setPendingVendors((prev) => prev.filter((v) => v.id !== id))
  }

  const canProceed = pendingVendors.length > 0

  return (
    <div className="space-y-4">
      {/* Directory links */}
      <SectionCard icon={ExternalLink} title="חפש ספקים בספריות ישראליות" subtitle="נפתח בלשונית חדשה" bodyClassName="p-4">
        <div className="flex flex-wrap gap-2">
          <a href={dirUrls.madrag} target="_blank" rel="noopener noreferrer" className={LINK_BTN}>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--primary)]" />
            מדרג
          </a>
          <a href={dirUrls.hamektzoanim} target="_blank" rel="noopener noreferrer" className={LINK_BTN}>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--primary)]" />
            המקצוענים
          </a>
          <a href={dirUrls.google} target="_blank" rel="noopener noreferrer" className={LINK_BTN}>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--primary)]" />
            Google
          </a>
        </div>
      </SectionCard>

      {/* Select from existing vendors */}
      {filteredExisting.length > 0 && (
        <SectionCard icon={Store} title="בחר ספק קיים במערכת" subtitle={`${filteredExisting.length} ספקים מתאימים במאגר`} bodyClassName="p-4">
          <div className="flex gap-2">
            <select
              value={selectedExistingId}
              onChange={(e) => setSelectedExistingId(e.target.value)}
              className="flex-1 min-w-0 h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              <option value="">-- בחר ספק --</option>
              {filteredExisting.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.phone ? `| ${v.phone}` : ''} {v.rating ? `| ★ ${v.rating}` : ''}
                </option>
              ))}
            </select>
            <Button onClick={addExistingVendor} disabled={!selectedExistingId}>
              <Plus className="h-4 w-4" />
              הוסף
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Manual add */}
      <SectionCard
        icon={Phone}
        title="הוסף ספק ידנית"
        actions={!showManualForm && (
          <Button size="sm" variant="outline" onClick={() => setShowManualForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            הוסף
          </Button>
        )}
      >
        {showManualForm && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="שם הספק"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="לדוגמה: ישראל כהן אינסטלציה"
              />
              <FormField
                label="טלפון"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addManualVendor} disabled={!manualName.trim() || !manualPhone.trim()}>
                שמור ספק
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowManualForm(false); setManualName(''); setManualPhone('') }}>
                ביטול
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Selected vendors list */}
      {pendingVendors.length > 0 && (
        <SectionCard icon={CheckCircle} title={`ספקים שנבחרו (${pendingVendors.length})`}>
          <div className="divide-y divide-[var(--border-light)]">
            {pendingVendors.map((v) => {
              const initials = v.name.split(' ').map(w => w[0]).slice(0, 2).join('')
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[12px] font-bold shrink-0">
                    {initials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{v.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-muted)] num-tabular" dir="ltr">{v.phone}</span>
                      {v.fromExisting && <Badge variant="info">קיים</Badge>}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--success-light)] text-[var(--success)] shrink-0">נבחר</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeVendor(v.id)}
                    aria-label="הסר ספק"
                    className="hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      <div className="flex justify-start">
        <Button onClick={onNext} disabled={!canProceed}>
          המשך לפנייה
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — פנייה בוואטסאפ
// ---------------------------------------------------------------------------

function StepContact({ issue, buildingName, pendingVendors, setPendingVendors, onNext }) {
  const [messages, setMessages] = useState(() =>
    Object.fromEntries(
      pendingVendors.map((v) => [v.id, generateWhatsAppMessage(issue, buildingName, v.name)])
    )
  )

  function markContacted(vendorId) {
    setPendingVendors((prev) =>
      prev.map((v) => v.id === vendorId ? { ...v, contacted: true, contactedAt: new Date().toISOString() } : v)
    )
  }


  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-secondary)]">שלח הודעת וואטסאפ לכל ספק ובקש הצעת מחיר.</p>

      {pendingVendors.map((vendor) => (
        <SectionCard
          key={vendor.id}
          icon={MessageCircle}
          title={vendor.name}
          subtitle={<span dir="ltr" className="num-tabular">{vendor.phone}</span>}
          actions={vendor.contacted && (
            <Badge variant="success">
              <Clock className="h-3 w-3" />
              נשלח ב-{new Date(vendor.contactedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          )}
          bodyClassName="p-4 space-y-3"
        >
          <FormTextarea
            label="הודעת וואטסאפ (ניתן לעריכה)"
            value={messages[vendor.id] || ''}
            onChange={(e) => setMessages((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
            rows={8}
            className="text-sm font-mono"
          />

          <a
            href={buildWhatsAppUrl(vendor.phone, messages[vendor.id] || '')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markContacted(vendor.id)}
            className={cn(WA_BTN, 'w-full sm:w-auto')}
          >
            <MessageCircle className="h-4 w-4" />
            שלח בוואטסאפ ל-{vendor.name}
          </a>
        </SectionCard>
      ))}

      <div className="flex justify-start">
        <Button onClick={onNext}>
          קיבלתי הצעות - המשך
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — קבלת הצעות
// ---------------------------------------------------------------------------

function StepQuotes({ issue, pendingVendors, quotesCollection, localQuotes, setLocalQuotes, onNext }) {
  const [forms, setForms] = useState(() =>
    Object.fromEntries(
      pendingVendors.map((v) => [v.id, { amount: '', description: '', validUntil: '' }])
    )
  )
  const [selectedQuoteId, setSelectedQuoteId] = useState(null)

  function updateForm(vendorId, field, value) {
    setForms((prev) => ({ ...prev, [vendorId]: { ...prev[vendorId], [field]: value } }))
  }

  async function saveQuote(vendor) {
    const form = forms[vendor.id]
    const parsedAmount = parseFloat(form.amount)
    if (!form.amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toastError('נא להזין סכום תקין')
      return
    }
    const quote = {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorPhone: vendor.phone,
      issueId: issue.id,
      amount: parsedAmount,
      description: form.description,
      validUntil: form.validUntil,
      createdAt: new Date().toISOString(),
    }
    const saved = await quotesCollection.create(quote)
    setLocalQuotes((prev) => [...prev.filter((q) => q.vendorId !== vendor.id), { ...quote, id: saved?.id || Date.now().toString() }])
  }

  const minAmount = localQuotes.length > 0 ? Math.min(...localQuotes.map((q) => q.amount)) : null

  function handleSelectAndContinue() {
    if (!selectedQuoteId) return
    onNext(localQuotes.find((q) => q.id === selectedQuoteId))
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-secondary)]">הזן את הצעות המחיר שקיבלת מהספקים.</p>

      {pendingVendors.map((vendor) => {
        const saved = localQuotes.find((q) => q.vendorId === vendor.id)
        const form = forms[vendor.id] || { amount: '', description: '', validUntil: '' }
        return (
          <SectionCard
            key={vendor.id}
            icon={FileText}
            title={vendor.name}
            actions={saved && (
              <Badge variant={saved.amount === minAmount ? 'success' : 'default'} className="num-tabular">
                {saved.amount === minAmount && <Award className="h-3 w-3" />}
                {saved.amount === minAmount ? 'הזול ביותר · ' : ''}
                {formatCurrency(saved.amount)}
              </Badge>
            )}
            bodyClassName="p-4"
          >
            {!saved ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    label="סכום הצעה (₪)"
                    type="number"
                    value={form.amount}
                    onChange={(e) => updateForm(vendor.id, 'amount', e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                  <FormField
                    label="תוקף הצעה עד"
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => updateForm(vendor.id, 'validUntil', e.target.value)}
                  />
                </div>
                <FormTextarea
                  label="תיאור העבודה"
                  value={form.description}
                  onChange={(e) => updateForm(vendor.id, 'description', e.target.value)}
                  rows={3}
                  placeholder="מה כולל המחיר..."
                />
                <Button size="sm" onClick={() => saveQuote(vendor)} disabled={!form.amount}>
                  שמור הצעה
                </Button>
              </div>
            ) : (
              <div className="space-y-1 text-[13px] text-[var(--text-secondary)]">
                {saved.description && <p>{saved.description}</p>}
                {saved.validUntil && <p className="num-tabular">תוקף עד: {formatDate(saved.validUntil)}</p>}
                {!saved.description && !saved.validUntil && <p className="text-[var(--text-muted)]">ההצעה נשמרה</p>}
              </div>
            )}
          </SectionCard>
        )
      })}

      {localQuotes.length > 0 && (
        <SectionCard icon={Award} title="בחר הצעה לאישור" subtitle={`${localQuotes.length} הצעות התקבלו`} tone="primary">
          <div className="p-3 space-y-2">
            {localQuotes.map((q) => {
              const isSelected = selectedQuoteId === q.id
              const isCheapest = q.amount === minAmount
              return (
                <label
                  key={q.id}
                  className={cn(
                    'flex items-center gap-3 cursor-pointer rounded-[var(--radius)] border p-3 transition-colors',
                    isSelected ? 'border-[var(--primary)] bg-[var(--surface-container)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)]'
                  )}
                >
                  <input
                    type="radio"
                    name="selectedQuote"
                    value={q.id}
                    checked={isSelected}
                    onChange={() => setSelectedQuoteId(q.id)}
                    className="accent-[var(--primary)]"
                  />
                  <span className={cn('p-1.5 rounded-[var(--radius)] shrink-0', isCheapest ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--surface-secondary)] text-[var(--primary)]')}>
                    {isCheapest ? <Award className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{q.vendorName}</span>
                    {isCheapest && <Badge variant="success">הזול ביותר</Badge>}
                  </div>
                  <span className="text-[15px] font-bold text-[var(--primary)] num-tabular shrink-0">{formatCurrency(q.amount)}</span>
                </label>
              )
            })}
          </div>
          <div className="px-4 pb-4 flex justify-start">
            <Button onClick={handleSelectAndContinue} disabled={!selectedQuoteId}>
              בחר הצעה ושלח לאישור
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — אישור ועד
// ---------------------------------------------------------------------------

function StepApproval({ issue, selectedQuote, announcementsCollection, onApproved, onRejected }) {
  const defaultText = `לחברי הועד,

התקבלה הצעת מחיר לטיפול בתקלה: ${issue.title}
ספק: ${selectedQuote.vendorName}
סכום: ₪${selectedQuote.amount.toLocaleString('he-IL')}
תיאור: ${selectedQuote.description || '—'}

נא לאשר/לדחות.`

  const [announcementText, setAnnouncementText] = useState(defaultText)
  const [sent, setSent] = useState(false)

  async function sendToVote() {
    await announcementsCollection.create({
      title: `אישור הצעת מחיר: ${issue.title}`,
      content: announcementText,
      type: 'meeting',
      priority: 'high',
      issueId: issue.id,
      quoteId: selectedQuote.id,
      createdAt: new Date().toISOString(),
    })
    setSent(true)
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <SectionCard icon={FileText} title="סיכום הצעה לאישור" bodyClassName="p-4">
        <KeyVal rows={[
          ['תקלה', issue.title],
          ['ספק', selectedQuote.vendorName],
          ['סכום', formatCurrency(selectedQuote.amount), 'text-[var(--primary)] font-bold num-tabular'],
          selectedQuote.description && ['תיאור', selectedQuote.description, 'font-normal'],
        ]} />
      </SectionCard>

      {/* Announcement text */}
      <SectionCard icon={Send} title="הודעה לועד" bodyClassName="p-4">
        <FormTextarea
          label="טקסט ההודעה לועד (ניתן לעריכה)"
          value={announcementText}
          onChange={(e) => setAnnouncementText(e.target.value)}
          rows={10}
        />
        {!sent ? (
          <Button onClick={sendToVote} className="mt-3">
            <Send className="h-4 w-4" />
            שלח להצבעת ועד
          </Button>
        ) : (
          <div className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[var(--success-light)] text-[var(--success)]">
            <CheckCircle className="h-4 w-4" />
            ההודעה נשלחה לועד
          </div>
        )}
      </SectionCard>

      {/* Approval / Rejection buttons */}
      <div className="flex gap-3">
        <Button onClick={onApproved} className="flex-1">
          <ThumbsUp className="h-4 w-4" />
          ועד אישר
        </Button>
        <Button variant="destructive" onClick={onRejected} className="flex-1">
          <ThumbsDown className="h-4 w-4" />
          ועד דחה
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — ביצוע עבודה
// ---------------------------------------------------------------------------

function StepWork({ issue, selectedQuote, buildingName, issuesCollection, workOrdersCollection, onNext }) {
  const [scheduledDate, setScheduledDate] = useState('')
  const [showCompletionDialog, setShowCompletionDialog] = useState(false)
  const [completion, setCompletion] = useState({
    actualCost: selectedQuote.amount.toString(),
    completionDate: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const waMessage = generateWhatsAppMessage(issue, buildingName, selectedQuote.vendorName)
  const waUrl = buildWhatsAppUrl(selectedQuote.vendorPhone || '', waMessage)

  async function markCompleted() {
    await issuesCollection.update(issue.id, { status: 'completed', completedAt: completion.completionDate })
    await workOrdersCollection.create({
      issueId: issue.id,
      vendorId: selectedQuote.vendorId,
      vendorName: selectedQuote.vendorName,
      quoteId: selectedQuote.id,
      quotedAmount: selectedQuote.amount,
      actualCost: parseFloat(completion.actualCost) || selectedQuote.amount,
      completionDate: completion.completionDate,
      notes: completion.notes,
      scheduledDate,
      createdAt: new Date().toISOString(),
    })
    setShowCompletionDialog(false)
    onNext({ ...completion, actualCost: parseFloat(completion.actualCost) || selectedQuote.amount })
  }

  return (
    <div className="space-y-4">
      {/* Accepted quote details */}
      <SectionCard icon={CheckCircle} title="הצעה שאושרה" bodyClassName="p-4">
        <KeyVal rows={[
          ['ספק', selectedQuote.vendorName],
          ['סכום', formatCurrency(selectedQuote.amount), 'text-[var(--primary)] font-bold num-tabular'],
          selectedQuote.description && ['תיאור', selectedQuote.description, 'font-normal'],
        ]} />
      </SectionCard>

      {/* Contact vendor again + scheduled date */}
      <SectionCard icon={CalendarDays} title="תיאום מועד" bodyClassName="p-4 space-y-4">
        {selectedQuote.vendorPhone && (
          <div>
            <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">אשר תאריך עם הספק</p>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className={WA_BTN}>
              <MessageCircle className="h-4 w-4" />
              שלח וואטסאפ לתיאום מועד
            </a>
          </div>
        )}
        <FormField
          label="תאריך ביצוע מתוכנן"
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
        />
      </SectionCard>

      <Button onClick={() => setShowCompletionDialog(true)} className="w-full sm:w-auto">
        <CheckCircle className="h-4 w-4" />
        סמן כבוצע
      </Button>

      {/* Completion dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>סיום עבודה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField
              label="עלות בפועל (₪)"
              type="number"
              value={completion.actualCost}
              onChange={(e) => setCompletion((prev) => ({ ...prev, actualCost: e.target.value }))}
              min="0"
            />
            <FormField
              label="תאריך סיום"
              type="date"
              value={completion.completionDate}
              onChange={(e) => setCompletion((prev) => ({ ...prev, completionDate: e.target.value }))}
            />
            <FormTextarea
              label="הערות"
              value={completion.notes}
              onChange={(e) => setCompletion((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="הערות על ביצוע העבודה..."
            />
            <div className="flex gap-3">
              <Button onClick={markCompleted} className="flex-1">
                אשר סיום
              </Button>
              <Button variant="outline" onClick={() => setShowCompletionDialog(false)} className="flex-1">
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 6 — דירוג ואישור
// ---------------------------------------------------------------------------

function StepRating({ issue, selectedQuote, completionData, vendorsCollection, announcementsCollection, onFinish }) {
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [addToDatabase, setAddToDatabase] = useState(true)

  function finish() {
    if (addToDatabase && rating >= 4) {
      const existingVendors = vendorsCollection.data || []
      const existing = existingVendors.find((v) => v.id === selectedQuote.vendorId)
      if (existing) {
        vendorsCollection.update(existing.id, {
          rating,
          lastJobDate: new Date().toISOString(),
          feedback,
        })
      } else {
        vendorsCollection.create({
          name: selectedQuote.vendorName,
          phone: selectedQuote.vendorPhone || '',
          category: issue.category || '',
          rating,
          feedback,
          lastJobDate: new Date().toISOString(),
          addedAt: new Date().toISOString(),
        })
      }
    }

    announcementsCollection.create({
      title: `תקלה טופלה: ${issue.title}`,
      content: `התקלה "${issue.title}" טופלה בהצלחה על ידי ${selectedQuote.vendorName}. עלות: ${formatCurrency(completionData.actualCost)}`,
      type: 'general',
      priority: 'normal',
      issueId: issue.id,
      createdAt: new Date().toISOString(),
    })

    onFinish()
  }

  return (
    <SectionCard icon={Star} title="האם אתם מרוצים מהטיפול?" subtitle="דירוג הספק ושמירה למאגר" bodyClassName="p-4 space-y-4">
      {/* Star rating */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className={cn(
              'text-3xl transition-transform hover:scale-110 focus:outline-none',
              star <= rating ? 'text-[var(--warning)]' : 'text-[var(--outline-variant)]'
            )}
            aria-label={`${star} כוכבים`}
          >
            ★
          </button>
        ))}
      </div>

      <FormTextarea
        label="משוב (אופציונלי)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="תיאור חוויית העבודה עם הספק..."
      />

      {rating >= 4 && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={addToDatabase}
            onChange={(e) => setAddToDatabase(e.target.checked)}
            className="accent-[var(--primary)] w-4 h-4"
          />
          <span className="text-[13px] text-[var(--text-primary)]">הוסף למאגר הספקים הקבוע</span>
        </label>
      )}

      {/* Summary */}
      <div className="rounded-[var(--radius)] border border-[var(--border-light)] p-3 bg-[var(--surface-secondary)]">
        <KeyVal rows={[
          ['ספק', selectedQuote.vendorName],
          ['עלות בפועל', formatCurrency(completionData.actualCost), 'text-[var(--primary)] font-bold num-tabular'],
          completionData.notes && ['הערות', completionData.notes, 'font-normal'],
        ]} />
      </div>

      <Button onClick={finish} disabled={rating === 0} className="w-full">
        <Award className="h-4 w-4" />
        סיים ושמור
      </Button>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function VendorFinder() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE (vendors stays global); unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const quotesCollection = useCollection('quotes', scope)
  const workOrdersCollection = useCollection('workOrders', scope)
  const vendorsCollection = useCollection('vendors')
  const announcementsCollection = useCollection('announcements', scope)
  const issuesCollection = useCollection('issues', scope)
  const isLoading = issuesCollection.isLoading

  // Workflow state
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [workflowStep, setWorkflowStep] = useState(0)
  const [pendingVendors, setPendingVendors] = useState([])
  const [localQuotes, setLocalQuotes] = useState([])
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [completionData, setCompletionData] = useState(null)
  const [success, setSuccess] = useState(false)

  const buildingName = selectedBuilding?.name || 'הבניין'
  const buildingCity = selectedBuilding?.city || selectedBuilding?.address || ''

  const openIssues = useMemo(
    () =>
      issuesCollection.data.filter(
        (i) =>
          (!selectedBuilding || i.buildingId === selectedBuilding.id) &&
          i.status !== 'completed' &&
          i.status !== 'closed'
      ),
    [issuesCollection.data, selectedBuilding]
  )

  function selectIssue(issue) {
    setSelectedIssue(issue)
    setWorkflowStep(0)
    setPendingVendors([])
    setLocalQuotes([])
    setSelectedQuote(null)
    setCompletionData(null)
    setSuccess(false)
  }

  function resetWorkflow() {
    setSelectedIssue(null)
    setWorkflowStep(0)
    setPendingVendors([])
    setLocalQuotes([])
    setSelectedQuote(null)
    setCompletionData(null)
    setSuccess(false)
  }

  const header = (
    <div className="min-w-0">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מציאת ספקים</h1>
      <p className="text-[13px] text-[var(--text-secondary)] mt-1">
        חיפוש ספק, פנייה, השוואת הצעות, אישור ועד וביצוע — שלב אחר שלב{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
      </p>
    </div>
  )

  if (isLoading) return (
    <div dir="rtl" className="space-y-6">
      {header}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return (
      <div dir="rtl" className="space-y-6">
        {header}
        <SectionCard>
          <EmptyState
            icon={Search}
            title="לא נבחר בניין"
            description="בחר בניין מהתפריט הראשי כדי להתחיל בחיפוש ספקים"
          />
        </SectionCard>
      </div>
    )
  }

  const urgentCount = openIssues.filter((i) => i.priority === 'urgent' || i.priority === 'high').length
  const unassignedCount = openIssues.filter((i) => !i.vendor_name).length

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        {header}
        {selectedIssue && !success && (
          <Button variant="outline" onClick={resetWorkflow}>
            <ArrowRight className="h-4 w-4" />
            חזור לרשימה
          </Button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="תקלות פתוחות" icon={Wrench} color="blue" value={String(openIssues.length)} sub="ממתינות לספק או לטיפול" />
        <StatCard label="דחופות / גבוהות" icon={AlertTriangle} color={urgentCount ? 'red' : 'emerald'} value={String(urgentCount)} sub={urgentCount ? 'כדאי לטפל קודם' : 'אין תקלות דחופות'} />
        <StatCard label="ללא ספק משויך" icon={Search} color={unassignedCount ? 'amber' : 'emerald'} value={String(unassignedCount)} sub="מתוך התקלות הפתוחות" />
        <StatCard label="ספקים במאגר" icon={Store} color="purple" value={String(vendorsCollection.data.length)} sub={`${quotesCollection.data.length} הצעות מחיר בבניין`} />
      </div>

      {/* Success message */}
      {success && (
        <SectionCard>
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <span className="p-3 rounded-[var(--radius-lg)] bg-[var(--success-light)] text-[var(--success)]">
              <CheckCircle className="h-8 w-8" strokeWidth={1.75} />
            </span>
            <p className="text-[18px] font-bold text-[var(--text-primary)]">התקלה טופלה בהצלחה!</p>
            <p className="text-[13px] text-[var(--text-secondary)]">הספק דורג והודעה נשלחה לדיירים.</p>
            <Button onClick={resetWorkflow} variant="outline">
              חזור לרשימת תקלות
            </Button>
          </div>
        </SectionCard>
      )}

      {!success && (
        <>
          {/* Issue selector */}
          {!selectedIssue ? (
            <SectionCard
              icon={Wrench}
              title="בחר תקלה לטיפול"
              subtitle={`${openIssues.length} תקלות פתוחות • ${buildingName}`}
            >
              {openIssues.length === 0 ? (
                <EmptyState
                  icon={CheckCircle}
                  title="אין תקלות פתוחות"
                  description="כל התקלות בבניין זה טופלו"
                />
              ) : (
                <>
                  {/* Desktop ledger */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="ds-table">
                      <thead>
                        <tr><th>תקלה</th><th>קטגוריה</th><th>עדיפות</th><th>סטטוס</th><th></th></tr>
                      </thead>
                      <tbody>
                        {openIssues.map((issue) => (
                          <tr key={issue.id} className="cursor-pointer" onClick={() => selectIssue(issue)}>
                            <td className="min-w-[220px]">
                              <span className="text-[13px] font-semibold">{issue.title}</span>
                              {issue.description && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{issue.description}</span>}
                            </td>
                            <td className="whitespace-nowrap">{issue.category ? <Badge>{issue.category}</Badge> : <span className="text-[var(--text-muted)]">—</span>}</td>
                            <td className="whitespace-nowrap">
                              {issue.priority ? (
                                <Badge variant={PRIORITY_VARIANTS[issue.priority] || 'default'}>
                                  {PRIORITY_LABELS[issue.priority] || issue.priority}
                                </Badge>
                              ) : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="whitespace-nowrap">
                              {issue.status && (
                                <Badge variant={STATUS_VARIANTS[issue.status] || 'default'}>
                                  {STATUS_LABELS[issue.status] || issue.status}
                                </Badge>
                              )}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--primary)]">
                                התחל טיפול
                                <ChevronRight className="h-4 w-4 rotate-180" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden p-3 space-y-2">
                    {openIssues.map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        className="w-full text-right flex items-center gap-3 p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] transition-colors"
                        onClick={() => selectIssue(issue)}
                      >
                        <span className={cn('p-1.5 rounded-[var(--radius)] shrink-0', priorityTone(issue.priority))}>
                          <Wrench className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{issue.title}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issue.category && <Badge>{issue.category}</Badge>}
                            {issue.priority && (
                              <Badge variant={PRIORITY_VARIANTS[issue.priority] || 'default'}>
                                {PRIORITY_LABELS[issue.priority] || issue.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 rotate-180 text-[var(--text-muted)] shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          ) : (
            /* Workflow panel */
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Side panel: issue + progress */}
              <aside className="xl:col-span-4 xl:order-last xl:sticky xl:top-20 space-y-4 min-w-0">
                <SectionCard icon={Wrench} title={selectedIssue.title} subtitle="התקלה בטיפול" bodyClassName="p-4 space-y-3">
                  {selectedIssue.description && (
                    <p className="text-[13px] text-[var(--text-secondary)]">{selectedIssue.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIssue.category && <Badge>{selectedIssue.category}</Badge>}
                    {selectedIssue.priority && (
                      <Badge variant={PRIORITY_VARIANTS[selectedIssue.priority] || 'default'}>
                        {PRIORITY_LABELS[selectedIssue.priority] || selectedIssue.priority}
                      </Badge>
                    )}
                  </div>
                </SectionCard>
                <SectionCard title="שלבי הטיפול" subtitle={`שלב ${workflowStep + 1} מתוך ${WORKFLOW_STAGES.length}`} bodyClassName="p-2">
                  <StepProgress currentStep={workflowStep} />
                </SectionCard>
              </aside>

              {/* Step panels */}
              <div className="xl:col-span-8 min-w-0">
                {workflowStep === 0 && (
                  <StepSearch
                    issue={selectedIssue}
                    buildingCity={buildingCity}
                    existingVendors={vendorsCollection.data}
                    pendingVendors={pendingVendors}
                    setPendingVendors={setPendingVendors}
                    onNext={() => setWorkflowStep(1)}
                  />
                )}

                {workflowStep === 1 && (
                  <StepContact
                    issue={selectedIssue}
                    buildingName={buildingName}
                    pendingVendors={pendingVendors}
                    setPendingVendors={setPendingVendors}
                    onNext={() => setWorkflowStep(2)}
                  />
                )}

                {workflowStep === 2 && (
                  <StepQuotes
                    issue={selectedIssue}
                    buildingName={buildingName}
                    pendingVendors={pendingVendors}
                    quotesCollection={quotesCollection}
                    localQuotes={localQuotes}
                    setLocalQuotes={setLocalQuotes}
                    onNext={(quote) => {
                      setSelectedQuote(quote)
                      setWorkflowStep(3)
                    }}
                  />
                )}

                {workflowStep === 3 && selectedQuote && (
                  <StepApproval
                    issue={selectedIssue}
                    selectedQuote={selectedQuote}
                    buildingName={buildingName}
                    announcementsCollection={announcementsCollection}
                    onApproved={() => setWorkflowStep(4)}
                    onRejected={() => {
                      setSelectedQuote(null)
                      setWorkflowStep(2)
                    }}
                  />
                )}

                {workflowStep === 4 && selectedQuote && (
                  <StepWork
                    issue={selectedIssue}
                    selectedQuote={selectedQuote}
                    buildingName={buildingName}
                    issuesCollection={issuesCollection}
                    workOrdersCollection={workOrdersCollection}
                    onNext={(data) => {
                      setCompletionData(data)
                      setWorkflowStep(5)
                    }}
                  />
                )}

                {workflowStep === 5 && selectedQuote && completionData && (
                  <StepRating
                    issue={selectedIssue}
                    selectedQuote={selectedQuote}
                    completionData={completionData}
                    vendorsCollection={vendorsCollection}
                    announcementsCollection={announcementsCollection}
                    onFinish={() => setSuccess(true)}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
