import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { StatCard } from '@/components/common/StatCard'
import { TabGroup } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/lib/confirm'
import {
  CalendarDays, Plus, Trash2, Pencil, Sun, Moon, SunMoon,
  ChevronRight, ChevronLeft, ExternalLink, Check, X as XIcon,
  Users, UserPlus, Ban, Star, Settings, PieChart,
  DoorOpen, CreditCard, List, Clock, CheckCircle2,
  AlertCircle, HelpCircle, FileText, ShieldCheck,
  Banknote, RotateCcw, Phone, Mail, Home,
} from 'lucide-react'

// ── Slot definitions ─────────────────────────────────────────────
const SLOT_GRADIENTS = {
  amber:  'from-amber-500 to-amber-600',
  indigo: 'from-blue-500 to-blue-600',
  purple: 'from-purple-500 to-purple-600',
}

const SLOTS = {
  morning:  { label: 'בוקר (08:00-14:00)',    short: 'בוקר 08-14',  icon: Sun,     color: 'amber' },
  evening:  { label: 'ערב (16:00-23:00)',     short: 'ערב 16-23',   icon: Moon,    color: 'indigo' },
  full_day: { label: 'יממה — שבת/חג (24 שעות)', short: 'יממה 24שע',  icon: SunMoon, color: 'purple' },
}

