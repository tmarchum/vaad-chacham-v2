import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useBuildingContext } from '@/hooks/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast, toastError } from '@/lib/toast'
import { vendorDistanceKm, formatKm } from '@/lib/geo'
import { cn, formatCurrency } from '@/lib/utils'
import { MessageCircle, Wrench, Receipt, Send, Plus, Check, X, Clock } from 'lucide-react'

// "תיק ספק": one place per vendor for the WhatsApp conversation, the jobs and
// quotes with the selected building, and the building's payables to the vendor.
// Accounting here is a record only — the building pays the vendor directly.

const PAY_METHODS = [
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'cheque', label: "צ'ק" },
  { value: 'standing_order', label: 'הוראת קבע' },
  { value: 'cash', label: 'מזומן' },
  { value: 'other', label: 'אחר' },
]
const PAY_LABEL = Object.fromEntries(PAY_METHODS.map((m) => [m.value, m.label]))
const WO_STATUS = { pending: 'ממתין', approved: 'אושר', in_progress: 'בביצוע', completed: 'הושלם', cancelled: 'בוטל' }
const QUOTE_STATUS = { pending: 'ממתינה', sent: 'נשלחה', received: 'התקבלה', approved: 'אושרה', rejected: 'נדחתה' }
const DAY = 24 * 60 * 60 * 1000
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const fmtTime = (d) => new Date(d).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'

