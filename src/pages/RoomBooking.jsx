import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  CalendarDays, Plus, Trash2, Pencil, Sun, Moon, SunMoon,
  ChevronRight, ChevronLeft, ExternalLink, Check, X as XIcon,
  Users, UserPlus, Ban, Star, Settings, Calendar,
  DoorOpen, CreditCard, List, Clock, CheckCircle2,
  AlertCircle, HelpCircle, FileText, ShieldCheck,
} from 'lucide-react'

// ── Slot definitions ─────────────────────────────────────────────
const SLOTS = {
  morning:  { label: 'בוקר (08:00-14:00)',    short: 'בוקר 08-14',  icon: Sun,     color: 'amber' },
  evening:  { label: 'ערב (16:00-23:00)',     short: 'ערב 16-23',   icon: Moon,    color: 'indigo' },
  full_day: { label: 'יממה — שבת/חג (24 שעות)', short: 'יממה 24שע',  icon: SunMoon, color: 'purple' },
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

const STATUS_CONFIG = {
  pending:   { label: 'ממתין לאישור', dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200 text-amber-700' },
  approved:  { label: 'מאושר',       dot: 'bg-emerald-500',  text: 'text-emerald-700',  bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  rejected:  { label: 'נדחה',        dot: 'bg-red-500',      text: 'text-red-600',      bg: 'bg-red-50 border-red-200 text-red-600' },
  cancelled: { label: 'בוטל',        dot: 'bg-slate-400',    text: 'text-slate-600',    bg: 'bg-slate-50 border-slate-200 text-slate-600' },
}

// ── Helpers ──────────────────────────────────────────────────────
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'

// ═════════════════════════════════════════════════════════════════
export default function RoomBooking() {
  const { selectedBuilding } = useBuildingContext()
  const { profile } = useAuth()
  const { data: resources, create: createResource, update: updateResource, remove: removeResource, refresh: refreshResources } = useCollection('bookingResources')
  const { data: allBookings, create: createBooking, update: updateBooking, refresh: refreshBookings } = useCollection('bookings')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')

  // ── State ────────────────────────────────────────────────────
  const [tab, setTab] = useState('calendar')
  const [selectedResourceId, setSelectedResourceId] = useState(null)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState({})
  const [bookingDialog, setBookingDialog] = useState(null)
  const [bookingForm, setBookingForm] = useState({
    slot: 'evening', unitId: '', isGuest: false,
    bookerName: '', bookerPhone: '', bookerEmail: '',
    notes: '', answers: {}, termsAccepted: false,
  })
  const [resourceDialog, setResourceDialog] = useState(null)
  const [resourceForm, setResourceForm] = useState({})
  const [blockDate, setBlockDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentRedirect, setPaymentRedirect] = useState(null)
  const [approveDialog, setApproveDialog] = useState(null) // { bk } — booking being approved
  const [approveNotes, setApproveNotes] = useState('')
  // Custom questions editor
  const [questionText, setQuestionText] = useState('')
  const [questionType, setQuestionType] = useState('text')

  // ── Derived data ─────────────────────────────────────────────
  const buildingResources = useMemo(() =>
    resources.filter(r => r.building_id === selectedBuilding?.id && r.active !== false),
    [resources, selectedBuilding]
  )

  const selectedResource = useMemo(() =>
    buildingResources.find(r => r.id === selectedResourceId) || buildingResources[0] || null,
    [buildingResources, selectedResourceId]
  )

  useEffect(() => {
    if (!selectedResourceId && buildingResources.length > 0) {
      setSelectedResourceId(buildingResources[0].id)
    }
  }, [buildingResources, selectedResourceId])

  const buildingUnits = useMemo(() =>
    allUnits.filter(u => u.building_id === selectedBuilding?.id).sort((a, b) => {
      const na = parseInt(a.number) || 0, nb = parseInt(b.number) || 0
      return na - nb
    }),
    [allUnits, selectedBuilding]
  )

  // Primary resident per unit (residents link to building via unit_id, not building_id)
  const residentMap = useMemo(() => {
    const map = {}
    const unitIds = new Set(buildingUnits.map(u => u.id))
    // First pass: set any resident for units in this building
    allResidents.forEach(r => {
      if (!unitIds.has(r.unit_id)) return
      if (!map[r.unit_id]) {
        map[r.unit_id] = { name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), email: r.email, phone: r.phone }
      }
    })
    // Second pass: override with primary resident
    allResidents.forEach(r => {
      if (!unitIds.has(r.unit_id)) return
      if (r.is_primary) {
        map[r.unit_id] = { name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), email: r.email, phone: r.phone }
      }
    })
    return map
  }, [allResidents, buildingUnits])

  // Active bookings (not cancelled or rejected) — these block slots
  const activeBookings = useMemo(() => {
    if (!selectedResource) return []
    return allBookings.filter(b =>
      b.resource_id === selectedResource.id &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected'
    )
  }, [allBookings, selectedResource])

  // All bookings for list view (including cancelled/rejected for history)
  const allResourceBookings = useMemo(() => {
    if (!selectedResource) return []
    return allBookings
      .filter(b => b.resource_id === selectedResource.id)
      .sort((a, b) => new Date(b.booking_date) - new Date(a.booking_date))
  }, [allBookings, selectedResource])

  const bookingsByDate = useMemo(() => {
    const map = {}
    activeBookings.forEach(b => {
      const dk = b.booking_date
      if (!map[dk]) map[dk] = []
      map[dk].push(b)
    })
    return map
  }, [activeBookings])

  const blockedDates = useMemo(() => {
    if (!selectedResource) return new Set()
    return new Set(selectedResource.blocked_dates || [])
  }, [selectedResource])

  // ── HebCal holidays ─────────────────────────────────────────
  const fetchHolidays = useCallback(async (year, month) => {
    try {
      const res = await fetch(
        `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&year=${year}&month=${month + 1}&ss=on&mf=on&nx=on`
      )
      const data = await res.json()
      const hmap = {}
      ;(data.items || []).forEach(item => {
        if (!item.date) return
        const dk = item.date.substring(0, 10)
        if (!hmap[dk]) hmap[dk] = []
        hmap[dk].push({
          title: item.title, hebrew: item.hebrew,
          isYomTov: !!item.yomtov, category: item.category,
        })
      })
      setHolidays(hmap)
    } catch {
      setHolidays({})
    }
  }, [])

  useEffect(() => { fetchHolidays(calYear, calMonth) }, [calYear, calMonth, fetchHolidays])

  // ── Calendar grid ────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    const startDow = first.getDay()
    const days = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + (selectedResource?.max_advance_days || 30))

    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(calYear, calMonth, d)
      const dk = dateKey(date)
      const isSaturday = date.getDay() === 6
      const isFriday = date.getDay() === 5
      const dayHolidays = holidays[dk] || []
      const isYomTov = dayHolidays.some(h => h.isYomTov)
      const isShabbatOrChag = isSaturday || isYomTov
      const dayBookings = bookingsByDate[dk] || []
      const isBlocked = blockedDates.has(dk)
      const isPast = date < today
      const isTooFar = date > maxDate

      days.push({
        day: d, date, dk, isSaturday, isFriday, isYomTov, isShabbatOrChag,
        holidays: dayHolidays, bookings: dayBookings, isBlocked, isPast, isTooFar,
        hasMorning: dayBookings.some(b => b.slot === 'morning' || b.slot === 'full_day'),
        hasEvening: dayBookings.some(b => b.slot === 'evening' || b.slot === 'full_day'),
        hasFullDay: dayBookings.some(b => b.slot === 'full_day'),
      })
    }
    return days
  }, [calYear, calMonth, holidays, bookingsByDate, blockedDates, selectedResource])

  // ── Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = allResourceBookings.filter(b => b.status === 'pending').length
    const approved = allResourceBookings.filter(b => b.status === 'approved').length
    const thisMonth = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthBk = allResourceBookings.filter(b =>
      b.booking_date?.startsWith(thisMonth) && (b.status === 'pending' || b.status === 'approved')
    )
    const revenue = monthBk.reduce((s, b) => s + (Number(b.price) || 0), 0)
    return { pending, approved, monthCount: monthBk.length, revenue }
  }, [allResourceBookings, calYear, calMonth])

  // ── Email helper ─────────────────────────────────────────────
  const sendEmail = async (to, subject, html) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token || !to) return
      fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ to, subject, html, buildingId: selectedBuilding?.id }),
      }).catch(() => {})
    } catch {}
  }

  const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  const buildEmailHtml = (resource, booking, statusMessage, { showPayment = false, unitNumber = '', approvalLink = '', approvalNotes = '', buildingName = '' } = {}) => {
    const bookingDate = new Date(booking.booking_date || booking.dk)
    const dateStr = bookingDate.toLocaleDateString('he-IL')
    const dayName = HEBREW_DAYS[bookingDate.getDay()]
    const slotLabel = SLOTS[booking.slot]?.label || booking.slot
    const td = `style="padding:10px;border-bottom:1px solid #e2e8f0;"`
    const th = `style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;width:120px;"`
    return `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">שריון ${resource.name}</h2>
          ${buildingName ? `<p style="margin:4px 0 0;opacity:0.75;font-size:14px;">${buildingName}</p>` : ''}
          <p style="margin:8px 0 0;opacity:0.9;">${statusMessage}</p>
        </div>
        <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td ${th}>בניין</td><td ${td}>${buildingName || ''}</td></tr>
            <tr><td ${th}>תאריך</td><td ${td}>יום ${dayName}, ${dateStr}</td></tr>
            <tr><td ${th}>משבצת</td><td ${td}>${slotLabel}</td></tr>
            <tr><td ${th}>שם המזמין</td><td ${td}>${booking.booker_name || booking.bookerName || ''}</td></tr>
            ${unitNumber ? `<tr><td ${th}>דירה</td><td ${td}>${unitNumber}</td></tr>` : ''}
            ${booking.booker_phone || booking.bookerPhone ? `<tr><td ${th}>טלפון</td><td ${td}>${booking.booker_phone || booking.bookerPhone}</td></tr>` : ''}
            ${booking.is_guest || booking.isGuest ? `<tr><td ${th}>סוג</td><td ${td}>אורח חיצוני</td></tr>` : ''}
            ${(booking.price || 0) > 0 ? `<tr><td ${th}>מחיר</td><td ${td}>${formatCurrency(booking.price)}</td></tr>` : ''}
            ${booking.notes ? `<tr><td ${th}>הערות</td><td ${td}>${booking.notes}</td></tr>` : ''}
          </table>
          ${approvalNotes ? `<div style="margin-top:16px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;"><strong style="color:#1e40af;">הנחיות:</strong><p style="margin:6px 0 0;color:#1e3a5f;white-space:pre-line;">${approvalNotes.replace(/\n/g, '<br>')}</p></div>` : ''}
          ${showPayment && resource.payment_url && (booking.price || 0) > 0 ? `<div style="text-align:center;margin-top:16px;"><a href="${resource.payment_url}" style="display:inline-block;padding:12px 32px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">לתשלום</a></div>` : ''}
          ${approvalLink ? `<div style="text-align:center;margin-top:16px;"><a href="${approvalLink}" style="display:inline-block;padding:12px 32px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">כניסה לאישור/דחייה</a></div>` : ''}
        </div>
      </div>
    `
  }

  // ── Handlers ─────────────────────────────────────────────────
  const handleOpenBooking = (dayObj) => {
    if (!dayObj || dayObj.isPast || dayObj.isBlocked || dayObj.isTooFar) return
    // Default slot: if Shabbat/holiday, default to full_day; otherwise evening
    const defaultSlot = dayObj.isShabbatOrChag ? 'full_day' : 'evening'
    setBookingForm({
      slot: defaultSlot, unitId: '', isGuest: false,
      bookerName: '', bookerPhone: '', bookerEmail: '',
      notes: '', answers: {}, termsAccepted: false,
    })
    setBookingDialog(dayObj)
  }

  const getSlotPrice = (slot) => {
    if (!selectedResource) return 0
    if (slot === 'morning') return Number(selectedResource.price_morning) || 0
    if (slot === 'evening') return Number(selectedResource.price_evening) || 0
    if (slot === 'full_day') return Number(selectedResource.price_full_day) || 0
    return 0
  }

  const isSlotAvailable = (dayObj, slot) => {
    if (!dayObj) return false
    // Full day only on Shabbat/Chag
    if (slot === 'full_day' && !dayObj.isShabbatOrChag) return false
    if (slot === 'full_day') return !dayObj.hasMorning && !dayObj.hasEvening && !dayObj.hasFullDay
    if (slot === 'morning') return !dayObj.hasMorning && !dayObj.hasFullDay
    if (slot === 'evening') return !dayObj.hasEvening && !dayObj.hasFullDay
    return true
  }

  const handleSubmitBooking = async () => {
    if (!selectedResource || !bookingDialog) return
    const { slot, unitId, isGuest, bookerName, bookerPhone, bookerEmail, notes, answers, termsAccepted } = bookingForm

    // Validation
    let name = bookerName, email = bookerEmail, phone = bookerPhone
    if (!isGuest && unitId) {
      const res = residentMap[unitId]
      if (res) { name = name || res.name; email = email || res.email || ''; phone = phone || res.phone || '' }
    }
    if (!name) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש לבחור דירה או למלא שם', type: 'error' } }))
      return
    }
    // Check rental terms
    if (selectedResource.rental_terms && !termsAccepted) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש לאשר את תנאי ההשכרה', type: 'error' } }))
      return
    }
    // Check required custom questions
    const questions = selectedResource.custom_questions || []
    for (const q of questions) {
      if (q.required && !answers[q.id]) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `יש למלא: ${q.text}`, type: 'error' } }))
        return
      }
    }

    setSaving(true)
    try {
      const price = getSlotPrice(slot)
      const bookingData = {
        building_id: selectedBuilding.id,
        resource_id: selectedResource.id,
        unit_id: isGuest ? null : unitId || null,
        booker_name: name,
        booker_phone: phone,
        booker_email: email,
        booking_date: bookingDialog.dk,
        slot,
        status: 'pending',   // Always starts as pending
        payment_status: 'pending',
        price,
        notes,
        is_guest: isGuest,
        answers: answers,
        terms_accepted: termsAccepted,
      }

      await createBooking(bookingData)

      // Email to booker — pending approval
      const unitNum = isGuest ? '' : (buildingUnits.find(u => u.id === unitId)?.number || '')
      const bldName = selectedBuilding?.name || ''
      const pendingHtml = buildEmailHtml(selectedResource, { ...bookingData, dk: bookingDialog.dk }, 'השריון שלך התקבל וממתין לאישור נציג הוועד. תקבל עדכון במייל כאשר השריון יאושר או יידחה.', { unitNumber: unitNum, buildingName: bldName })
      if (email) await sendEmail(email, `שריון ${selectedResource.name} — ממתין לאישור`, pendingHtml)
      // Email to vaad rep
      if (selectedResource.notify_email) {
        const vaadHtml = buildEmailHtml(selectedResource, { ...bookingData, dk: bookingDialog.dk }, 'שריון חדש ממתין לאישורך. היכנס למערכת לאישור או דחייה.', { unitNumber: unitNum, approvalLink: `${window.location.origin}/room-booking`, buildingName: bldName })
        await sendEmail(selectedResource.notify_email, `שריון חדש ממתין לאישור: ${selectedResource.name}`, vaadHtml)
      }

      setBookingDialog(null)
      refreshBookings()

      // Redirect to payment immediately
      if (selectedResource.payment_url) {
        setPaymentRedirect({ url: selectedResource.payment_url })
      } else {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון נשלח — ממתין לאישור הוועד', type: 'success' } }))
      }
    } catch (err) {
      console.error(err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה ביצירת השריון', type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  // Vaad approves a booking — opens notes dialog first
  const openApproveDialog = (bk) => {
    setApproveNotes('')
    setApproveDialog(bk)
  }

  const handleApprove = async (bk, notes = '') => {
    try {
      await updateBooking(bk.id, { status: 'approved' })
      await refreshBookings()
      if (bk.booker_email) {
        const unitNum = buildingUnits.find(u => u.id === bk.unit_id)?.number || ''
        // Combine fixed approval message from resource settings + one-time notes
        const fixedMsg = selectedResource?.approval_message || ''
        const allNotes = [fixedMsg, notes].filter(Boolean).join('\n')
        const html = buildEmailHtml(selectedResource, bk, 'השריון שלך אושר! להלן פרטי ההשכרה הסופיים.', { showPayment: true, unitNumber: unitNum, approvalNotes: allNotes, buildingName: selectedBuilding?.name || '' })
        sendEmail(bk.booker_email, `שריון מאושר: ${selectedResource?.name}`, html)
      }
      setApproveDialog(null)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון אושר', type: 'success' } }))
    } catch (err) {
      console.error('Approve failed:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `שגיאה באישור: ${err.message}`, type: 'error' } }))
    }
  }

  // Vaad rejects a booking — slot freed
  const handleReject = async (bk) => {
    try {
      await updateBooking(bk.id, { status: 'rejected' })
      await refreshBookings()
      const unitNumR = buildingUnits.find(u => u.id === bk.unit_id)?.number || ''
      const bldNameR = selectedBuilding?.name || ''
      if (bk.booker_email) {
        sendEmail(bk.booker_email, `שריון נדחה: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, 'לצערנו, השריון שלך נדחה על ידי נציג הוועד.', { unitNumber: unitNumR, buildingName: bldNameR }))
      }
      // Notify vaad rep about rejection
      if (selectedResource?.notify_email) {
        sendEmail(selectedResource.notify_email, `שריון נדחה: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `השריון של ${bk.booker_name} נדחה.`, { unitNumber: unitNumR, buildingName: bldNameR }))
      }
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון נדחה — המשבצת שוחררה', type: 'success' } }))
    } catch (err) {
      console.error('Reject failed:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `שגיאה בדחייה: ${err.message}`, type: 'error' } }))
    }
  }

  // Cancel an approved/pending booking — slot freed
  const handleCancel = async (bk) => {
    try {
      await updateBooking(bk.id, { status: 'cancelled' })
      await refreshBookings()
      const unitNumC = buildingUnits.find(u => u.id === bk.unit_id)?.number || ''
      const bldNameC = selectedBuilding?.name || ''
      if (bk.booker_email) {
        sendEmail(bk.booker_email, `שריון בוטל: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, 'השריון בוטל. המשבצת שוחררה.', { unitNumber: unitNumC, buildingName: bldNameC }))
      }
      // Notify vaad rep about cancellation
      if (selectedResource?.notify_email) {
        sendEmail(selectedResource.notify_email, `שריון בוטל: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `השריון של ${bk.booker_name} בוטל. המשבצת שוחררה.`, { unitNumber: unitNumC, buildingName: bldNameC }))
      }
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון בוטל — המשבצת שוחררה', type: 'success' } }))
    } catch (err) {
      console.error('Cancel failed:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `שגיאה בביטול: ${err.message}`, type: 'error' } }))
    }
  }

  // ── Resource CRUD ────────────────────────────────────────────
  const openResourceForm = (resource) => {
    if (resource === 'new') {
      setResourceForm({
        name: '', description: '', price_morning: 0, price_evening: 0, price_full_day: 0,
        payment_url: '', max_advance_days: 30, residents_only: true, notify_email: '',
        custom_questions: [], rental_terms: '', approval_message: '',
      })
    } else {
      setResourceForm({ ...resource, custom_questions: resource.custom_questions || [], rental_terms: resource.rental_terms || '', approval_message: resource.approval_message || '' })
    }
    setResourceDialog(resource)
  }

  const handleSaveResource = async () => {
    setSaving(true)
    try {
      const data = {
        building_id: selectedBuilding.id,
        name: resourceForm.name,
        description: resourceForm.description || '',
        price_morning: Number(resourceForm.price_morning) || 0,
        price_evening: Number(resourceForm.price_evening) || 0,
        price_full_day: Number(resourceForm.price_full_day) || 0,
        payment_url: resourceForm.payment_url || '',
        max_advance_days: Number(resourceForm.max_advance_days) || 30,
        residents_only: resourceForm.residents_only !== false,
        notify_email: resourceForm.notify_email || '',
        custom_questions: resourceForm.custom_questions || [],
        rental_terms: resourceForm.rental_terms || '',
        approval_message: resourceForm.approval_message || '',
      }
      if (resourceDialog === 'new') {
        data.blocked_dates = []; data.active = true
        const created = await createResource(data)
        setSelectedResourceId(created?.id)
      } else {
        await updateResource(resourceDialog.id, data)
      }
      setResourceDialog(null); refreshResources()
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'נשמר בהצלחה', type: 'success' } }))
    } catch {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירה', type: 'error' } }))
    } finally { setSaving(false) }
  }

  const handleDeleteResource = async (id) => {
    await removeResource(id); refreshResources()
    if (selectedResourceId === id) setSelectedResourceId(null)
  }

  const handleBlockDate = async () => {
    if (!blockDate || !selectedResource) return
    const current = selectedResource.blocked_dates || []
    if (current.includes(blockDate)) return
    await updateResource(selectedResource.id, { blocked_dates: [...current, blockDate] })
    setBlockDate(''); refreshResources()
  }

  const handleUnblockDate = async (dateStr) => {
    if (!selectedResource) return
    const current = selectedResource.blocked_dates || []
    await updateResource(selectedResource.id, { blocked_dates: current.filter(d => d !== dateStr) })
    refreshResources()
  }

  // Custom questions management
  const addQuestion = () => {
    if (!questionText.trim()) return
    const qs = [...(resourceForm.custom_questions || [])]
    qs.push({ id: `q_${Date.now()}`, text: questionText.trim(), type: questionType, required: true })
    setResourceForm(f => ({ ...f, custom_questions: qs }))
    setQuestionText(''); setQuestionType('text')
  }
  const removeQuestion = (id) => {
    setResourceForm(f => ({ ...f, custom_questions: (f.custom_questions || []).filter(q => q.id !== id) }))
  }

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════
  if (!selectedBuilding) {
    return <EmptyState icon={DoorOpen} title="בחר בניין" description="יש לבחור בניין כדי לנהל שריונים" />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DoorOpen} iconColor="violet"
        title="שריון חדרים"
        subtitle="הזמנת חדר דיירים, גג או מתקנים — כולל אישור ועד ותשלום"
        actions={
          <Button onClick={() => openResourceForm('new')} className="gap-2">
            <Plus className="h-4 w-4" /> חדר חדש
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--surface-hover)] p-1 rounded-xl w-fit">
        {[
          { key: 'calendar', label: 'לוח שריונים', icon: Calendar },
          { key: 'bookings', label: 'ניהול שריונים', icon: ShieldCheck },
          { key: 'settings', label: 'הגדרות', icon: Settings },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${
              tab === t.key
                ? 'bg-white text-[var(--text-primary)] shadow-sm font-medium'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.key === 'bookings' && stats.pending > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{stats.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Resource selector */}
      {buildingResources.length > 0 && tab !== 'settings' && (
        <div className="flex gap-2 flex-wrap">
          {buildingResources.map(r => (
            <button
              key={r.id} onClick={() => setSelectedResourceId(r.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedResourceId === r.id
                  ? 'bg-violet-100 text-violet-800 border-2 border-violet-300 shadow-sm'
                  : 'bg-white border-2 border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-200'
              }`}
            >
              <DoorOpen className="h-4 w-4 inline-block ml-1.5" />{r.name}
            </button>
          ))}
        </div>
      )}

      {buildingResources.length === 0 && tab !== 'settings' && (
        <EmptyState icon={DoorOpen} title="אין חדרים מוגדרים" description="הוסף חדר או מתקן בהגדרות"
          action={<Button onClick={() => { setTab('settings'); openResourceForm('new') }} className="gap-2"><Plus className="h-4 w-4" />הוסף חדר</Button>}
        />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CALENDAR TAB                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'calendar' && selectedResource && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'ממתינים לאישור', value: stats.pending, icon: Clock, gradient: 'from-amber-500 to-amber-600', color: 'text-amber-600' },
              { label: 'מאושרים', value: stats.approved, icon: CheckCircle2, gradient: 'from-emerald-500 to-emerald-600', color: 'text-emerald-600' },
              { label: 'שריונים החודש', value: stats.monthCount, icon: CalendarDays, gradient: 'from-violet-500 to-violet-600', color: 'text-violet-600' },
              { label: 'הכנסות החודש', value: formatCurrency(stats.revenue), icon: CreditCard, gradient: 'from-blue-500 to-blue-600', color: 'text-blue-600' },
            ].map((s, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-sm`}>
                      <s.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]"><ChevronRight className="h-5 w-5" /></button>
            <h3 className="text-lg font-bold">{HEBREW_MONTHS[calMonth]} {calYear}</h3>
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]"><ChevronLeft className="h-5 w-5" /></button>
          </div>

          {/* Calendar grid */}
          <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-[var(--border)]">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`text-center py-2.5 text-xs font-bold ${i === 6 ? 'text-blue-600 bg-blue-50/50' : 'text-[var(--text-secondary)]'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="min-h-[90px] border-b border-l border-[var(--border)] bg-slate-50/50" />
                const isToday = isSameDay(day.date, new Date())
                const canBook = !day.isPast && !day.isBlocked && !day.isTooFar && !day.hasFullDay
                const holidayName = day.holidays[0]?.hebrew
                const pendingBookings = day.bookings.filter(b => b.status === 'pending')
                const approvedBookings = day.bookings.filter(b => b.status === 'approved')

                return (
                  <div
                    key={day.dk} onClick={() => canBook && handleOpenBooking(day)}
                    className={`min-h-[90px] border-b border-l border-[var(--border)] p-1.5 transition-all relative ${
                      day.isBlocked ? 'bg-red-50/60 cursor-not-allowed'
                      : day.isPast || day.isTooFar ? 'bg-slate-50/50 cursor-not-allowed opacity-60'
                      : day.isShabbatOrChag ? 'bg-blue-50/40 cursor-pointer hover:bg-blue-50'
                      : canBook ? 'bg-white cursor-pointer hover:bg-violet-50/40' : 'bg-amber-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold leading-none ${
                        isToday ? 'bg-violet-600 text-white w-7 h-7 rounded-full flex items-center justify-center'
                        : day.isSaturday ? 'text-blue-600' : 'text-[var(--text-primary)]'
                      }`}>{day.day}</span>
                      {day.isBlocked && <Ban className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                    {holidayName && (
                      <p className={`text-[9px] leading-tight truncate mb-1 ${day.isYomTov ? 'text-blue-700 font-bold' : 'text-blue-500'}`}>
                        {day.isYomTov && <Star className="h-2.5 w-2.5 inline ml-0.5" />}{holidayName}
                      </p>
                    )}
                    {day.isSaturday && !holidayName && <p className="text-[9px] text-blue-500 mb-1">שבת</p>}

                    <div className="flex flex-wrap gap-0.5 mt-auto">
                      {day.hasFullDay && <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">יממה 24שע</span>}
                      {!day.hasFullDay && day.hasMorning && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">08-14</span>}
                      {!day.hasFullDay && day.hasEvening && <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">16-23</span>}
                      {pendingBookings.length > 0 && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-50 text-amber-600">
                        <Clock className="h-2.5 w-2.5 inline" />
                      </span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-[var(--border)]" /> פנוי</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100" /> בוקר 08:00-14:00</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-100" /> ערב 16:00-23:00</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-100" /> יממה 24 שעות</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-50 border border-blue-200" /> שבת / חג</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> חסום</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-amber-500" /> ממתין לאישור</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* BOOKINGS MANAGEMENT TAB                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'bookings' && selectedResource && (
        <div className="space-y-4">
          {/* Pending approvals section */}
          {(() => {
            const pendingList = allResourceBookings.filter(b => b.status === 'pending')
            if (pendingList.length === 0) return null
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-amber-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> ממתינים לאישור ({pendingList.length})
                </h3>
                {pendingList.map(bk => (
                  <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap}
                    onApprove={() => openApproveDialog(bk)} onReject={() => handleReject(bk)} onCancel={() => handleCancel(bk)}
                    showActions="approve" />
                ))}
              </div>
            )
          })()}

          {/* Approved section */}
          {(() => {
            const approvedList = allResourceBookings.filter(b => b.status === 'approved')
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> מאושרים ({approvedList.length})
                </h3>
                {approvedList.length === 0
                  ? <p className="text-sm text-[var(--text-muted)] pr-6">אין שריונים מאושרים</p>
                  : approvedList.map(bk => (
                    <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap}
                      onCancel={() => handleCancel(bk)} showActions="cancel" />
                  ))
                }
              </div>
            )
          })()}

          {/* History (rejected + cancelled) */}
          {(() => {
            const historyList = allResourceBookings.filter(b => b.status === 'rejected' || b.status === 'cancelled')
            if (historyList.length === 0) return null
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-500 flex items-center gap-2">
                  <List className="h-4 w-4" /> היסטוריה ({historyList.length})
                </h3>
                {historyList.map(bk => (
                  <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap} showActions="none" />
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SETTINGS TAB                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">חדרים ומתקנים</h3>
              <Button onClick={() => openResourceForm('new')} variant="outline" className="gap-2"><Plus className="h-4 w-4" />הוסף</Button>
            </div>
            {resources.filter(r => r.building_id === selectedBuilding?.id).map(r => (
              <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-sm">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <div className="flex gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                    <span>בוקר: {formatCurrency(r.price_morning)}</span>
                    <span>ערב: {formatCurrency(r.price_evening)}</span>
                    <span>יממה: {formatCurrency(r.price_full_day)}</span>
                    <span>{r.residents_only ? 'דיירים בלבד' : 'דיירים + אורחים'}</span>
                    {(r.custom_questions || []).length > 0 && <span>{(r.custom_questions || []).length} שאלות</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openResourceForm(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteResource(r.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                </div>
              </div>
            ))}
          </div>

          {/* Blocked dates */}
          {selectedResource && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold">ימים חסומים — {selectedResource.name}</h3>
              <div className="flex gap-2 items-end">
                <FormField label="תאריך לחסימה" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="w-48" />
                <Button onClick={handleBlockDate} disabled={!blockDate} className="gap-2"><Ban className="h-4 w-4" />חסום</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedResource.blocked_dates || []).sort().map(d => (
                  <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                    {new Date(d).toLocaleDateString('he-IL')}
                    <button onClick={() => handleUnblockDate(d)} className="hover:text-red-900"><XIcon className="h-3 w-3" /></button>
                  </span>
                ))}
                {(selectedResource.blocked_dates || []).length === 0 && <p className="text-sm text-[var(--text-muted)]">אין ימים חסומים</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* BOOKING DIALOG                                            */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-violet-500" />
              שריון {selectedResource?.name}
            </DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-4 mt-2">
              {/* Date */}
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-center">
                <p className="text-lg font-bold text-violet-800">
                  {new Date(bookingDialog.dk).toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {bookingDialog.holidays?.[0]?.hebrew && (
                  <p className="text-sm text-violet-600 mt-0.5"><Star className="h-3.5 w-3.5 inline ml-1" />{bookingDialog.holidays[0].hebrew}</p>
                )}
              </div>

              {/* Slot selection */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">משבצת זמן</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(SLOTS).map(([key, slot]) => {
                    const available = isSlotAvailable(bookingDialog, key)
                    const isSelected = bookingForm.slot === key
                    const SlotIcon = slot.icon
                    const isFullDayRestricted = key === 'full_day' && !bookingDialog.isShabbatOrChag
                    return (
                      <button
                        key={key} disabled={!available}
                        onClick={() => setBookingForm(f => ({ ...f, slot: key }))}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          !available ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                          : isSelected ? 'border-violet-400 bg-violet-50 text-violet-800 shadow-sm'
                          : 'border-[var(--border)] hover:border-violet-200'
                        }`}
                      >
                        <SlotIcon className={`h-5 w-5 mx-auto mb-1 ${isSelected ? 'text-violet-600' : ''}`} />
                        <p className="text-xs font-medium">{slot.short}</p>
                        <p className="text-[10px] mt-0.5">{formatCurrency(getSlotPrice(key))}</p>
                        {isFullDayRestricted && <p className="text-[9px] text-blue-400">שבת/חג בלבד</p>}
                        {!available && !isFullDayRestricted && <p className="text-[9px] text-red-400">תפוס</p>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Guest / Resident toggle */}
              {!selectedResource?.residents_only && (
                <div className="flex gap-2">
                  <button onClick={() => setBookingForm(f => ({ ...f, isGuest: false }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 text-sm ${
                      !bookingForm.isGuest ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}><Users className="h-4 w-4" />דייר</button>
                  <button onClick={() => setBookingForm(f => ({ ...f, isGuest: true }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 text-sm ${
                      bookingForm.isGuest ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}><UserPlus className="h-4 w-4" />אורח</button>
                </div>
              )}

              {/* Resident selector — pulls primary resident name automatically */}
              {!bookingForm.isGuest && (
                <FormSelect
                  label="בחר דירה (שם הדייר הראשי)"
                  value={bookingForm.unitId}
                  onChange={(e) => {
                    const uid = e.target.value
                    const res = residentMap[uid]
                    setBookingForm(f => ({
                      ...f, unitId: uid,
                      bookerName: res?.name || '', bookerPhone: res?.phone || '', bookerEmail: res?.email || '',
                    }))
                  }}
                  options={[
                    { value: '', label: 'בחר דירה...' },
                    ...buildingUnits.map(u => ({
                      value: u.id,
                      label: `דירה ${u.number} — ${residentMap[u.id]?.name || 'ללא דייר'}`,
                    }))
                  ]}
                />
              )}

              {/* Auto-filled resident info or guest fields */}
              {bookingForm.isGuest ? (
                <>
                  <FormField label="שם מלא" value={bookingForm.bookerName} onChange={(e) => setBookingForm(f => ({ ...f, bookerName: e.target.value }))} placeholder="שם האורח" />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="טלפון" value={bookingForm.bookerPhone} onChange={(e) => setBookingForm(f => ({ ...f, bookerPhone: e.target.value }))} placeholder="050-1234567" />
                    <FormField label="אימייל" value={bookingForm.bookerEmail} onChange={(e) => setBookingForm(f => ({ ...f, bookerEmail: e.target.value }))} placeholder="email@example.com" />
                  </div>
                </>
              ) : bookingForm.unitId && (
                <div className="p-3 rounded-xl bg-slate-50 border border-[var(--border)] text-sm">
                  <p className="font-medium">{bookingForm.bookerName}</p>
                  <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-1">
                    {bookingForm.bookerPhone && <span>{bookingForm.bookerPhone}</span>}
                    {bookingForm.bookerEmail && <span>{bookingForm.bookerEmail}</span>}
                  </div>
                </div>
              )}

              {/* Custom questions */}
              {(selectedResource?.custom_questions || []).length > 0 && (
                <div className="space-y-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                  <p className="text-xs font-bold text-blue-700 flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />שאלות נוספות</p>
                  {(selectedResource.custom_questions || []).map(q => (
                    <div key={q.id}>
                      {q.type === 'boolean' ? (
                        <FormBool
                          label={`${q.text}${q.required ? ' *' : ''}`}
                          value={bookingForm.answers[q.id] || false}
                          onChange={(e) => setBookingForm(f => ({ ...f, answers: { ...f.answers, [q.id]: e.target.value } }))}
                        />
                      ) : (
                        <FormField
                          label={`${q.text}${q.required ? ' *' : ''}`}
                          type={q.type === 'number' ? 'number' : 'text'}
                          value={bookingForm.answers[q.id] || ''}
                          onChange={(e) => setBookingForm(f => ({ ...f, answers: { ...f.answers, [q.id]: e.target.value } }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <FormTextarea label="הערות" value={bookingForm.notes} onChange={(e) => setBookingForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות נוספות..." />

              {/* Rental terms agreement */}
              {selectedResource?.rental_terms && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-[var(--border)]">
                  <p className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1"><FileText className="h-3.5 w-3.5" />תנאי השכרה</p>
                  <div className="text-xs text-[var(--text-muted)] whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                    {selectedResource.rental_terms}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={bookingForm.termsAccepted}
                      onChange={(e) => setBookingForm(f => ({ ...f, termsAccepted: e.target.checked }))}
                      className="w-4 h-4 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm font-medium text-[var(--text-primary)]">קראתי ואני מאשר/ת את תנאי ההשכרה</span>
                  </label>
                </div>
              )}

              {/* Price */}
              {getSlotPrice(bookingForm.slot) > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="text-sm text-emerald-700 font-medium">עלות:</span>
                  <span className="text-lg font-bold text-emerald-700">{formatCurrency(getSlotPrice(bookingForm.slot))}</span>
                </div>
              )}

              {/* Info about approval */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  השריון ייחסם מיידית אך דורש אישור נציג הוועד. תקבל/י מייל עם עדכון הסטטוס.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSubmitBooking} disabled={saving} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />{saving ? 'שולח...' : 'שלח לאישור'}
                </Button>
                <Button variant="outline" onClick={() => setBookingDialog(null)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RESOURCE FORM DIALOG                                      */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!resourceDialog} onOpenChange={() => setResourceDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{resourceDialog === 'new' ? 'הוסף חדר / מתקן' : 'ערוך חדר / מתקן'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FormField label="שם החדר / מתקן" value={resourceForm.name || ''} onChange={(e) => setResourceForm(f => ({ ...f, name: e.target.value }))} placeholder='למשל: חדר דיירים, גג, מועדון' />
            <FormTextarea label="תיאור" value={resourceForm.description || ''} onChange={(e) => setResourceForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור המקום, כללי שימוש..." />

            <div className="grid grid-cols-3 gap-3">
              <FormField label="מחיר בוקר" type="number" value={resourceForm.price_morning ?? 0} onChange={(e) => setResourceForm(f => ({ ...f, price_morning: e.target.value }))} />
              <FormField label="מחיר ערב" type="number" value={resourceForm.price_evening ?? 0} onChange={(e) => setResourceForm(f => ({ ...f, price_evening: e.target.value }))} />
              <FormField label="מחיר יממה" type="number" value={resourceForm.price_full_day ?? 0} onChange={(e) => setResourceForm(f => ({ ...f, price_full_day: e.target.value }))} />
            </div>

            <FormField label="קישור לתשלום (PayBox / Bit)" value={resourceForm.payment_url || ''} onChange={(e) => setResourceForm(f => ({ ...f, payment_url: e.target.value }))} placeholder="https://paybox.co/..." />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="ימים מראש (מקסימום)" type="number" value={resourceForm.max_advance_days ?? 30} onChange={(e) => setResourceForm(f => ({ ...f, max_advance_days: e.target.value }))} />
              <FormBool label="דיירים בלבד?" value={resourceForm.residents_only} onChange={(e) => setResourceForm(f => ({ ...f, residents_only: e.target.value }))} />
            </div>

            <FormField label="אימייל נציג ועד (לאישור והתראות)" value={resourceForm.notify_email || ''} onChange={(e) => setResourceForm(f => ({ ...f, notify_email: e.target.value }))} placeholder="vaad@building.co.il" />

            {/* Rental terms */}
            <FormTextarea
              label="תנאי השכרה (יוצגו לדייר לאישור)"
              value={resourceForm.rental_terms || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, rental_terms: e.target.value }))}
              placeholder="פרטי הכללים, שעות, אחריות, ניקיון, ציוד..."
            />

            {/* Fixed approval message */}
            <FormTextarea
              label="הנחיות קבועות לאחר אישור (יישלחו בכל מייל אישור)"
              value={resourceForm.approval_message || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, approval_message: e.target.value }))}
              placeholder="למשל: יש להחזיר מפתח עד 23:00, לנקות בסיום, לא לחנות בכניסה..."
            />

            {/* Custom questions */}
            <div className="space-y-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100">
              <p className="text-sm font-bold text-blue-700 flex items-center gap-1">
                <HelpCircle className="h-4 w-4" />שאלות בטופס השריון
              </p>
              {(resourceForm.custom_questions || []).map((q, idx) => (
                <div key={q.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-blue-100">
                  <span className="text-xs text-blue-600 font-bold w-5">{idx + 1}.</span>
                  <span className="flex-1 text-sm">{q.text}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                    {q.type === 'text' ? 'טקסט' : q.type === 'number' ? 'מספר' : 'כן/לא'}
                  </span>
                  <button onClick={() => removeQuestion(q.id)} className="text-red-400 hover:text-red-600"><XIcon className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 items-end">
                <FormField label="שאלה חדשה" value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder='למשל: כמה אורחים?' className="flex-1" />
                <FormSelect label="סוג" value={questionType} onChange={(e) => setQuestionType(e.target.value)}
                  options={[{ value: 'text', label: 'טקסט' }, { value: 'number', label: 'מספר' }, { value: 'boolean', label: 'כן/לא' }]}
                  className="w-24"
                />
                <Button onClick={addQuestion} disabled={!questionText.trim()} size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" />הוסף</Button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveResource} disabled={saving || !resourceForm.name} className="flex-1">
                {saving ? 'שומר...' : 'שמור'}
              </Button>
              <Button variant="outline" onClick={() => setResourceDialog(null)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* APPROVE WITH NOTES DIALOG                                 */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-emerald-500" />אישור שריון</DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                <p><strong>{approveDialog.booker_name}</strong> — {new Date(approveDialog.booking_date).toLocaleDateString('he-IL')} — {SLOTS[approveDialog.slot]?.short || approveDialog.slot}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">הערות לדייר (יישלחו במייל האישור)</label>
                <textarea
                  value={approveNotes}
                  onChange={e => setApproveNotes(e.target.value)}
                  placeholder="למשל: יש להחזיר מפתח עד 23:00, לא לחנות בכניסה..."
                  className="w-full h-24 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  dir="rtl"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleApprove(approveDialog, approveNotes)} className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  <Check className="h-4 w-4" />אשר ושלח
                </Button>
                <Button onClick={() => setApproveDialog(null)} variant="outline" className="gap-1.5">
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PAYMENT REDIRECT DIALOG                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!paymentRedirect} onOpenChange={() => setPaymentRedirect(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-500" />תשלום</DialogTitle>
          </DialogHeader>
          {paymentRedirect && (
            <div className="space-y-4 mt-2 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mx-auto shadow-lg">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <p className="text-lg font-bold">השריון נשלח לאישור!</p>
              <p className="text-sm text-[var(--text-secondary)]">יש לבצע תשלום כדי להשלים את התהליך</p>
              <Button onClick={() => { window.open(paymentRedirect.url, '_blank'); setPaymentRedirect(null) }} className="w-full gap-2">
                <ExternalLink className="h-4 w-4" />לתשלום
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// Booking Card Component
// ═════════════════════════════════════════════════════════════════
function BookingCard({ bk, resource, residentMap, onApprove, onReject, onCancel, showActions }) {
  const slotInfo = SLOTS[bk.slot] || SLOTS.evening
  const SlotIcon = slotInfo.icon
  const statusCfg = STATUS_CONFIG[bk.status] || STATUS_CONFIG.pending
  const isPast = new Date(bk.booking_date) < new Date(new Date().setHours(0, 0, 0, 0))
  const unit = bk.unit_id ? residentMap?.[bk.unit_id] : null
  const questions = resource?.custom_questions || []
  const answers = bk.answers || {}

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md transition-all ${
      bk.status === 'cancelled' || bk.status === 'rejected' ? 'opacity-60' : ''
    }`}>
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-${slotInfo.color}-500 to-${slotInfo.color}-600 flex items-center justify-center text-white shadow-sm shrink-0`}>
          <SlotIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold">{bk.booker_name}</span>
            {bk.is_guest && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">אורח</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCfg.bg}`}>{statusCfg.label}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{new Date(bk.booking_date).toLocaleDateString('he-IL')}</span>
            <span>{slotInfo.short}</span>
            {bk.booker_phone && <span>{bk.booker_phone}</span>}
            {unit && <span>דירה {unit.name}</span>}
          </div>
        </div>

        {bk.price > 0 && <span className="text-sm font-bold text-emerald-600">{formatCurrency(bk.price)}</span>}

        {/* Payment status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${bk.payment_status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={`text-[11px] ${bk.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {bk.payment_status === 'paid' ? 'שולם' : 'ממתין'}
          </span>
        </div>
      </div>

      {/* Answers to custom questions */}
      {questions.length > 0 && Object.keys(answers).length > 0 && (
        <div className="flex flex-wrap gap-2 pr-15">
          {questions.map(q => answers[q.id] != null && answers[q.id] !== '' ? (
            <span key={q.id} className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
              {q.text}: <strong>{typeof answers[q.id] === 'boolean' ? (answers[q.id] ? 'כן' : 'לא') : answers[q.id]}</strong>
            </span>
          ) : null)}
        </div>
      )}

      {bk.notes && (
        <p className="text-xs text-[var(--text-muted)] pr-15">"{bk.notes}"</p>
      )}

      {/* Action buttons */}
      {showActions === 'approve' && (
        <div className="flex gap-2 pr-15">
          <Button onClick={onApprove} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Check className="h-3.5 w-3.5" />אשר
          </Button>
          <Button onClick={onReject} size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <XIcon className="h-3.5 w-3.5" />דחה
          </Button>
        </div>
      )}
      {showActions === 'cancel' && !isPast && (
        <div className="pr-15">
          <Button onClick={onCancel} size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <XIcon className="h-3.5 w-3.5" />בטל שריון
          </Button>
        </div>
      )}
    </div>
  )
}