import { HEBREW_MONTHS } from '@/lib/constants'
import { toast, toastError } from '@/lib/toast'
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
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: resources, create: createResource, update: updateResource, remove: removeResource, refresh: refreshResources, isLoading } = useCollection('bookingResources', scope)
  const { data: allBookings, create: createBooking, update: updateBooking, remove: removeBooking, refresh: refreshBookings } = useCollection('bookings', scope)
  const confirm = useConfirm()

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
  // Booking detail / edit — a booking is a thing the committee opens, not just a row
  const [detailId, setDetailId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
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

  // Units + active primary resident (unit_residents, archived excluded).
  const dir = useUnitDirectory(selectedBuilding?.id)
  const buildingUnits = dir.units
  const residentMap = dir.byId

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
    } catch { /* ignore */ }
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
      toastError('יש לבחור דירה או למלא שם')
      return
    }
    // Check rental terms
    if (selectedResource.rental_terms && !termsAccepted) {
      toastError('יש לאשר את תנאי ההשכרה')
      return
    }
    // Check required custom questions
    const questions = selectedResource.custom_questions || []
    for (const q of questions) {
      if (q.required && !answers[q.id]) {
        toastError(`יש למלא: ${q.text}`)
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
      const pendingHtml = buildEmailHtml(selectedResource, { ...bookingData, dk: bookingDialog.dk }, `${name}, השריון שלך התקבל וממתין לאישור נציג הוועד. תקבל עדכון במייל כאשר השריון יאושר או יידחה.`, { unitNumber: unitNum, buildingName: bldName })
      if (email) await sendEmail(email, `${bldName} — שריון ${selectedResource.name} — ממתין לאישור`, pendingHtml)
      // Email to vaad rep
      if (selectedResource.notify_email) {
        const vaadHtml = buildEmailHtml(selectedResource, { ...bookingData, dk: bookingDialog.dk }, 'שריון חדש ממתין לאישורך. היכנס למערכת לאישור או דחייה.', { unitNumber: unitNum, approvalLink: `${window.location.origin}/room-booking`, buildingName: bldName })
        await sendEmail(selectedResource.notify_email, `${bldName} — שריון חדש ממתין לאישור: ${selectedResource.name}`, vaadHtml)
      }

      setBookingDialog(null)
      refreshBookings()

      // Redirect to payment immediately
      if (selectedResource.payment_url) {
        setPaymentRedirect({ url: selectedResource.payment_url })
      } else {
        toast('השריון נשלח — ממתין לאישור הוועד')
      }
    } catch (err) {
      console.error(err)
      toastError('שגיאה ביצירת השריון')
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
        const bldNameA = selectedBuilding?.name || ''
        const html = buildEmailHtml(selectedResource, bk, `${bk.booker_name}, השריון שלך אושר! להלן פרטי ההשכרה הסופיים.`, { unitNumber: unitNum, approvalNotes: allNotes, buildingName: bldNameA })
        sendEmail(bk.booker_email, `${bldNameA} — שריון מאושר: ${selectedResource?.name}`, html)
      }
      setApproveDialog(null)
      toast('השריון אושר')
    } catch (err) {
      console.error('Approve failed:', err)
      toastError(`שגיאה באישור: ${err.message}`)
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
        sendEmail(bk.booker_email, `${bldNameR} — שריון נדחה: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `${bk.booker_name}, לצערנו השריון שלך נדחה על ידי נציג הוועד.`, { unitNumber: unitNumR, buildingName: bldNameR }))
      }
      // Notify vaad rep about rejection
      if (selectedResource?.notify_email) {
        sendEmail(selectedResource.notify_email, `${bldNameR} — שריון נדחה: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `השריון של ${bk.booker_name} נדחה.`, { unitNumber: unitNumR, buildingName: bldNameR }))
      }
      toast('השריון נדחה — המשבצת שוחררה')
    } catch (err) {
      console.error('Reject failed:', err)
      toastError(`שגיאה בדחייה: ${err.message}`)
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
        sendEmail(bk.booker_email, `${bldNameC} — שריון בוטל: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `${bk.booker_name}, השריון בוטל. המשבצת שוחררה.`, { unitNumber: unitNumC, buildingName: bldNameC }))
      }
      // Notify vaad rep about cancellation
      if (selectedResource?.notify_email) {
        sendEmail(selectedResource.notify_email, `${bldNameC} — שריון בוטל: ${selectedResource?.name}`,
          buildEmailHtml(selectedResource, bk, `השריון של ${bk.booker_name} בוטל. המשבצת שוחררה.`, { unitNumber: unitNumC, buildingName: bldNameC }))
      }
      toast('השריון בוטל — המשבצת שוחררה')
    } catch (err) {
      console.error('Cancel failed:', err)
      toastError(`שגיאה בביטול: ${err.message}`)
    }
  }

  // ── Booking detail / edit / payment ──────────────────────────
  // Read the booking out of the live collection rather than holding a copy, so
  // approving or marking paid is reflected in the open dialog immediately.
  const detailBooking = useMemo(
    () => (detailId ? allBookings.find(b => b.id === detailId) || null : null),
    [detailId, allBookings]
  )

  const openDetail = (bk) => {
    if (!bk) return
    setDetailId(bk.id)
    setEditMode(false)
    setEditForm({
      booking_date: bk.booking_date || '',
      slot: bk.slot || 'evening',
      unit_id: bk.unit_id || '',
      is_guest: !!bk.is_guest,
      booker_name: bk.booker_name || '',
      booker_phone: bk.booker_phone || '',
      booker_email: bk.booker_email || '',
      price: bk.price ?? 0,
      notes: bk.notes || '',
      answers: bk.answers || {},
      // Moving someone's date behind their back is worse than an extra email.
      notifyBooker: bk.status === 'approved' && !!bk.booker_email,
    })
  }
  const closeDetail = () => { setDetailId(null); setEditMode(false) }

  /** The booking already holding this date+slot, if any. Mirrors isSlotAvailable. */
  const slotConflict = (dateStr, slot, excludeId) => {
    const sameDay = activeBookings.filter(b => b.booking_date === dateStr && b.id !== excludeId)
    if (!sameDay.length) return null
    const full = sameDay.find(b => b.slot === 'full_day')
    if (slot === 'full_day') return sameDay[0]
    if (full) return full
    return sameDay.find(b => b.slot === slot) || null
  }

  // Payment is a fact the committee records — the money arrives by PayBox, Bit
  // or cash, outside the app, so someone has to confirm it here.
  const handleTogglePaid = async (bk) => {
    const next = bk.payment_status === 'paid' ? 'pending' : 'paid'
    if (next === 'pending' && !await confirm({
      title: 'ביטול אישור התשלום',
      description: `לסמן את השריון של ${bk.booker_name} כממתין לתשלום?`,
      confirmText: 'סמן כלא שולם',
    })) return
    try {
      await updateBooking(bk.id, { payment_status: next })
      await refreshBookings()
      toast(next === 'paid' ? `התשלום של ${bk.booker_name} אושר` : 'סומן כממתין לתשלום')
    } catch (err) {
      console.error('Payment toggle failed:', err)
      toastError(`שגיאה בעדכון התשלום: ${err.message}`)
    }
  }

  const handleSaveEdit = async () => {
    const bk = detailBooking
    if (!bk) return
    const name = (editForm.booker_name || '').trim()
    if (!editForm.booking_date) { toastError('יש לבחור תאריך'); return }
    if (!name) { toastError('יש למלא שם מזמין'); return }
    const clash = slotConflict(editForm.booking_date, editForm.slot, bk.id)
    if (clash) {
      toastError(`המשבצת תפוסה — ${clash.booker_name} (${SLOTS[clash.slot]?.short || clash.slot})`)
      return
    }
    setSaving(true)
    try {
      const patch = {
        booking_date: editForm.booking_date,
        slot: editForm.slot,
        unit_id: editForm.is_guest ? null : (editForm.unit_id || null),
        is_guest: !!editForm.is_guest,
        booker_name: name,
        booker_phone: editForm.booker_phone || '',
        booker_email: editForm.booker_email || '',
        price: Number(editForm.price) || 0,
        notes: editForm.notes || '',
        answers: editForm.answers || {},
      }
      await updateBooking(bk.id, patch)
      await refreshBookings()
      const changedDateOrSlot = patch.booking_date !== bk.booking_date || patch.slot !== bk.slot
      if (editForm.notifyBooker && patch.booker_email) {
        const unitNum = buildingUnits.find(u => u.id === patch.unit_id)?.number || ''
        const bldName = selectedBuilding?.name || ''
        const html = buildEmailHtml(selectedResource, { ...bk, ...patch },
          `${name}, פרטי השריון שלך עודכנו על ידי נציג הוועד. אלו הפרטים המעודכנים.`,
          { unitNumber: unitNum, buildingName: bldName, approvalNotes: changedDateOrSlot ? 'שימו לב: התאריך או משבצת הזמן שונו.' : '' })
        sendEmail(patch.booker_email, `${bldName} — עדכון שריון: ${selectedResource?.name}`, html)
      }
      setEditMode(false)
      toast('פרטי השריון עודכנו')
    } catch (err) {
      console.error('Edit failed:', err)
      toastError(`שגיאה בעדכון: ${err.message}`)
    } finally { setSaving(false) }
  }

  // A booking that was rejected or cancelled released its slot; it can come
  // back only if nobody took that slot meanwhile.
  const handleReopen = async (bk) => {
    const clash = slotConflict(bk.booking_date, bk.slot, bk.id)
    if (clash) {
      toastError(`המשבצת נתפסה בינתיים על ידי ${clash.booker_name} — יש לשנות תאריך או משבצת`)
      return
    }
    try {
      await updateBooking(bk.id, { status: 'pending' })
      await refreshBookings()
      toast('השריון הוחזר לתור ההמתנה לאישור')
    } catch (err) {
      console.error('Reopen failed:', err)
      toastError(`שגיאה בהחזרה לתור: ${err.message}`)
    }
  }

  const handleDeleteBooking = async (bk) => {
    if (!await confirm({
      title: 'מחיקת שריון',
      description: `למחוק לצמיתות את השריון של ${bk.booker_name} ל-${new Date(bk.booking_date).toLocaleDateString('he-IL')}? לביטול רגיל, שמשאיר תיעוד, יש להשתמש בכפתור "בטל שריון".`,
      confirmText: 'מחק לצמיתות',
    })) return
    try {
      await removeBooking(bk.id)
      await refreshBookings()
      closeDetail()
      toast('השריון נמחק')
    } catch (err) {
      console.error('Delete booking failed:', err)
      toastError(`שגיאה במחיקה: ${err.message}`)
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
      toast('נשמר בהצלחה')
    } catch {
      toastError('שגיאה בשמירה')
    } finally { setSaving(false) }
  }

  const handleDeleteResource = async (id) => {
    if (!await confirm({
      title: 'מחיקת חדר',
      description: 'למחוק את החדר? כל השריונים שלו יימחקו גם הם ולא ניתן לשחזר.',
      confirmText: 'מחק חדר',
    })) return
    try {
      await removeResource(id); refreshResources()
      if (selectedResourceId === id) setSelectedResourceId(null)
    } catch (err) {
      console.error('Failed to delete resource:', err)
      toastError('שגיאה במחיקת משאב')
    }
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
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
        <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={DoorOpen} title="בחר בניין" description="יש לבחור בניין כדי לנהל שריונים" />
  }

  const pendingList = allResourceBookings
    .filter(b => b.status === 'pending')
    .sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date))
  const approvedList = allResourceBookings.filter(b => b.status === 'approved')
  const historyList = allResourceBookings.filter(b => b.status === 'rejected' || b.status === 'cancelled')
  const monthDays = calendarDays.filter(Boolean)
  const bookableSlots = monthDays.filter(d => !d.isBlocked).length * 2
  const takenSlots = monthDays.reduce((s, d) => s + (d.hasFullDay ? 2 : (d.hasMorning ? 1 : 0) + (d.hasEvening ? 1 : 0)), 0)
  const occupancy = bookableSlots ? Math.round((takenSlots / bookableSlots) * 100) : 0
  const goToday = () => { const n = new Date(); setCalMonth(n.getMonth()); setCalYear(n.getFullYear()) }
  const firstName = (name) => (name || '').split(' ')[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">שריון חדרים ומתקנים משותפים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">ניהול יומן הזמנות, אישור בקשות של דיירים, דמי שימוש וחסימות תחזוקה • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedResource && (
            <Button variant="outline" onClick={() => openResourceForm(selectedResource)}><Settings className="h-4 w-4" />הגדרת חדר ומחיר</Button>
          )}
          {selectedResource && (
            <Button variant="outline" onClick={() => setTab('settings')}><Ban className="h-4 w-4" />חסימת תאריך</Button>
          )}
          <Button onClick={() => openResourceForm('new')}><Plus className="h-4 w-4" />חדר חדש</Button>
        </div>
      </div>

      {/* Resource tabs */}
      {buildingResources.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
          {buildingResources.map(r => {
            const active = selectedResource?.id === r.id
            const pend = allBookings.filter(b => b.resource_id === r.id && b.status === 'pending').length
            return (
              <button
                key={r.id}
                onClick={() => setSelectedResourceId(r.id)}
                className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-[13px] whitespace-nowrap transition-colors ${
                  active ? 'border-[var(--primary)] text-[var(--primary)] font-bold' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                }`}
              >
                <DoorOpen className="h-4 w-4" />{r.name}
                {pend > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--warning-light)] text-[var(--warning)]">{pend} ממתינים</span>}
              </button>
            )
          })}
        </div>
      )}

      {buildingResources.length === 0 && tab !== 'settings' && (
        <EmptyState icon={DoorOpen} title="אין חדרים מוגדרים" description="הוסיפו חדר דיירים, גג או מועדון כדי לפתוח אותו לשריון"
          actionLabel="הוסף חדר" onAction={() => openResourceForm('new')}
        />
      )}

      {selectedResource && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="בקשות ממתינות לאישור" icon={Clock} color={stats.pending ? 'amber' : 'slate'}
              value={String(stats.pending)}
              className={stats.pending ? 'border-[var(--warning)]/50' : ''}
              footer={stats.pending
                ? <button onClick={() => document.getElementById('booking-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="text-[var(--warning)] font-semibold hover:underline">לטיפול בתור ←</button>
                : <span>אין בקשות פתוחות</span>} />
            <StatCard label={`שריונים ב${HEBREW_MONTHS[calMonth]}`} icon={CalendarDays} color="blue"
              value={String(stats.monthCount)}
              sub={`${stats.approved} מאושרים בסך הכול`} />
            <StatCard label="תפוסה חודשית" icon={PieChart} color="purple"
              value={`${occupancy}%`}
              sub={`${takenSlots} מתוך ${bookableSlots} משבצות`}
              progress={occupancy} />
            <StatCard label="הכנסות משימוש החודש" icon={CreditCard} color="emerald"
              value={formatCurrency(stats.revenue)}
              footer={<span>בוקר {formatCurrency(selectedResource.price_morning)} • ערב {formatCurrency(selectedResource.price_evening)} • יממה {formatCurrency(selectedResource.price_full_day)}</span>} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Main: calendar / list / settings */}
            <div className="xl:col-span-8 space-y-4">
              <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center h-[38px] rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)]">
                      <button onClick={prevMonth} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="החודש הקודם"><ChevronRight className="h-4 w-4" /></button>
                      <button onClick={goToday} className="px-2 text-[12px] font-semibold text-[var(--primary)]">היום</button>
                      <button onClick={nextMonth} className="h-full px-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" aria-label="החודש הבא"><ChevronLeft className="h-4 w-4" /></button>
                    </div>
                    <h2 className="text-[20px] font-bold num-tabular">{HEBREW_MONTHS[calMonth]} {calYear}</h2>
                  </div>
                  <TabGroup
                    tabs={[
                      { key: 'calendar', label: 'חודש' },
                      { key: 'bookings', label: 'רשימת הזמנות', count: allResourceBookings.length },
                      { key: 'settings', label: 'חדרים וחסימות' },
                    ]}
                    activeTab={tab}
                    onChange={setTab}
                  />
                </div>
                {tab === 'calendar' && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                    <span className="font-semibold">מקרא:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--border)]"><span className="h-2 w-2 rounded-full bg-[var(--success)]" />מאושר</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--border)]"><span className="h-2 w-2 rounded-full bg-[var(--warning)]" />ממתין לאישור</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--border)]"><Sun className="h-3 w-3" />בוקר 08-14</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--border)]"><Moon className="h-3 w-3" />ערב 16-23</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--border)]"><Ban className="h-3 w-3" />חסום</span>
                  </div>
                )}
              </div>

              {tab === 'calendar' && (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                    {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'].map((d, i) => (
                      <div key={d} className={`text-center py-2.5 text-[12px] font-bold ${i >= 5 ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}>
                        <span className="hidden sm:inline">{d}</span><span className="sm:hidden">{WEEKDAYS[i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {calendarDays.map((day, i) => {
                      if (!day) return <div key={`e${i}`} className="min-h-[96px] border-b border-l border-[var(--border-light)] bg-[var(--bg)]" />
                      const isToday = isSameDay(day.date, new Date())
                      const canBook = !day.isPast && !day.isBlocked && !day.isTooFar && !day.hasFullDay
                      const holidayName = day.holidays[0]?.hebrew
                      const free = canBook && day.bookings.length === 0
                      return (
                        <div
                          key={day.dk}
                          onClick={() => canBook && handleOpenBooking(day)}
                          className={`min-h-[96px] border-b border-l border-[var(--border-light)] p-1.5 flex flex-col gap-1 transition-colors ${
                            isToday ? 'ring-2 ring-inset ring-[var(--primary)]' : ''
                          } ${
                            day.isBlocked ? 'bg-[var(--surface-container)] cursor-not-allowed'
                            : day.isPast || day.isTooFar ? 'bg-[var(--bg)] cursor-not-allowed'
                            : day.isShabbatOrChag ? 'bg-[var(--surface-secondary)] cursor-pointer hover:bg-[var(--surface-container)]'
                            : 'bg-[var(--surface)] cursor-pointer hover:bg-[var(--surface-secondary)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            {day.isBlocked ? <Ban className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                              : day.bookings.some(b => b.status === 'pending') ? <Clock className="h-3.5 w-3.5 text-[var(--warning)]" /> : <span />}
                            <span className={`text-[13px] font-bold num-tabular leading-none ${
                              isToday ? 'bg-[var(--primary)] text-white h-6 min-w-6 px-1 rounded-full inline-flex items-center justify-center'
                              : day.isPast ? 'text-[var(--text-muted)]'
                              : day.isShabbatOrChag ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
                            }`}>{day.day}</span>
                          </div>
                          {holidayName && (
                            <p className={`text-[9px] leading-tight truncate ${day.isYomTov ? 'text-[var(--primary-dark)] font-bold' : 'text-[var(--primary)]'}`}>
                              {day.isYomTov && <Star className="h-2.5 w-2.5 inline ml-0.5" />}{holidayName}
                            </p>
                          )}
                          <div className="flex flex-col gap-0.5">
                            {day.bookings.map(b => {
                              const pending = b.status === 'pending'
                              const slotWord = b.slot === 'morning' ? 'בוקר' : b.slot === 'full_day' ? 'יממה' : 'ערב'
                              return (
                                <button key={b.id} type="button"
                                  title={`${SLOTS[b.slot]?.label || ''} — ${b.booker_name} • לחצו לפתיחת ההזמנה`}
                                  onClick={(e) => { e.stopPropagation(); openDetail(b) }}
                                  className={`flex w-full items-center gap-1 text-[10px] leading-4 px-1 rounded border truncate hover:brightness-95 ${
                                    pending ? 'bg-[var(--warning-light)] border-[var(--warning)]/30 text-[var(--warning)]'
                                    : 'bg-[var(--success-light)] border-[var(--success)]/25 text-[var(--success)]'
                                  }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${pending ? 'bg-[var(--warning)]' : 'bg-[var(--success)]'}`} />
                                  <span className="truncate">{slotWord}: {firstName(b.booker_name)}</span>
                                  {b.payment_status === 'paid' && <Check className="h-2.5 w-2.5 shrink-0" />}
                                </button>
                              )
                            })}
                            {free && !day.isPast && (
                              <span className="hidden sm:block text-[10px] leading-4 px-1 rounded border border-dashed border-[var(--outline-variant)] text-[var(--text-muted)] text-center">פנוי</span>
                            )}
                            {day.isBlocked && <span className="text-[10px] text-[var(--text-muted)]">סגור לתחזוקה</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {tab === 'bookings' && (
                <div className="space-y-4">
                  <p className="text-[12px] text-[var(--text-muted)]">לחיצה על שריון פותחת את ההזמנה — שם, פרטי קשר, תאריך, משבצת ותשלום — וניתן לערוך הכול.</p>
                  {pendingList.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[14px] font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-[var(--warning)]" />ממתינים לאישור ({pendingList.length})</h3>
                      {pendingList.map(bk => (
                        <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap}
                          onOpen={() => openDetail(bk)} onTogglePaid={() => handleTogglePaid(bk)} showActions="cancel"
                          onCancel={() => handleCancel(bk)} />
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="text-[14px] font-bold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--success)]" />שריונים מאושרים ({approvedList.length})</h3>
                    {approvedList.length === 0
                      ? <p className="text-[13px] text-[var(--text-muted)]">אין שריונים מאושרים</p>
                      : approvedList.map(bk => (
                        <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap}
                          onOpen={() => openDetail(bk)} onTogglePaid={() => handleTogglePaid(bk)}
                          onCancel={() => handleCancel(bk)} showActions="cancel" />
                      ))}
                  </div>
                  {historyList.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[14px] font-bold text-[var(--text-secondary)] flex items-center gap-2"><List className="h-4 w-4" />היסטוריה ({historyList.length})</h3>
                      {historyList.map(bk => (
                        <BookingCard key={bk.id} bk={bk} resource={selectedResource} residentMap={residentMap}
                          onOpen={() => openDetail(bk)} showActions="none" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'settings' && (
                <div className="space-y-4">
                  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border)]">
                      <h3 className="text-[16px] font-bold">חדרים ומתקנים</h3>
                      <Button onClick={() => openResourceForm('new')} variant="outline" size="sm"><Plus className="h-4 w-4" />הוסף</Button>
                    </div>
                    <div className="divide-y divide-[var(--border-light)]">
                      {resources.filter(r => r.building_id === selectedBuilding?.id).map(r => (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="p-2 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]"><DoorOpen className="h-5 w-5" /></span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold">{r.name}</p>
                            <div className="flex flex-wrap gap-x-3 text-[12px] text-[var(--text-muted)] mt-0.5 num-tabular">
                              <span>בוקר {formatCurrency(r.price_morning)}</span>
                              <span>ערב {formatCurrency(r.price_evening)}</span>
                              <span>יממה {formatCurrency(r.price_full_day)}</span>
                              <span>{r.residents_only ? 'דיירים בלבד' : 'דיירים + אורחים'}</span>
                              {(r.custom_questions || []).length > 0 && <span>{(r.custom_questions || []).length} שאלות בטופס</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => openResourceForm(r)} aria-label="עריכה"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteResource(r.id)} aria-label="מחיקה"><Trash2 className="h-4 w-4 text-[var(--danger)]" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-4 space-y-3">
                    <h3 className="text-[16px] font-bold">ימים חסומים — {selectedResource.name}</h3>
                    <div className="flex gap-2 items-end">
                      <FormField label="תאריך לחסימה (תחזוקה / אירוע ועד)" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="w-56" />
                      <Button onClick={handleBlockDate} disabled={!blockDate}><Ban className="h-4 w-4" />חסום</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedResource.blocked_dates || []).sort().map(d => (
                        <span key={d} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-container)] text-[12px] font-semibold num-tabular">
                          {new Date(d).toLocaleDateString('he-IL')}
                          <button onClick={() => handleUnblockDate(d)} className="text-[var(--text-muted)] hover:text-[var(--danger)]" aria-label="הסרת חסימה"><XIcon className="h-3 w-3" /></button>
                        </span>
                      ))}
                      {(selectedResource.blocked_dates || []).length === 0 && <p className="text-[13px] text-[var(--text-muted)]">אין ימים חסומים</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Side: approvals queue + terms */}
            <div className="xl:col-span-4 space-y-4 xl:sticky xl:top-20">
              <div id="booking-queue" className={`rounded-[var(--radius)] border bg-[var(--surface)] shadow-[var(--shadow)] scroll-mt-20 ${pendingList.length ? 'border-[var(--warning)]/50' : 'border-[var(--border)]'}`}>
                <div className={`flex items-center justify-between gap-2 px-4 py-3.5 border-b border-[var(--border)] ${pendingList.length ? 'bg-[var(--warning-light)]/50' : ''}`}>
                  <div>
                    <h2 className="text-[16px] font-bold">תור בקשות לאישור</h2>
                    <p className="text-[11px] text-[var(--text-muted)]">{pendingList.length ? `${pendingList.length} דיירים ממתינים למענה` : 'אין בקשות ממתינות'}</p>
                  </div>
                  {pendingList.length > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--warning)] text-white">{pendingList.length} ממתינות</span>}
                </div>
                {pendingList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[var(--success)]" />הכול מטופל
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-light)]">
                    {pendingList.map(bk => {
                      const unit = bk.unit_id ? residentMap[bk.unit_id] : null
                      const d = new Date(bk.booking_date)
                      const answers = bk.answers || {}
                      const qs = (selectedResource.custom_questions || []).filter(q => answers[q.id] != null && answers[q.id] !== '')
                      return (
                        <div key={bk.id} className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <span className="h-9 w-9 rounded-full bg-[var(--surface-container)] text-[var(--primary-dark)] text-[12px] font-bold flex items-center justify-center shrink-0">
                              {(bk.booker_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-bold truncate">{bk.booker_name}</p>
                              <p className="text-[12px] text-[var(--text-muted)]">
                                {bk.is_guest ? 'אורח חיצוני' : unit ? `דירה ${unit.number}` : ''}{bk.booker_phone ? ` • ${bk.booker_phone}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)]/60 space-y-1.5 text-[12px]">
                            <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)] num-tabular">
                              <CalendarDays className="h-3.5 w-3.5 text-[var(--primary)]" />
                              יום {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][d.getDay()]}, {d.toLocaleDateString('he-IL')} | {SLOTS[bk.slot]?.label || bk.slot}
                            </p>
                            {qs.map(q => (
                              <p key={q.id} className="text-[var(--text-secondary)]">{q.text}: <b>{typeof answers[q.id] === 'boolean' ? (answers[q.id] ? 'כן' : 'לא') : answers[q.id]}</b></p>
                            ))}
                            {bk.notes && <p className="text-[var(--text-muted)]">"{bk.notes}"</p>}
                            <div className="flex items-center justify-between pt-1 num-tabular">
                              <span className="text-[var(--text-secondary)]">דמי שימוש: <b>{formatCurrency(bk.price || 0)}</b></span>
                              <button
                                onClick={() => handleTogglePaid(bk)}
                                title={bk.payment_status === 'paid' ? 'לחצו כדי לבטל את אישור התשלום' : 'לחצו כדי לאשר שהתשלום התקבל'}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold hover:brightness-95 ${bk.payment_status === 'paid' ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}`}>
                                {bk.payment_status === 'paid' ? 'שולם ✓' : 'אשר קבלת תשלום'}
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => openApproveDialog(bk)} className="flex-1 bg-[var(--success)] hover:opacity-90"><Check className="h-4 w-4" />אשר שריון</Button>
                            <Button onClick={() => handleReject(bk)} variant="outline" className="text-[var(--danger)] border-[var(--danger)]/30 hover:bg-[var(--danger-light)]"><XIcon className="h-4 w-4" />דחה</Button>
                            <Button onClick={() => openDetail(bk)} variant="outline" aria-label="פתיחה ועריכה"><Pencil className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
                <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[var(--border)]">
                  <ShieldCheck className="h-5 w-5 text-[var(--primary)]" />
                  <h2 className="text-[16px] font-bold">תקנון וכללי השכרה</h2>
                </div>
                <div className="p-4 space-y-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                  {selectedResource.description && <p>{selectedResource.description}</p>}
                  {selectedResource.rental_terms
                    ? <p className="whitespace-pre-wrap max-h-48 overflow-y-auto">{selectedResource.rental_terms}</p>
                    : <p className="text-[var(--text-muted)]">עדיין לא הוגדר תקנון. דיירים לא יתבקשו לאשר תנאים בעת השריון.</p>}
                  {selectedResource.approval_message && (
                    <div className="p-2.5 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                      <p className="font-semibold text-[var(--text-primary)] mb-0.5">הנחיות שנשלחות עם כל אישור</p>
                      <p className="whitespace-pre-wrap">{selectedResource.approval_message}</p>
                    </div>
                  )}
                  <ul className="space-y-1 num-tabular">
                    <li>• הזמנה עד {selectedResource.max_advance_days || 30} ימים מראש</li>
                    <li>• {selectedResource.residents_only ? 'פתוח לדיירי הבניין בלבד' : 'פתוח גם לאורחים חיצוניים'}</li>
                    {selectedResource.notify_email && <li>• התראות לנציג: {selectedResource.notify_email}</li>}
                    {selectedResource.payment_url && <li>• תשלום בקישור חיצוני (PayBox / Bit)</li>}
                  </ul>
                </div>
                <div className="px-4 py-2.5 border-t border-[var(--border-light)]">
                  <button onClick={() => openResourceForm(selectedResource)} className="text-[12px] font-semibold text-[var(--primary)] hover:underline">עריכת תקנון והגדרות ←</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}


      {/* ══════════════════════════════════════════════════════════ */}
      {/* BOOKING DIALOG                                            */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--primary)]" />
              שריון {selectedResource?.name}
            </DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-4 mt-2">
              {/* Date */}
              <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] border border-[var(--border)] text-center">
                <p className="text-lg font-bold text-[var(--primary-dark)]">
                  {new Date(bookingDialog.dk).toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {bookingDialog.holidays?.[0]?.hebrew && (
                  <p className="text-sm text-[var(--primary)] mt-0.5"><Star className="h-3.5 w-3.5 inline ml-1" />{bookingDialog.holidays[0].hebrew}</p>
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
                        className={`p-3 rounded-[var(--radius)] border-2 text-center transition-all ${
                          !available ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                          : isSelected ? 'border-[var(--primary)] bg-[var(--surface-secondary)] text-[var(--primary-dark)] shadow-sm'
                          : 'border-[var(--border)] hover:border-[var(--primary)]'
                        }`}
                      >
                        <SlotIcon className={`h-5 w-5 mx-auto mb-1 ${isSelected ? 'text-[var(--primary)]' : ''}`} />
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
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-[var(--radius)] border-2 text-sm ${
                      !bookingForm.isGuest ? 'border-[var(--primary)] bg-[var(--surface-secondary)] text-[var(--primary-dark)]' : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}><Users className="h-4 w-4" />דייר</button>
                  <button onClick={() => setBookingForm(f => ({ ...f, isGuest: true }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-[var(--radius)] border-2 text-sm ${
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
                      label: u.name ? u.label : `דירה ${u.number} — ללא דייר`,
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
                <div className="p-3 rounded-[var(--radius)] bg-slate-50 border border-[var(--border)] text-sm">
                  <p className="font-medium">{bookingForm.bookerName}</p>
                  <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-1">
                    {bookingForm.bookerPhone && <span>{bookingForm.bookerPhone}</span>}
                    {bookingForm.bookerEmail && <span>{bookingForm.bookerEmail}</span>}
                  </div>
                </div>
              )}

              {/* Custom questions */}
              {(selectedResource?.custom_questions || []).length > 0 && (
                <div className="space-y-3 p-3 rounded-[var(--radius)] bg-blue-50/50 border border-blue-100">
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
                <div className="space-y-2 p-3 rounded-[var(--radius)] bg-slate-50 border border-[var(--border)]">
                  <p className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1"><FileText className="h-3.5 w-3.5" />תנאי השכרה</p>
                  <div className="text-xs text-[var(--text-muted)] whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                    {selectedResource.rental_terms}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={bookingForm.termsAccepted}
                      onChange={(e) => setBookingForm(f => ({ ...f, termsAccepted: e.target.checked }))}
                      className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-violet-500"
                    />
                    <span className="text-sm font-medium text-[var(--text-primary)]">קראתי ואני מאשר/ת את תנאי ההשכרה</span>
                  </label>
                </div>
              )}

              {/* Price */}
              {getSlotPrice(bookingForm.slot) > 0 && (
                <div className="p-3 rounded-[var(--radius)] bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="text-sm text-emerald-700 font-medium">עלות:</span>
                  <span className="text-lg font-bold text-emerald-700">{formatCurrency(getSlotPrice(bookingForm.slot))}</span>
                </div>
              )}

              {/* Info about approval */}
              <div className="flex items-start gap-2 p-3 rounded-[var(--radius)] bg-amber-50 border border-amber-200">
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
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-3 p-3 rounded-[var(--radius)] bg-blue-50/50 border border-blue-100">
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
      {/* BOOKING DETAIL / EDIT DIALOG                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailBooking} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--primary)]" />
              {editMode ? 'עריכת שריון' : 'פרטי השריון'}
            </DialogTitle>
          </DialogHeader>
          {detailBooking && (() => {
            const bk = detailBooking
            const cfg = STATUS_CONFIG[bk.status] || STATUS_CONFIG.pending
            const bkDate = new Date(bk.booking_date)
            const unit = bk.unit_id ? residentMap[bk.unit_id] : null
            const paid = bk.payment_status === 'paid'
            const questions = selectedResource?.custom_questions || []
            const answers = bk.answers || {}
            const isPast = bkDate < new Date(new Date().setHours(0, 0, 0, 0))
            const row = (Icon, label, value) => value ? (
              <div className="flex items-start gap-2 text-[13px]">
                <Icon className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                <span className="text-[var(--text-muted)] w-20 shrink-0">{label}</span>
                <span className="font-semibold text-[var(--text-primary)] break-words">{value}</span>
              </div>
            ) : null

            if (editMode) {
              const editClash = slotConflict(editForm.booking_date, editForm.slot, bk.id)
              return (
                <div className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="תאריך" type="date" value={editForm.booking_date}
                      onChange={(e) => setEditForm(f => ({ ...f, booking_date: e.target.value }))} />
                    <FormSelect label="משבצת זמן" value={editForm.slot}
                      onChange={(e) => {
                        const slot = e.target.value
                        // Keep the price in step with the slot unless it was set by hand.
                        const wasSlotPrice = Number(editForm.price) === getSlotPrice(editForm.slot)
                        setEditForm(f => ({ ...f, slot, price: wasSlotPrice ? getSlotPrice(slot) : f.price }))
                      }}
                      options={Object.entries(SLOTS).map(([k, s]) => ({ value: k, label: s.label }))} />
                  </div>
                  {editClash && (
                    <div className="flex items-start gap-2 p-2.5 rounded-[var(--radius)] bg-[var(--danger-light)] border border-[var(--danger)]/30">
                      <AlertCircle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />
                      <p className="text-[12px] text-[var(--danger)]">המשבצת הזו תפוסה על ידי {editClash.booker_name} ({SLOTS[editClash.slot]?.short}). יש לבחור תאריך או משבצת אחרים.</p>
                    </div>
                  )}

                  {!selectedResource?.residents_only && (
                    <FormBool label="אורח חיצוני?" value={editForm.is_guest}
                      onChange={(e) => setEditForm(f => ({ ...f, is_guest: e.target.value, unit_id: e.target.value ? '' : f.unit_id }))} />
                  )}
                  {!editForm.is_guest && (
                    <FormSelect label="דירה" value={editForm.unit_id}
                      onChange={(e) => {
                        const uid = e.target.value
                        const res = residentMap[uid]
                        setEditForm(f => ({
                          ...f, unit_id: uid,
                          booker_name: res?.name || f.booker_name,
                          booker_phone: res?.phone || f.booker_phone,
                          booker_email: res?.email || f.booker_email,
                        }))
                      }}
                      options={[{ value: '', label: 'ללא דירה' },
                        ...buildingUnits.map(u => ({ value: u.id, label: u.name ? u.label : `דירה ${u.number} — ללא דייר` }))]} />
                  )}

                  <FormField label="שם המזמין" value={editForm.booker_name}
                    onChange={(e) => setEditForm(f => ({ ...f, booker_name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="טלפון" value={editForm.booker_phone}
                      onChange={(e) => setEditForm(f => ({ ...f, booker_phone: e.target.value }))} placeholder="050-1234567" />
                    <FormField label="אימייל" value={editForm.booker_email}
                      onChange={(e) => setEditForm(f => ({ ...f, booker_email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                  <FormField label="דמי שימוש (₪)" type="number" value={editForm.price}
                    onChange={(e) => setEditForm(f => ({ ...f, price: e.target.value }))} />

                  {questions.length > 0 && (
                    <div className="space-y-3 p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] border border-[var(--border)]">
                      <p className="text-[12px] font-bold text-[var(--text-secondary)] flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />תשובות הדייר</p>
                      {questions.map(q => q.type === 'boolean' ? (
                        <FormBool key={q.id} label={q.text} value={editForm.answers?.[q.id] || false}
                          onChange={(e) => setEditForm(f => ({ ...f, answers: { ...f.answers, [q.id]: e.target.value } }))} />
                      ) : (
                        <FormField key={q.id} label={q.text} type={q.type === 'number' ? 'number' : 'text'}
                          value={editForm.answers?.[q.id] ?? ''}
                          onChange={(e) => setEditForm(f => ({ ...f, answers: { ...f.answers, [q.id]: e.target.value } }))} />
                      ))}
                    </div>
                  )}

                  <FormTextarea label="הערות" value={editForm.notes}
                    onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />

                  {editForm.booker_email && (
                    <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] border border-[var(--border)]">
                      <input type="checkbox" checked={!!editForm.notifyBooker}
                        onChange={(e) => setEditForm(f => ({ ...f, notifyBooker: e.target.checked }))}
                        className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)]" />
                      <span className="text-[13px] font-medium">שלח לדייר מייל עם הפרטים המעודכנים</span>
                    </label>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleSaveEdit} disabled={saving || !!editClash} className="flex-1 gap-1.5">
                      <Check className="h-4 w-4" />{saving ? 'שומר...' : 'שמור שינויים'}
                    </Button>
                    <Button variant="outline" onClick={() => { setEditMode(false); openDetail(bk) }}>ביטול</Button>
                  </div>
                </div>
              )
            }

            return (
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold">{bk.booker_name}</span>
                    {bk.is_guest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--warning-light)] text-[var(--warning)] font-semibold">אורח</span>}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${cfg.bg}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                  </span>
                </div>

                <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] border border-[var(--border)] space-y-2">
                  {row(CalendarDays, 'תאריך', `יום ${HEBREW_DAYS[bkDate.getDay()]}, ${bkDate.toLocaleDateString('he-IL')}`)}
                  {row(Clock, 'משבצת', SLOTS[bk.slot]?.label || bk.slot)}
                  {row(Home, 'דירה', unit ? `${unit.number}${unit.name ? ` — ${unit.name}` : ''}` : (bk.is_guest ? 'אורח חיצוני' : null))}
                  {row(Phone, 'טלפון', bk.booker_phone)}
                  {row(Mail, 'אימייל', bk.booker_email)}
                  {row(FileText, 'תקנון', bk.terms_accepted ? 'אושר על ידי הדייר' : 'לא אושר')}
                  {questions.map(q => answers[q.id] != null && answers[q.id] !== ''
                    ? row(HelpCircle, q.text, typeof answers[q.id] === 'boolean' ? (answers[q.id] ? 'כן' : 'לא') : String(answers[q.id]))
                    : null)}
                  {bk.notes && <p className="text-[12px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-light)]">"{bk.notes}"</p>}
                </div>

                {/* Payment — the money arrives outside the app, so it is confirmed here */}
                <div className={`p-3 rounded-[var(--radius)] border ${paid ? 'bg-[var(--success-light)] border-[var(--success)]/30' : 'bg-[var(--warning-light)] border-[var(--warning)]/30'}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="num-tabular">
                      <p className="text-[12px] text-[var(--text-secondary)]">דמי שימוש</p>
                      <p className="text-[18px] font-bold">{formatCurrency(bk.price || 0)}</p>
                      <p className={`text-[12px] font-semibold ${paid ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                        {paid ? 'התשלום אושר' : 'ממתין לתשלום'}
                      </p>
                    </div>
                    <Button onClick={() => handleTogglePaid(bk)} variant={paid ? 'outline' : 'default'}
                      className={paid ? '' : 'bg-[var(--success)] hover:opacity-90'}>
                      {paid ? <><RotateCcw className="h-4 w-4" />בטל אישור תשלום</> : <><Banknote className="h-4 w-4" />אשר קבלת תשלום</>}
                    </Button>
                  </div>
                  {selectedResource?.payment_url && !paid && (
                    <a href={selectedResource.payment_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-[var(--primary)] hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />קישור התשלום שנשלח לדייר
                    </a>
                  )}
                </div>

                {/* Status actions */}
                <div className="flex flex-wrap gap-2">
                  {bk.status === 'pending' && (
                    <>
                      <Button onClick={() => { closeDetail(); openApproveDialog(bk) }} className="flex-1 bg-[var(--success)] hover:opacity-90"><Check className="h-4 w-4" />אשר שריון</Button>
                      <Button onClick={() => handleReject(bk)} variant="outline" className="text-[var(--danger)] border-[var(--danger)]/30"><XIcon className="h-4 w-4" />דחה</Button>
                    </>
                  )}
                  {bk.status === 'approved' && !isPast && (
                    <Button onClick={() => handleCancel(bk)} variant="outline" className="text-[var(--danger)] border-[var(--danger)]/30"><XIcon className="h-4 w-4" />בטל שריון</Button>
                  )}
                  {(bk.status === 'rejected' || bk.status === 'cancelled') && (
                    <Button onClick={() => handleReopen(bk)} variant="outline"><RotateCcw className="h-4 w-4" />החזר לתור לאישור</Button>
                  )}
                  <Button onClick={() => setEditMode(true)} variant="outline"><Pencil className="h-4 w-4" />ערוך פרטים</Button>
                  <Button onClick={() => handleDeleteBooking(bk)} variant="ghost" size="icon" aria-label="מחיקת השריון">
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                </div>
                {bk.created_at && (
                  <p className="text-[11px] text-[var(--text-muted)]">נשלח ב-{new Date(bk.created_at).toLocaleString('he-IL')}</p>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* APPROVE WITH NOTES DIALOG                                 */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="w-full max-w-md">
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
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-500" />תשלום</DialogTitle>
          </DialogHeader>
          {paymentRedirect && (
            <div className="space-y-4 mt-2 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center mx-auto shadow-lg">
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
function BookingCard({ bk, resource, residentMap, onCancel, onOpen, onTogglePaid, showActions }) {
  const slotInfo = SLOTS[bk.slot] || SLOTS.evening
  const SlotIcon = slotInfo.icon
  const statusCfg = STATUS_CONFIG[bk.status] || STATUS_CONFIG.pending
  const isPast = new Date(bk.booking_date) < new Date(new Date().setHours(0, 0, 0, 0))
  const unit = bk.unit_id ? residentMap?.[bk.unit_id] : null
  const questions = resource?.custom_questions || []
  const answers = bk.answers || {}
  const muted = bk.status === 'cancelled' || bk.status === 'rejected'

  return (
    <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } : undefined}
      className={`flex flex-col gap-2 p-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] ${muted ? 'opacity-60' : ''} ${onOpen ? 'cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--surface-secondary)]/40 transition-colors' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><SlotIcon className="h-5 w-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold">{bk.booker_name}</span>
            {bk.is_guest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--warning-light)] text-[var(--warning)] font-semibold">אורח</span>}
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${statusCfg.bg}`}>{statusCfg.label}</span>
          </div>
          <div className="flex items-center gap-x-3 flex-wrap text-[12px] text-[var(--text-muted)] num-tabular">
            <span>{new Date(bk.booking_date).toLocaleDateString('he-IL')}</span>
            <span>{slotInfo.short}</span>
            {unit && <span>דירה {unit.number}</span>}
            {bk.booker_phone && <span>{bk.booker_phone}</span>}
          </div>
        </div>
        <div className="text-left shrink-0 num-tabular">
          {bk.price > 0 && <p className="text-[14px] font-bold">{formatCurrency(bk.price)}</p>}
          {onTogglePaid ? (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePaid() }}
              title={bk.payment_status === 'paid' ? 'לחצו כדי לבטל את אישור התשלום' : 'לחצו כדי לאשר שהתשלום התקבל'}
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded hover:brightness-95 ${bk.payment_status === 'paid' ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}`}>
              {bk.payment_status === 'paid' ? 'שולם ✓' : 'אשר תשלום'}
            </button>
          ) : (
            <p className={`text-[11px] font-semibold ${bk.payment_status === 'paid' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
              {bk.payment_status === 'paid' ? 'שולם' : 'ממתין לתשלום'}
            </p>
          )}
        </div>
        {showActions === 'cancel' && !isPast && (
          <Button onClick={(e) => { e.stopPropagation(); onCancel?.() }} size="sm" variant="outline" className="text-[var(--danger)] border-[var(--danger)]/30 hover:bg-[var(--danger-light)] shrink-0">
            <XIcon className="h-3.5 w-3.5" />בטל
          </Button>
        )}
      </div>
      {questions.length > 0 && Object.keys(answers).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map(q => answers[q.id] != null && answers[q.id] !== '' ? (
            <span key={q.id} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-container)] text-[var(--primary-dark)]">
              {q.text}: <strong>{typeof answers[q.id] === 'boolean' ? (answers[q.id] ? 'כן' : 'לא') : answers[q.id]}</strong>
            </span>
          ) : null)}
        </div>
      )}
      {bk.notes && <p className="text-[12px] text-[var(--text-muted)]">"{bk.notes}"</p>}
    </div>
  )
}
