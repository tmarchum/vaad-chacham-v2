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
  Users, UserPlus, Ban, Star, Clock, Settings, Calendar,
  DoorOpen, CreditCard, Mail, Shield, List,
} from 'lucide-react'

// ── Slot definitions ─────────────────────────────────────────────
const SLOTS = {
  morning:  { label: 'בוקר (08:00-14:00)',  short: 'בוקר',   icon: Sun,     color: 'amber' },
  evening:  { label: 'ערב (16:00-23:00)',   short: 'ערב',    icon: Moon,    color: 'indigo' },
  full_day: { label: 'יממה (08:00-08:00+1)', short: 'יממה',  icon: SunMoon, color: 'purple' },
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

// ── Helpers ──────────────────────────────────────────────────────
function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ═════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════
export default function RoomBooking() {
  const { selectedBuilding } = useBuildingContext()
  const { profile } = useAuth()
  const { data: resources, create: createResource, update: updateResource, remove: removeResource, refresh: refreshResources } = useCollection('bookingResources')
  const { data: allBookings, create: createBooking, update: updateBooking, remove: removeBooking, refresh: refreshBookings } = useCollection('bookings')
  const { data: allUnits } = useCollection('units')
  const { data: allResidents } = useCollection('residents')

  // ── State ────────────────────────────────────────────────────
  const [tab, setTab] = useState('calendar') // calendar | bookings | settings
  const [selectedResourceId, setSelectedResourceId] = useState(null)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState({}) // dateKey -> { hebrew, isYomTov }
  const [bookingDialog, setBookingDialog] = useState(null) // { date }
  const [bookingForm, setBookingForm] = useState({ slot: 'evening', unitId: '', isGuest: false, bookerName: '', bookerPhone: '', bookerEmail: '', notes: '' })
  const [resourceDialog, setResourceDialog] = useState(null) // null | 'new' | resource obj
  const [resourceForm, setResourceForm] = useState({})
  const [blockDialog, setBlockDialog] = useState(false)
  const [blockDate, setBlockDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentRedirect, setPaymentRedirect] = useState(null) // { url, bookingId }

  // ── Derived data ─────────────────────────────────────────────
  const buildingResources = useMemo(() =>
    resources.filter(r => r.building_id === selectedBuilding?.id && r.active !== false),
    [resources, selectedBuilding]
  )

  const selectedResource = useMemo(() =>
    buildingResources.find(r => r.id === selectedResourceId) || buildingResources[0] || null,
    [buildingResources, selectedResourceId]
  )

  // Auto-select first resource
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

  const residentMap = useMemo(() => {
    const map = {}
    allResidents.forEach(r => {
      if (r.building_id !== selectedBuilding?.id) return
      if (r.is_primary || !map[r.unit_id]) {
        map[r.unit_id] = { name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), email: r.email, phone: r.phone }
      }
    })
    return map
  }, [allResidents, selectedBuilding])

  // Bookings for selected resource in the displayed month
  const monthBookings = useMemo(() => {
    if (!selectedResource) return []
    return allBookings.filter(b =>
      b.resource_id === selectedResource.id &&
      b.status !== 'cancelled'
    )
  }, [allBookings, selectedResource])

  // Map: dateKey -> [bookings]
  const bookingsByDate = useMemo(() => {
    const map = {}
    monthBookings.forEach(b => {
      const dk = b.booking_date
      if (!map[dk]) map[dk] = []
      map[dk].push(b)
    })
    return map
  }, [monthBookings])

  // Blocked dates set for selected resource
  const blockedDates = useMemo(() => {
    if (!selectedResource) return new Set()
    const dates = selectedResource.blocked_dates || []
    return new Set(dates)
  }, [selectedResource])

  // ── Fetch Hebrew holidays from HebCal ────────────────────────
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
          title: item.title,
          hebrew: item.hebrew,
          isYomTov: !!item.yomtov,
          category: item.category,
          subcat: item.subcat,
        })
      })
      setHolidays(hmap)
    } catch (err) {
      console.warn('HebCal fetch failed:', err)
      setHolidays({})
    }
  }, [])

  useEffect(() => {
    fetchHolidays(calYear, calMonth)
  }, [calYear, calMonth, fetchHolidays])

  // ── Calendar grid ────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    const startDow = first.getDay() // 0=Sun
    const days = []

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) days.push(null)
    // Day cells
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(calYear, calMonth, d)
      const dk = dateKey(date)
      const isSaturday = date.getDay() === 6
      const isFriday = date.getDay() === 5
      const dayHolidays = holidays[dk] || []
      const isYomTov = dayHolidays.some(h => h.isYomTov)
      const isHoliday = dayHolidays.length > 0
      const dayBookings = bookingsByDate[dk] || []
      const isBlocked = blockedDates.has(dk)
      const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))

      // Check max advance days
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const maxDate = new Date(today)
      maxDate.setDate(maxDate.getDate() + (selectedResource?.max_advance_days || 30))
      const isTooFar = date > maxDate

      days.push({
        day: d, date, dk, isSaturday, isFriday, isYomTov, isHoliday,
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
    const thisMonth = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthBk = allBookings.filter(b =>
      b.resource_id === selectedResource?.id &&
      b.booking_date?.startsWith(thisMonth) &&
      b.status !== 'cancelled'
    )
    const totalRevenue = monthBk.reduce((s, b) => s + (Number(b.price) || 0), 0)
    return {
      total: monthBk.length,
      revenue: totalRevenue,
      guests: monthBk.filter(b => b.is_guest).length,
    }
  }, [allBookings, selectedResource, calYear, calMonth])

  // ── Handlers ─────────────────────────────────────────────────
  const handleOpenBooking = (dayObj) => {
    if (!dayObj || dayObj.isPast || dayObj.isBlocked || dayObj.isTooFar) return
    setBookingForm({ slot: 'evening', unitId: '', isGuest: false, bookerName: '', bookerPhone: '', bookerEmail: '', notes: '' })
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
    if (slot === 'full_day') return !dayObj.hasMorning && !dayObj.hasEvening && !dayObj.hasFullDay
    if (slot === 'morning') return !dayObj.hasMorning && !dayObj.hasFullDay
    if (slot === 'evening') return !dayObj.hasEvening && !dayObj.hasFullDay
    return true
  }

  const handleSubmitBooking = async () => {
    if (!selectedResource || !bookingDialog) return
    setSaving(true)
    try {
      const { slot, unitId, isGuest, bookerName, bookerPhone, bookerEmail, notes } = bookingForm
      let name = bookerName
      let email = bookerEmail
      let phone = bookerPhone

      // If resident mode, get info from resident
      if (!isGuest && unitId) {
        const res = residentMap[unitId]
        if (res) {
          name = name || res.name
          email = email || res.email || ''
          phone = phone || res.phone || ''
        }
      }

      if (!name) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש למלא שם', type: 'error' } }))
        setSaving(false)
        return
      }

      const price = getSlotPrice(slot)

      const booking = await createBooking({
        building_id: selectedBuilding.id,
        resource_id: selectedResource.id,
        unit_id: isGuest ? null : unitId || null,
        booker_name: name,
        booker_phone: phone,
        booker_email: email,
        booking_date: bookingDialog.dk,
        slot,
        status: 'confirmed',
        payment_status: 'pending',
        price,
        notes,
        is_guest: isGuest,
      })

      // Send notification emails
      try {
        const dateStr = new Date(bookingDialog.dk).toLocaleDateString('he-IL')
        const slotLabel = SLOTS[slot]?.label || slot
        const html = `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#3b82f6;">שריון חדש - ${selectedResource.name}</h2>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">תאריך</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${dateStr}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">משבצת</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${slotLabel}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">שם המזמין</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${name}</td></tr>
              ${phone ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">טלפון</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${phone}</td></tr>` : ''}
              ${isGuest ? '<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">סוג</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">אורח חיצוני</td></tr>' : ''}
              ${price > 0 ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">מחיר</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${formatCurrency(price)}</td></tr>` : ''}
              ${notes ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;">הערות</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${notes}</td></tr>` : ''}
            </table>
            ${price > 0 && selectedResource.payment_url ? `<a href="${selectedResource.payment_url}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;margin:8px 0;">לתשלום</a>` : ''}
          </div>
        `
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        // Send to vaad representative
        if (selectedResource.notify_email && token) {
          fetch(`https://stncskqjrmecjckxldvi.supabase.co/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              to: selectedResource.notify_email,
              subject: `שריון חדש: ${selectedResource.name} - ${dateStr}`,
              html,
              buildingId: selectedBuilding.id,
            }),
          }).catch(() => {})
        }

        // Send to booker
        if (email && token) {
          fetch(`https://stncskqjrmecjckxldvi.supabase.co/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              to: email,
              subject: `אישור שריון: ${selectedResource.name} - ${dateStr}`,
              html,
              buildingId: selectedBuilding.id,
            }),
          }).catch(() => {})
        }
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr)
      }

      setBookingDialog(null)
      refreshBookings()

      // Show payment redirect if applicable
      if (price > 0 && selectedResource.payment_url) {
        setPaymentRedirect({ url: selectedResource.payment_url, bookingId: booking?.id })
      }

      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון נוצר בהצלחה!', type: 'success' } }))
    } catch (err) {
      console.error('Booking failed:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה ביצירת השריון', type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  const handleCancelBooking = async (bookingId) => {
    await updateBooking(bookingId, { status: 'cancelled' })
    refreshBookings()
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'השריון בוטל', type: 'success' } }))
  }

  // Resource CRUD
  const openResourceForm = (resource) => {
    if (resource === 'new') {
      setResourceForm({
        name: '', description: '', price_morning: 0, price_evening: 0, price_full_day: 0,
        payment_url: '', max_advance_days: 30, residents_only: true, notify_email: '',
      })
    } else {
      setResourceForm({ ...resource })
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
      }
      if (resourceDialog === 'new') {
        data.blocked_dates = []
        data.active = true
        const created = await createResource(data)
        setSelectedResourceId(created?.id)
      } else {
        await updateResource(resourceDialog.id, data)
      }
      setResourceDialog(null)
      refreshResources()
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'נשמר בהצלחה', type: 'success' } }))
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשמירה', type: 'error' } }))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteResource = async (id) => {
    await removeResource(id)
    refreshResources()
    if (selectedResourceId === id) setSelectedResourceId(null)
  }

  const handleBlockDate = async () => {
    if (!blockDate || !selectedResource) return
    const current = selectedResource.blocked_dates || []
    if (current.includes(blockDate)) return
    await updateResource(selectedResource.id, { blocked_dates: [...current, blockDate] })
    setBlockDate('')
    refreshResources()
  }

  const handleUnblockDate = async (dateStr) => {
    if (!selectedResource) return
    const current = selectedResource.blocked_dates || []
    await updateResource(selectedResource.id, { blocked_dates: current.filter(d => d !== dateStr) })
    refreshResources()
  }

  // ── Month navigation ────────────────────────────────────────
  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  // ═════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════
  if (!selectedBuilding) {
    return <EmptyState icon={DoorOpen} title="בחר בניין" description="יש לבחור בניין כדי לנהל שריונים" />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DoorOpen}
        iconColor="violet"
        title="שריון חדרים"
        subtitle="הזמנת חדר דיירים, גג או מתקנים משותפים"
        actions={
          <Button onClick={() => openResourceForm('new')} className="gap-2">
            <Plus className="h-4 w-4" />
            חדר חדש
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--surface-hover)] p-1 rounded-xl w-fit">
        {[
          { key: 'calendar', label: 'לוח שריונים', icon: Calendar },
          { key: 'bookings', label: 'רשימת שריונים', icon: List },
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
          </button>
        ))}
      </div>

      {/* Resource selector */}
      {buildingResources.length > 0 && tab !== 'settings' && (
        <div className="flex gap-2 flex-wrap">
          {buildingResources.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedResourceId(r.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedResourceId === r.id
                  ? 'bg-violet-100 text-violet-800 border-2 border-violet-300 shadow-sm'
                  : 'bg-white border-2 border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              <DoorOpen className="h-4 w-4 inline-block ml-1.5" />
              {r.name}
            </button>
          ))}
        </div>
      )}

      {buildingResources.length === 0 && tab !== 'settings' && (
        <EmptyState
          icon={DoorOpen}
          title="אין חדרים מוגדרים"
          description="הוסף חדר או מתקן בהגדרות כדי להתחיל"
          action={
            <Button onClick={() => { setTab('settings'); openResourceForm('new') }} className="gap-2">
              <Plus className="h-4 w-4" />
              הוסף חדר
            </Button>
          }
        />
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* CALENDAR TAB                                              */}
      {/* ────────────────────────────────────────────────────────── */}
      {tab === 'calendar' && selectedResource && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm">
                    <CalendarDays className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">שריונים החודש</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">הכנסות החודש</p>
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.revenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm">
                    <UserPlus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">אורחים</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.guests}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {HEBREW_MONTHS[calMonth]} {calYear}
            </h3>
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-[var(--border)]">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`text-center py-2.5 text-xs font-bold ${
                  i === 6 ? 'text-blue-600 bg-blue-50/50' : 'text-[var(--text-secondary)]'
                }`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="min-h-[90px] border-b border-l border-[var(--border)] bg-slate-50/50" />

                const isToday = isSameDay(day.date, new Date())
                const canBook = !day.isPast && !day.isBlocked && !day.isTooFar && !day.hasFullDay
                const holidayName = day.holidays[0]?.hebrew

                return (
                  <div
                    key={day.dk}
                    onClick={() => canBook && handleOpenBooking(day)}
                    className={`min-h-[90px] border-b border-l border-[var(--border)] p-1.5 transition-all relative ${
                      day.isBlocked
                        ? 'bg-red-50/60 cursor-not-allowed'
                        : day.isPast || day.isTooFar
                        ? 'bg-slate-50/50 cursor-not-allowed opacity-60'
                        : day.isSaturday || day.isYomTov
                        ? 'bg-blue-50/40 cursor-pointer hover:bg-blue-50'
                        : canBook
                        ? 'bg-white cursor-pointer hover:bg-violet-50/40'
                        : 'bg-amber-50/30'
                    }`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold leading-none ${
                        isToday
                          ? 'bg-violet-600 text-white w-7 h-7 rounded-full flex items-center justify-center'
                          : day.isSaturday ? 'text-blue-600' : 'text-[var(--text-primary)]'
                      }`}>
                        {day.day}
                      </span>
                      {day.isBlocked && <Ban className="h-3.5 w-3.5 text-red-400" />}
                    </div>

                    {/* Holiday */}
                    {holidayName && (
                      <p className={`text-[9px] leading-tight truncate mb-1 ${
                        day.isYomTov ? 'text-blue-700 font-bold' : 'text-blue-500'
                      }`}>
                        {day.isYomTov && <Star className="h-2.5 w-2.5 inline ml-0.5" />}
                        {holidayName}
                      </p>
                    )}
                    {day.isSaturday && !holidayName && (
                      <p className="text-[9px] text-blue-500 mb-1">שבת</p>
                    )}

                    {/* Booking indicators */}
                    <div className="flex flex-wrap gap-0.5 mt-auto">
                      {day.hasFullDay && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">יממה</span>
                      )}
                      {!day.hasFullDay && day.hasMorning && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">בוקר</span>
                      )}
                      {!day.hasFullDay && day.hasEvening && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">ערב</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-[var(--border)]" /> פנוי</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100" /> בוקר תפוס</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-100" /> ערב תפוס</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-100" /> יממה תפוסה</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-50 border border-blue-200" /> שבת / חג</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> חסום</span>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* BOOKINGS LIST TAB                                         */}
      {/* ────────────────────────────────────────────────────────── */}
      {tab === 'bookings' && selectedResource && (
        <div className="space-y-2">
          {monthBookings.length === 0 ? (
            <EmptyState icon={CalendarDays} title="אין שריונים" description="לא נמצאו שריונים למשאב זה" />
          ) : (
            monthBookings
              .sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date))
              .map(bk => {
                const slotInfo = SLOTS[bk.slot] || SLOTS.evening
                const SlotIcon = slotInfo.icon
                const isCancelled = bk.status === 'cancelled'
                const isPast = new Date(bk.booking_date) < new Date(new Date().setHours(0, 0, 0, 0))

                return (
                  <div
                    key={bk.id}
                    className={`group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md transition-all ${
                      isCancelled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${
                      isCancelled ? 'from-slate-400 to-slate-500' : `from-${slotInfo.color}-500 to-${slotInfo.color}-600`
                    } flex items-center justify-center text-white shadow-sm`}>
                      <SlotIcon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {bk.booker_name}
                        </span>
                        {bk.is_guest && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">אורח</span>
                        )}
                        {isCancelled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">בוטל</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        <span>{new Date(bk.booking_date).toLocaleDateString('he-IL')}</span>
                        <span>{slotInfo.short}</span>
                        {bk.booker_phone && <span>{bk.booker_phone}</span>}
                      </div>
                    </div>

                    {bk.price > 0 && (
                      <div className="text-sm font-bold text-emerald-600">
                        {formatCurrency(bk.price)}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        isCancelled ? 'bg-red-400' : bk.payment_status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`} />
                      <span className={`text-xs ${
                        isCancelled ? 'text-red-600' : bk.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        {isCancelled ? 'בוטל' : bk.payment_status === 'paid' ? 'שולם' : 'ממתין'}
                      </span>
                    </div>

                    {!isCancelled && !isPast && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleCancelBooking(bk.id)}>
                          <XIcon className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* SETTINGS TAB                                              */}
      {/* ────────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Resource list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">חדרים ומתקנים</h3>
              <Button onClick={() => openResourceForm('new')} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                הוסף
              </Button>
            </div>

            {resources.filter(r => r.building_id === selectedBuilding?.id).map(r => (
              <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-sm">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--text-primary)]">{r.name}</p>
                  <div className="flex gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                    <span>בוקר: {formatCurrency(r.price_morning)}</span>
                    <span>ערב: {formatCurrency(r.price_evening)}</span>
                    <span>יממה: {formatCurrency(r.price_full_day)}</span>
                    <span>{r.residents_only ? 'דיירים בלבד' : 'דיירים + אורחים'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openResourceForm(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteResource(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Blocked dates for selected resource */}
          {selectedResource && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                ימים חסומים — {selectedResource.name}
              </h3>
              <div className="flex gap-2 items-end">
                <FormField
                  label="תאריך לחסימה"
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-48"
                />
                <Button onClick={handleBlockDate} disabled={!blockDate} className="gap-2">
                  <Ban className="h-4 w-4" />
                  חסום
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {(selectedResource.blocked_dates || []).sort().map(d => (
                  <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                    {new Date(d).toLocaleDateString('he-IL')}
                    <button onClick={() => handleUnblockDate(d)} className="hover:text-red-900">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {(selectedResource.blocked_dates || []).length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">אין ימים חסומים</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* BOOKING DIALOG                                            */}
      {/* ────────────────────────────────────────────────────────── */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-violet-500" />
              שריון {selectedResource?.name}
            </DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-4 mt-2">
              {/* Date display */}
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-center">
                <p className="text-lg font-bold text-violet-800">
                  {new Date(bookingDialog.dk).toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {bookingDialog.holidays?.[0]?.hebrew && (
                  <p className="text-sm text-violet-600 mt-0.5">
                    <Star className="h-3.5 w-3.5 inline ml-1" />
                    {bookingDialog.holidays[0].hebrew}
                  </p>
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
                    return (
                      <button
                        key={key}
                        disabled={!available}
                        onClick={() => setBookingForm(f => ({ ...f, slot: key }))}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          !available
                            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                            : isSelected
                            ? 'border-violet-400 bg-violet-50 text-violet-800 shadow-sm'
                            : 'border-[var(--border)] hover:border-violet-200 text-[var(--text-secondary)]'
                        }`}
                      >
                        <SlotIcon className={`h-5 w-5 mx-auto mb-1 ${isSelected ? 'text-violet-600' : ''}`} />
                        <p className="text-xs font-medium">{slot.short}</p>
                        <p className="text-[10px] mt-0.5">{formatCurrency(getSlotPrice(key))}</p>
                        {!available && <p className="text-[9px] text-red-400">תפוס</p>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Guest / Resident toggle */}
              {!selectedResource?.residents_only && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setBookingForm(f => ({ ...f, isGuest: false }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all text-sm ${
                      !bookingForm.isGuest
                        ? 'border-violet-400 bg-violet-50 text-violet-800'
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    דייר
                  </button>
                  <button
                    onClick={() => setBookingForm(f => ({ ...f, isGuest: true }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all text-sm ${
                      bookingForm.isGuest
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <UserPlus className="h-4 w-4" />
                    אורח
                  </button>
                </div>
              )}

              {/* Resident selector */}
              {!bookingForm.isGuest && (
                <FormSelect
                  label="דירה"
                  value={bookingForm.unitId}
                  onChange={(e) => {
                    const uid = e.target.value
                    const res = residentMap[uid]
                    setBookingForm(f => ({
                      ...f,
                      unitId: uid,
                      bookerName: res?.name || '',
                      bookerPhone: res?.phone || '',
                      bookerEmail: res?.email || '',
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

              {/* Booker details */}
              <FormField
                label="שם המזמין"
                value={bookingForm.bookerName}
                onChange={(e) => setBookingForm(f => ({ ...f, bookerName: e.target.value }))}
                placeholder="שם מלא"
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="טלפון"
                  value={bookingForm.bookerPhone}
                  onChange={(e) => setBookingForm(f => ({ ...f, bookerPhone: e.target.value }))}
                  placeholder="050-1234567"
                />
                <FormField
                  label="אימייל"
                  value={bookingForm.bookerEmail}
                  onChange={(e) => setBookingForm(f => ({ ...f, bookerEmail: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>

              <FormTextarea
                label="הערות"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="הערות נוספות..."
              />

              {/* Price summary */}
              {getSlotPrice(bookingForm.slot) > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="text-sm text-emerald-700 font-medium">עלות:</span>
                  <span className="text-lg font-bold text-emerald-700">{formatCurrency(getSlotPrice(bookingForm.slot))}</span>
                </div>
              )}

              {/* Payment info */}
              {selectedResource?.payment_url && getSlotPrice(bookingForm.slot) > 0 && (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  לאחר השריון תועבר לדף התשלום
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSubmitBooking} disabled={saving} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />
                  {saving ? 'שומר...' : 'אשר שריון'}
                </Button>
                <Button variant="outline" onClick={() => setBookingDialog(null)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────── */}
      {/* RESOURCE FORM DIALOG                                      */}
      {/* ────────────────────────────────────────────────────────── */}
      <Dialog open={!!resourceDialog} onOpenChange={() => setResourceDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resourceDialog === 'new' ? 'הוסף חדר / מתקן' : 'ערוך חדר / מתקן'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FormField
              label="שם החדר / מתקן"
              value={resourceForm.name || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, name: e.target.value }))}
              placeholder='למשל: חדר דיירים, גג, מועדון'
            />
            <FormTextarea
              label="תיאור"
              value={resourceForm.description || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, description: e.target.value }))}
              placeholder="תיאור המקום, כללי שימוש..."
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                label="מחיר בוקר"
                type="number"
                value={resourceForm.price_morning ?? 0}
                onChange={(e) => setResourceForm(f => ({ ...f, price_morning: e.target.value }))}
              />
              <FormField
                label="מחיר ערב"
                type="number"
                value={resourceForm.price_evening ?? 0}
                onChange={(e) => setResourceForm(f => ({ ...f, price_evening: e.target.value }))}
              />
              <FormField
                label="מחיר יממה"
                type="number"
                value={resourceForm.price_full_day ?? 0}
                onChange={(e) => setResourceForm(f => ({ ...f, price_full_day: e.target.value }))}
              />
            </div>

            <FormField
              label="קישור לתשלום (PayBox / Bit)"
              value={resourceForm.payment_url || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, payment_url: e.target.value }))}
              placeholder="https://paybox.co/..."
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="ימי הזמנה מראש (מקסימום)"
                type="number"
                value={resourceForm.max_advance_days ?? 30}
                onChange={(e) => setResourceForm(f => ({ ...f, max_advance_days: e.target.value }))}
              />
              <FormBool
                label="דיירים בלבד?"
                value={resourceForm.residents_only}
                onChange={(e) => setResourceForm(f => ({ ...f, residents_only: e.target.value }))}
              />
            </div>

            <FormField
              label="אימייל נציג ועד (לקבלת התראות)"
              value={resourceForm.notify_email || ''}
              onChange={(e) => setResourceForm(f => ({ ...f, notify_email: e.target.value }))}
              placeholder="vaad@building.co.il"
            />

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSaveResource} disabled={saving || !resourceForm.name} className="flex-1">
                {saving ? 'שומר...' : 'שמור'}
              </Button>
              <Button variant="outline" onClick={() => setResourceDialog(null)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────── */}
      {/* PAYMENT REDIRECT DIALOG                                   */}
      {/* ────────────────────────────────────────────────────────── */}
      <Dialog open={!!paymentRedirect} onOpenChange={() => setPaymentRedirect(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              תשלום
            </DialogTitle>
          </DialogHeader>
          {paymentRedirect && (
            <div className="space-y-4 mt-2 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto shadow-lg">
                <Check className="h-8 w-8 text-white" />
              </div>
              <p className="text-lg font-bold text-[var(--text-primary)]">השריון נוצר בהצלחה!</p>
              <p className="text-sm text-[var(--text-secondary)]">לחץ כדי לעבור לדף התשלום</p>
              <Button
                onClick={() => {
                  window.open(paymentRedirect.url, '_blank')
                  setPaymentRedirect(null)
                }}
                className="w-full gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                עבור לתשלום
              </Button>
              <Button variant="outline" onClick={() => setPaymentRedirect(null)} className="w-full">
                אשלם מאוחר יותר
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
