import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, FormSelect, FormTextarea, FormBool } from '@/components/common/FormField'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Search, MessageCircle, Star, CheckCircle, ExternalLink,
  Phone, Plus, ChevronRight, Clock, ThumbsUp, ThumbsDown,
  Wrench, Send, FileText, Award
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

function buildWhatsAppUrl(phone, message) {
  let normalized = phone.replace(/[-\s()]/g, '')
  if (normalized.startsWith('0')) normalized = '972' + normalized.slice(1)
  if (!normalized.startsWith('972')) normalized = '972' + normalized
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
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
// Progress indicator
// ---------------------------------------------------------------------------

function StepProgress({ currentStep }) {
  return (
    <div className="flex items-center justify-between mb-6 overflow-x-auto pb-1">
      {WORKFLOW_STAGES.map((stage, idx) => {
        const done = idx < currentStep
        const active = idx === currentStep
        const Icon = stage.icon
        return (
          <div key={stage.key} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                  done
                    ? 'bg-[var(--success)] border-[var(--success)] text-white'
                    : active
                      ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                      : 'bg-transparent border-[var(--border)] text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span
                className={[
                  'text-[10px] text-center max-w-[56px] leading-tight',
                  active ? 'text-[var(--primary)] font-semibold' : 'text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {stage.label}
              </span>
            </div>
            {idx < WORKFLOW_STAGES.length - 1 && (
              <div
                className={[
                  'h-0.5 w-6 sm:w-10 mx-1 mb-5 shrink-0',
                  done ? 'bg-[var(--success)]' : 'bg-[var(--border)]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
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
      {/* Issue summary */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">{issue.title}</h3>
          {issue.description && (
            <p className="text-sm text-[var(--text-secondary)] mb-3">{issue.description}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {issue.category && <Badge>{issue.category}</Badge>}
            {issue.priority && (
              <Badge variant={PRIORITY_VARIANTS[issue.priority] || 'default'}>
                {PRIORITY_LABELS[issue.priority] || issue.priority}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Directory links */}
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">חפש ספקים בספריות ישראליות</p>
          <div className="flex flex-wrap gap-2">
            <a href={dirUrls.madrag} target="_blank" rel="noopener noreferrer">
              <Button
                style={{ backgroundColor: '#e65c00', color: '#fff' }}
                className="hover:opacity-90 border-none gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                מדרג
              </Button>
            </a>
            <a href={dirUrls.hamektzoanim} target="_blank" rel="noopener noreferrer">
              <Button
                style={{ backgroundColor: '#0e7c86', color: '#fff' }}
                className="hover:opacity-90 border-none gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                המקצוענים
              </Button>
            </a>
            <a href={dirUrls.google} target="_blank" rel="noopener noreferrer">
              <Button
                style={{ backgroundColor: '#5f6368', color: '#fff' }}
                className="hover:opacity-90 border-none gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Google
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Select from existing vendors */}
      {filteredExisting.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">בחר ספק קיים במערכת</p>
            <div className="flex gap-2">
              <select
                value={selectedExistingId}
                onChange={(e) => setSelectedExistingId(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="">-- בחר ספק --</option>
                {filteredExisting.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.phone ? `| ${v.phone}` : ''} {v.rating ? `| ★ ${v.rating}` : ''}
                  </option>
                ))}
              </select>
              <Button onClick={addExistingVendor} disabled={!selectedExistingId} size="sm">
                <Plus className="h-3.5 w-3.5" />
                הוסף
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual add */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">הוסף ספק ידנית</p>
            {!showManualForm && (
              <Button size="sm" variant="outline" onClick={() => setShowManualForm(true)} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                הוסף
              </Button>
            )}
          </div>
          {showManualForm && (
            <div className="space-y-3">
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
        </CardContent>
      </Card>

      {/* Selected vendors list */}
      {pendingVendors.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">ספקים שנבחרו ({pendingVendors.length})</p>
            <div className="space-y-2">
              {pendingVendors.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 bg-[var(--surface)]">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{v.name}</span>
                    <span className="text-xs text-[var(--text-secondary)]" dir="ltr">{v.phone}</span>
                    {v.fromExisting && <Badge variant="info" className="text-[10px]">קיים</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeVendor(v.id)}
                    className="text-[var(--danger)] hover:text-[var(--danger)] h-7 w-7 p-0"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-start">
        <Button onClick={onNext} disabled={!canProceed} className="gap-1.5">
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

  const allContacted = pendingVendors.every((v) => v.contacted)

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">שלח הודעת וואטסאפ לכל ספק ובקש הצעת מחיר.</p>

      {pendingVendors.map((vendor) => (
        <Card key={vendor.id}>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)]">{vendor.name}</span>
                <span className="text-sm text-[var(--text-secondary)]" dir="ltr">{vendor.phone}</span>
              </div>
              {vendor.contacted && (
                <Badge variant="success" className="gap-1">
                  <Clock className="h-3 w-3" />
                  נשלח ב-{new Date(vendor.contactedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </Badge>
              )}
            </div>

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
            >
              <Button
                style={{ backgroundColor: '#25D366', color: '#fff' }}
                className="hover:opacity-90 border-none gap-2 w-full sm:w-auto"
              >
                <MessageCircle className="h-4 w-4" />
                שלח בוואטסאפ ל-{vendor.name}
              </Button>
            </a>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-start">
        <Button onClick={onNext} className="gap-1.5">
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

function StepQuotes({ issue, buildingName, pendingVendors, quotesCollection, localQuotes, setLocalQuotes, onNext }) {
  const [forms, setForms] = useState(() =>
    Object.fromEntries(
      pendingVendors.map((v) => [v.id, { amount: '', description: '', validUntil: '' }])
    )
  )
  const [selectedQuoteId, setSelectedQuoteId] = useState(null)

  function updateForm(vendorId, field, value) {
    setForms((prev) => ({ ...prev, [vendorId]: { ...prev[vendorId], [field]: value } }))
  }

  function saveQuote(vendor) {
    const form = forms[vendor.id]
    if (!form.amount) return
    const quote = {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorPhone: vendor.phone,
      issueId: issue.id,
      amount: parseFloat(form.amount),
      description: form.description,
      validUntil: form.validUntil,
      createdAt: new Date().toISOString(),
    }
    const saved = quotesCollection.create(quote)
    setLocalQuotes((prev) => [...prev.filter((q) => q.vendorId !== vendor.id), { ...quote, id: saved?.id || Date.now().toString() }])
  }

  const minAmount = localQuotes.length > 0 ? Math.min(...localQuotes.map((q) => q.amount)) : null

  function handleSelectAndContinue() {
    if (!selectedQuoteId) return
    onNext(localQuotes.find((q) => q.id === selectedQuoteId))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">הזן את הצעות המחיר שקיבלת מהספקים.</p>

      {pendingVendors.map((vendor) => {
        const saved = localQuotes.find((q) => q.vendorId === vendor.id)
        const form = forms[vendor.id] || { amount: '', description: '', validUntil: '' }
        return (
          <Card key={vendor.id}>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">{vendor.name}</span>
                {saved && (
                  <Badge
                    variant={saved.amount === minAmount ? 'success' : 'default'}
                    className="gap-1"
                  >
                    {saved.amount === minAmount && <Award className="h-3 w-3" />}
                    {saved.amount === minAmount ? 'הזול ביותר · ' : ''}
                    {formatCurrency(saved.amount)}
                  </Badge>
                )}
              </div>

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
                <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                  {saved.description && <p>{saved.description}</p>}
                  {saved.validUntil && <p>תוקף עד: {formatDate(saved.validUntil)}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {localQuotes.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">בחר הצעה לאישור</p>
            <div className="space-y-2">
              {localQuotes.map((q) => (
                <label key={q.id} className="flex items-center gap-3 cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors">
                  <input
                    type="radio"
                    name="selectedQuote"
                    value={q.id}
                    checked={selectedQuoteId === q.id}
                    onChange={() => setSelectedQuoteId(q.id)}
                    className="accent-[var(--primary)]"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-[var(--text-primary)]">{q.vendorName}</span>
                    <span className="mx-2 text-[var(--text-secondary)]">·</span>
                    <span className="text-[var(--primary)] font-semibold">{formatCurrency(q.amount)}</span>
                    {q.amount === minAmount && (
                      <Badge variant="success" className="mr-2 text-[10px]">הזול ביותר</Badge>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-start">
              <Button onClick={handleSelectAndContinue} disabled={!selectedQuoteId} className="gap-1.5">
                בחר הצעה ושלח לאישור
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — אישור ועד
// ---------------------------------------------------------------------------

function StepApproval({ issue, selectedQuote, buildingName, announcementsCollection, onApproved, onRejected }) {
  const defaultText = `לחברי הועד,

התקבלה הצעת מחיר לטיפול בתקלה: ${issue.title}
ספק: ${selectedQuote.vendorName}
סכום: ₪${selectedQuote.amount.toLocaleString('he-IL')}
תיאור: ${selectedQuote.description || '—'}

נא לאשר/לדחות.`

  const [announcementText, setAnnouncementText] = useState(defaultText)
  const [sent, setSent] = useState(false)

  function sendToVote() {
    announcementsCollection.create({
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
      <Card>
        <CardContent className="pt-5 space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">סיכום הצעה לאישור</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">תקלה:</span>
            <span className="text-[var(--text-primary)] font-medium">{issue.title}</span>
            <span className="text-[var(--text-secondary)]">ספק:</span>
            <span className="text-[var(--text-primary)] font-medium">{selectedQuote.vendorName}</span>
            <span className="text-[var(--text-secondary)]">סכום:</span>
            <span className="text-[var(--primary)] font-bold">{formatCurrency(selectedQuote.amount)}</span>
            {selectedQuote.description && (
              <>
                <span className="text-[var(--text-secondary)]">תיאור:</span>
                <span className="text-[var(--text-primary)]">{selectedQuote.description}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Announcement text */}
      <Card>
        <CardContent className="pt-5">
          <FormTextarea
            label="טקסט ההודעה לועד (ניתן לעריכה)"
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            rows={10}
          />
          {!sent ? (
            <Button onClick={sendToVote} className="mt-3 gap-1.5">
              <Send className="h-4 w-4" />
              שלח להצבעת ועד
            </Button>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--success)]">
              <CheckCircle className="h-4 w-4" />
              ההודעה נשלחה לועד
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval / Rejection buttons */}
      <div className="flex gap-3">
        <Button onClick={onApproved} className="gap-1.5 flex-1">
          <ThumbsUp className="h-4 w-4" />
          ✓ ועד אישר
        </Button>
        <Button variant="destructive" onClick={onRejected} className="gap-1.5 flex-1">
          <ThumbsDown className="h-4 w-4" />
          ✗ ועד דחה
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

  function markCompleted() {
    issuesCollection.update(issue.id, { status: 'completed', completedAt: completion.completionDate })
    workOrdersCollection.create({
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
      <Card>
        <CardContent className="pt-5 space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">הצעה שאושרה</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">ספק:</span>
            <span className="text-[var(--text-primary)] font-medium">{selectedQuote.vendorName}</span>
            <span className="text-[var(--text-secondary)]">סכום:</span>
            <span className="text-[var(--primary)] font-bold">{formatCurrency(selectedQuote.amount)}</span>
            {selectedQuote.description && (
              <>
                <span className="text-[var(--text-secondary)]">תיאור:</span>
                <span className="text-[var(--text-primary)]">{selectedQuote.description}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact vendor again */}
      {selectedQuote.vendorPhone && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">אשר תאריך עם הספק</p>
            <a href={waUrl} target="_blank" rel="noopener noreferrer">
              <Button
                style={{ backgroundColor: '#25D366', color: '#fff' }}
                className="hover:opacity-90 border-none gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                שלח וואטסאפ לתיאום מועד
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Scheduled date */}
      <Card>
        <CardContent className="pt-5">
          <FormField
            label="תאריך ביצוע מתוכנן"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </CardContent>
      </Card>

      <Button onClick={() => setShowCompletionDialog(true)} className="gap-1.5 w-full sm:w-auto">
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
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <p className="text-base font-semibold text-[var(--text-primary)]">האם אתם מרוצים מהטיפול?</p>

          {/* Star rating */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                style={{ color: star <= rating ? '#f59e0b' : '#d1d5db' }}
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
              <span className="text-sm text-[var(--text-primary)]">הוסף למאגר הספקים הקבוע</span>
            </label>
          )}

          {/* Summary */}
          <div className="rounded-lg border border-[var(--border)] p-3 bg-[var(--surface)] space-y-1 text-sm">
            <p className="text-[var(--text-secondary)]">
              ספק: <span className="text-[var(--text-primary)] font-medium">{selectedQuote.vendorName}</span>
            </p>
            <p className="text-[var(--text-secondary)]">
              עלות בפועל: <span className="text-[var(--primary)] font-bold">{formatCurrency(completionData.actualCost)}</span>
            </p>
            {completionData.notes && (
              <p className="text-[var(--text-secondary)]">הערות: {completionData.notes}</p>
            )}
          </div>

          <Button onClick={finish} disabled={rating === 0} className="gap-1.5 w-full">
            <Award className="h-4 w-4" />
            סיים ושמור
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function VendorFinder() {
  const { selectedBuilding } = useBuildingContext()
  const { data: issues } = useCollection('issues')
  const quotesCollection = useCollection('quotes')
  const workOrdersCollection = useCollection('workOrders')
  const vendorsCollection = useCollection('vendors')
  const announcementsCollection = useCollection('announcements')
  const issuesCollection = useCollection('issues')

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
      issues.filter(
        (i) =>
          (!selectedBuilding || i.buildingId === selectedBuilding.id) &&
          i.status !== 'completed' &&
          i.status !== 'closed'
      ),
    [issues, selectedBuilding]
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

  if (!selectedBuilding) {
    return (
      <div dir="rtl" className="p-4 max-w-2xl mx-auto">
        <EmptyState
          icon={Search}
          title="לא נבחר בניין"
          description="בחר בניין מהתפריט הראשי כדי להתחיל בחיפוש ספקים"
        />
      </div>
    )
  }

  return (
    <div dir="rtl" className="p-4 max-w-2xl mx-auto space-y-6">
      <PageHeader icon={Search} iconColor="cyan" title="מציאת ספקים" subtitle={buildingName} />

      {/* Success message */}
      {success && (
        <Card>
          <CardContent className="pt-5 flex flex-col items-center text-center gap-3">
            <CheckCircle className="h-12 w-12 text-[var(--success)]" />
            <p className="text-lg font-semibold text-[var(--text-primary)]">התקלה טופלה בהצלחה!</p>
            <p className="text-sm text-[var(--text-secondary)]">הספק דורג והודעה נשלחה לדיירים.</p>
            <Button onClick={resetWorkflow} variant="outline">
              חזור לרשימת תקלות
            </Button>
          </CardContent>
        </Card>
      )}

      {!success && (
        <>
          {/* Issue selector */}
          {!selectedIssue ? (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">בחר תקלה לטיפול</h2>
              {openIssues.length === 0 ? (
                <EmptyState
                  icon={CheckCircle}
                  title="אין תקלות פתוחות"
                  description="כל התקלות בבניין זה טופלו"
                />
              ) : (
                openIssues.map((issue) => (
                  <Card
                    key={issue.id}
                    className="cursor-pointer border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                    onClick={() => selectIssue(issue)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--text-primary)] mb-1 truncate">{issue.title}</p>
                          {issue.description && (
                            <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">{issue.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {issue.category && <Badge>{issue.category}</Badge>}
                            {issue.priority && (
                              <Badge variant={PRIORITY_VARIANTS[issue.priority] || 'default'}>
                                {PRIORITY_LABELS[issue.priority] || issue.priority}
                              </Badge>
                            )}
                            {issue.status && (
                              <Badge variant={STATUS_VARIANTS[issue.status] || 'default'}>
                                {STATUS_LABELS[issue.status] || issue.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            /* Workflow panel */
            <div className="space-y-4">
              {/* Back + issue title */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetWorkflow}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  ← חזור לרשימה
                </button>
                <span className="text-[var(--border)]">|</span>
                <span className="text-sm font-medium text-[var(--text-primary)] truncate">{selectedIssue.title}</span>
              </div>

              {/* Progress indicator */}
              <StepProgress currentStep={workflowStep} />

              {/* Step panels */}
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
          )}
        </>
      )}
    </div>
  )
}