export function VendorFile({ vendor, initialTab = 'chat', onClose }) {
  const { selectedBuilding } = useBuildingContext()
  const buildingId = selectedBuilding?.id
  const [tab, setTab] = useState(initialTab)
  const [messages, setMessages] = useState([])
  const [jobs, setJobs] = useState({ workOrders: [], quotes: [] })
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)

  const loadMessages = useCallback(async () => {
    if (!vendor) return
    const { data } = await supabase.from('notification_log')
      .select('id, created_at, channel, status, delivery_status, subject, body, error_message')
      .eq('vendor_id', vendor.id).in('channel', ['whatsapp', 'whatsapp_in'])
      .order('created_at', { ascending: true }).limit(500)
    setMessages(data || [])
  }, [vendor])

  // Live: new messages, replies and delivery/read receipts appear as they happen.
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!vendor) return
    const ch = supabase.channel(`vendor-chat-${vendor.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_log', filter: `vendor_id=eq.${vendor.id}` }, () => loadMessages())
      .subscribe((st) => setLive(st === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(ch); setLive(false) }
  }, [vendor, loadMessages])

  const load = useCallback(async () => {
    if (!vendor) return
    setLoading(true)
    const msgQ = supabase.from('notification_log')
      .select('id, created_at, channel, status, delivery_status, subject, body, error_message')
      .eq('vendor_id', vendor.id).in('channel', ['whatsapp', 'whatsapp_in'])
      .order('created_at', { ascending: true }).limit(500)
    const woQ = buildingId
      ? supabase.from('work_orders').select('id, title, status, scheduled_date, completed_date, estimated_cost, actual_cost, created_at')
        .eq('vendor_id', vendor.id).eq('building_id', buildingId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
    const qQ = buildingId
      ? supabase.from('quotes').select('id, description, amount, status, created_at')
        .eq('vendor_id', vendor.id).eq('building_id', buildingId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
    const bQ = buildingId
      ? supabase.from('vendor_bills').select('*')
        .eq('vendor_id', vendor.id).eq('building_id', buildingId).order('bill_date', { ascending: false })
      : Promise.resolve({ data: [] })
    const [m, wo, q, b] = await Promise.all([msgQ, woQ, qQ, bQ])
    setMessages(m.data || [])
    setJobs({ workOrders: wo.data || [], quotes: q.data || [] })
    setBills(b.data || [])
    setLoading(false)
  }, [vendor, buildingId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setTab(initialTab) }, [initialTab, vendor?.id])

  const totals = useMemo(() => {
    const live = bills.filter((b) => b.status !== 'cancelled')
    const billed = live.reduce((s, b) => s + Number(b.amount || 0), 0)
    const paid = live.filter((b) => b.status === 'paid').reduce((s, b) => s + Number(b.paid_amount ?? b.amount ?? 0), 0)
    return { billed, paid, open: billed - paid, openCount: live.filter((b) => b.status === 'open').length }
  }, [bills])

  const unbilled = useMemo(() => {
    const billedWo = new Set(bills.filter((b) => b.status !== 'cancelled').map((b) => b.work_order_id).filter(Boolean))
    return jobs.workOrders.filter((w) => w.status === 'completed' && Number(w.actual_cost) > 0 && !billedWo.has(w.id))
  }, [bills, jobs])

  if (!vendor) return null
  const inbound = messages.filter((m) => m.channel === 'whatsapp_in').length

  return (
    <Dialog open={!!vendor} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>תיק ספק · {vendor.name}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-[var(--text-muted)] -mt-2">
          {vendor.category || 'ללא תחום'} · <span dir="ltr" className="num-tabular">{vendor.phone || '—'}</span>
          {vendor.google_place_id && <> · <a href={vendor.maps_url || undefined} target="_blank" rel="noreferrer" className="text-[var(--primary)]">Google ★ {Number(vendor.rating) || '—'} ({vendor.review_count ?? 0})</a></>}
          {vendor.source === 'midrag' && <> · מידרג</>}
          {formatKm(vendorDistanceKm(vendor, selectedBuilding)) && <> · 📍 {vendor.geo_source === 'area' ? '~' : ''}{formatKm(vendorDistanceKm(vendor, selectedBuilding))} מהבניין</>}
          {selectedBuilding && <> · עבודות והתחשבנות מול {selectedBuilding.name}</>}
        </p>

        <TabGroup
          className="mt-3"
          activeTab={tab}
          onChange={setTab}
          tabs={[
            { key: 'chat', label: 'שיחה', icon: MessageCircle, count: inbound || null },
            { key: 'jobs', label: 'עבודות והצעות', icon: Wrench, count: jobs.workOrders.length + jobs.quotes.length || null },
            vendor.is_internal
              ? { key: 'billing', label: 'שעות טיפול', icon: Clock }
              : { key: 'billing', label: 'התחשבנות', icon: Receipt, count: totals.openCount || null },
          ]}
        />

        <div className="mt-4">
          {loading ? (
            <p className="text-[13px] text-[var(--text-muted)] py-8 text-center">טוען...</p>
          ) : tab === 'chat' ? (
            <ChatTab vendor={vendor} messages={messages} live={live} onSent={loadMessages} />
          ) : tab === 'jobs' ? (
            <JobsTab jobs={jobs} hasBuilding={!!buildingId} />
          ) : vendor.is_internal ? (
            <HoursTab buildingId={buildingId} />
          ) : (
            <BillingTab vendor={vendor} buildingId={buildingId} bills={bills} totals={totals} unbilled={unbilled} onChange={load} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Conversation ───────────────────────────────────────────────────────────
function ChatTab({ vendor, messages, live, onSent }) {
  const [text, setText] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  const [busy, setBusy] = useState(false)
  const lastIn = [...messages].reverse().find((m) => m.channel === 'whatsapp_in')
  // WhatsApp allows free text only within 24h of the vendor's last message.
  const canReply = lastIn && Date.now() - new Date(lastIn.created_at).getTime() < DAY

  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('whatsapp', {
      body: { action: 'send-text', audience: 'vendor', to: vendor.phone, text: text.trim() },
    })
    setBusy(false)
    if (error || !data?.ok) return toastError('השליחה נכשלה' + (data?.error ? `: ${data.error}` : ''))
    setText('')
    toast('נשלח')
    onSent?.()
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <span className={cn('h-2 w-2 rounded-full', live ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--text-muted)]')} />
        {live ? 'מתעדכן בזמן אמת' : 'מתחבר...'} · {messages.length} הודעות בתיעוד
      </p>
      {messages.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">עדיין אין הודעות עם הספק הזה.</p>
      ) : (
        <div className="space-y-2 max-h-[46vh] overflow-y-auto rounded-[var(--radius)] bg-[var(--surface-secondary)] p-3">
          {messages.map((m) => {
            const mine = m.channel === 'whatsapp'
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                <div className={cn(
                  'max-w-[80%] rounded-[var(--radius-lg)] px-3 py-2 text-[13px] whitespace-pre-wrap shadow-[var(--shadow)]',
                  mine ? 'bg-[var(--surface)]' : 'bg-[var(--primary-light,#e0ecff)]',
                )}>
                  <p>{m.body || m.subject}</p>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)] flex gap-1.5">
                    <span>{mine ? 'ועד1' : vendor.name}</span>·<span>{fmtTime(m.created_at)}</span>
                    {mine && m.status === 'failed' && <span className="text-[var(--danger)]">· לא נשלח</span>}
                    {mine && m.delivery_status === 'read' && <span>· נקרא</span>}
                    {mine && m.delivery_status === 'delivered' && <span>· נמסר</span>}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      )}

      {canReply ? (
        <div className="flex gap-2">
          <input className={field} value={text} placeholder="תשובה לספק..." onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && send()} />
          <Button onClick={send} disabled={busy || !text.trim()}><Send className="h-4 w-4" />{busy ? 'שולח...' : 'שליחה'}</Button>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--text-muted)]">
          וואטסאפ מאפשר לענות בטקסט חופשי רק עד 24 שעות מההודעה האחרונה של הספק. מחוץ לחלון הזה פונים לספק דרך התקלה או ההזמנה.
        </p>
      )}
    </div>
  )
}

// ── Jobs & quotes ──────────────────────────────────────────────────────────
function JobsTab({ jobs, hasBuilding }) {
  if (!hasBuilding) return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">יש לבחור בניין כדי לראות עבודות.</p>
  if (!jobs.workOrders.length && !jobs.quotes.length) {
    return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">אין עדיין עבודות או הצעות מחיר מול הספק בבניין הזה.</p>
  }
  return (
    <div className="space-y-4">
      {jobs.workOrders.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">הזמנות עבודה</p>
          <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
            {jobs.workOrders.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 p-2.5 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium truncate">{w.title || 'עבודה'}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{WO_STATUS[w.status] || w.status} · {fmtDate(w.completed_date || w.scheduled_date || w.created_at)}</p>
                </div>
                <span className="num-tabular shrink-0">{formatCurrency(Number(w.actual_cost ?? w.estimated_cost ?? 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {jobs.quotes.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">הצעות מחיר</p>
          <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
            {jobs.quotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3 p-2.5 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium truncate">{q.description || 'הצעת מחיר'}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{QUOTE_STATUS[q.status] || q.status} · {fmtDate(q.created_at)}</p>
                </div>
                <span className="num-tabular shrink-0">{q.amount != null ? formatCurrency(Number(q.amount)) : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ועד1 handyman: hours logged on issues (punch card / ועד1 bill) ──────────
function HoursTab({ buildingId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!buildingId) { setRows([]); return }
    supabase.from('issues')
      .select('id, title, ticket_no, status, stage, work_hours, punches_charged, off_hours, resolved_at, handled_at, created_at')
      .eq('building_id', buildingId).eq('handler', 'management').eq('handler_kind', 'handyman')
      .order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows(data || []))
  }, [buildingId])
  if (!buildingId) return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">יש לבחור בניין.</p>
  if (!rows) return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">טוען...</p>
  const month = new Date().toISOString().slice(0, 7)
  const done = rows.filter((r) => Number(r.work_hours) > 0)
  const sum = (list) => list.reduce((a, r) => a + Number(r.work_hours || 0), 0)
  const thisMonth = done.filter((r) => String(r.resolved_at || '').startsWith(month))
  const open = rows.filter((r) => !(Number(r.work_hours) > 0) && !['completed', 'resolved', 'closed', 'rejected'].includes(r.status))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[['פתוחות לטיפול', open.length, ''], ['שעות החודש', sum(thisMonth), ''], ['שעות סה"כ', sum(done), '']].map(([label, v]) => (
          <div key={label} className="rounded-[var(--radius)] border border-[var(--border)] p-3">
            <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
            <p className="text-[17px] font-semibold num-tabular">{Math.round(v * 10) / 10}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">ההנדימן של ועד1: השעות נרשמות בסיום הטיפול בתקלה ויורדות מהכרטיסייה של הבניין או נכנסות לחשבון ועד1 — לא חשבון ספק נפרד.</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">עדיין לא הועברו תקלות לטיפול ועד1 בבניין הזה.</p>
      ) : (
        <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 text-[13px]">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.ticket_no ? `#${r.ticket_no} · ` : ''}{r.title}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {Number(r.work_hours) > 0 ? `טופל ${fmtDate(r.resolved_at)}` : r.stage === 'queued_for_visit' ? 'ממתין לביקור הבא' : 'בטיפול'}
                  {r.off_hours ? ' · מחוץ לשעות' : ''}
                </p>
              </div>
              <span className="num-tabular shrink-0">{Number(r.work_hours) > 0 ? `${r.work_hours} ש׳` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Payables ───────────────────────────────────────────────────────────────
const EMPTY_BILL = { bill_date: '', doc_number: '', description: '', amount: '', due_date: '', work_order_id: null }

function BillingTab({ vendor, buildingId, bills, totals, unbilled, onChange }) {
  const [form, setForm] = useState(null)
  const [paying, setPaying] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!buildingId) return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">יש לבחור בניין כדי לנהל התחשבנות.</p>

  const saveBill = async () => {
    const amount = Number(form.amount)
    if (!(amount > 0) || !form.description.trim()) return toastError('יש למלא תיאור וסכום')
    setBusy(true)
    const { error } = await supabase.from('vendor_bills').insert({
      building_id: buildingId, vendor_id: vendor.id, work_order_id: form.work_order_id || null,
      bill_date: form.bill_date || today(), due_date: form.due_date || null,
      doc_number: form.doc_number.trim() || null, description: form.description.trim(), amount,
    })
    setBusy(false)
    if (error) return toastError('השמירה נכשלה')
    toast('החשבון נרשם')
    setForm(null)
    onChange()
  }

  const markPaid = async () => {
    setBusy(true)
    const { error } = await supabase.from('vendor_bills').update({
      status: 'paid', paid_at: paying.paid_at || today(), paid_amount: Number(paying.paid_amount) || paying.amount,
      payment_method: paying.payment_method || null, payment_ref: paying.payment_ref?.trim() || null,
    }).eq('id', paying.id)
    setBusy(false)
    if (error) return toastError('העדכון נכשל')
    toast('סומן כשולם')
    setPaying(null)
    onChange()
  }

  const setStatus = async (b, status) => {
    const patch = status === 'open' ? { status, paid_at: null, paid_amount: null, payment_method: null, payment_ref: null } : { status }
    const { error } = await supabase.from('vendor_bills').update(patch).eq('id', b.id)
    if (error) return toastError('העדכון נכשל')
    onChange()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[['חויב', totals.billed], ['שולם', totals.paid], ['יתרה לתשלום', totals.open]].map(([label, v], i) => (
          <div key={label} className={cn('rounded-[var(--radius)] border border-[var(--border)] p-3', i === 2 && v > 0 && 'border-[var(--warning)]')}>
            <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
            <p className="text-[17px] font-semibold num-tabular">{formatCurrency(v)}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">רישום בלבד: הבניין משלם לספק ישירות. ועד1 לא מעבירה כסף ולא גובה עמלה.</p>

      {unbilled.length > 0 && !form && (
        <div className="rounded-[var(--radius)] bg-[var(--surface-secondary)] p-3 space-y-1.5">
          <p className="text-[12px] font-semibold">עבודות שהושלמו ועדיין אין עליהן חשבון</p>
          {unbilled.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="truncate">{w.title || 'עבודה'} · {formatCurrency(Number(w.actual_cost))}</span>
              <Button size="sm" variant="outline" onClick={() => setForm({ ...EMPTY_BILL, description: w.title || 'עבודה', amount: String(w.actual_cost), work_order_id: w.id })}>
                <Plus className="h-3.5 w-3.5" />רישום חשבון
              </Button>
            </div>
          ))}
        </div>
      )}

      {form ? (
        <div className="rounded-[var(--radius)] border border-[var(--primary)] p-3 space-y-2">
          <p className="text-[13px] font-semibold">חשבון חדש מהספק</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="תיאור" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-2" />
            <Input placeholder="סכום ₪" type="number" min="0" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Input placeholder="מס' חשבונית" dir="ltr" value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} />
            <label className="text-[11px] text-[var(--text-muted)] space-y-0.5"><span>תאריך החשבון</span>
              <Input type="date" value={form.bill_date || today()} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} /></label>
            <label className="text-[11px] text-[var(--text-muted)] space-y-0.5"><span>לתשלום עד (לא חובה)</span>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>ביטול</Button>
            <Button size="sm" onClick={saveBill} disabled={busy}>{busy ? 'שומר...' : 'שמירה'}</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setForm({ ...EMPTY_BILL })}><Plus className="h-4 w-4" />חשבון חדש</Button>
      )}

      {bills.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">אין עדיין חשבונות מהספק הזה.</p>
      ) : (
        <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
          {bills.map((b) => (
            <div key={b.id} className={cn('p-2.5 text-[13px]', b.status === 'cancelled' && 'opacity-50')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{b.description}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {fmtDate(b.bill_date)}{b.doc_number && <> · חשבונית {b.doc_number}</>}
                    {b.status === 'open' && b.due_date && <> · לתשלום עד {fmtDate(b.due_date)}</>}
                    {b.status === 'paid' && <> · שולם {fmtDate(b.paid_at)}{b.payment_method && <> · {PAY_LABEL[b.payment_method]}</>}{b.payment_ref && <> · {b.payment_ref}</>}</>}
                    {b.status === 'cancelled' && <> · בוטל</>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="num-tabular font-semibold">{formatCurrency(Number(b.amount))}</span>
                  {b.status === 'open' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPaying({ ...b, paid_at: today(), paid_amount: String(b.amount), payment_method: 'transfer', payment_ref: '' })}>
                        <Check className="h-3.5 w-3.5" />שולם
                      </Button>
                      <button className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)]" title="ביטול החשבון" onClick={() => setStatus(b, 'cancelled')}><X className="h-4 w-4" /></button>
                    </>
                  )}
                  {b.status !== 'open' && (
                    <button className="text-[11px] text-[var(--primary)]" onClick={() => setStatus(b, 'open')}>החזרה לפתוח</button>
                  )}
                </div>
              </div>
              {paying?.id === b.id && (
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-[var(--radius)] bg-[var(--surface-secondary)] p-2">
                  <Input type="date" value={paying.paid_at} onChange={(e) => setPaying({ ...paying, paid_at: e.target.value })} />
                  <Input type="number" dir="ltr" value={paying.paid_amount} onChange={(e) => setPaying({ ...paying, paid_amount: e.target.value })} />
                  <Select value={paying.payment_method} onChange={(e) => setPaying({ ...paying, payment_method: e.target.value })} options={PAY_METHODS} />
                  <Input placeholder="אסמכתא (לא חובה)" value={paying.payment_ref} onChange={(e) => setPaying({ ...paying, payment_ref: e.target.value })} />
                  <div className="col-span-2 flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setPaying(null)}>ביטול</Button>
                    <Button size="sm" onClick={markPaid} disabled={busy}>אישור תשלום</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
