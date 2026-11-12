import { useState, useMemo, useEffect } from 'react'
import { useCollection } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { cn, formatCurrency } from '@/lib/utils'
import { vendorReputation } from '@/lib/reputation'
import { isWhatsappable, isMobile } from '@/lib/phone'
import { sendOrOpen, isWhatsappSystemEnabled, systemSendWhatsapp } from '@/lib/whatsapp'
import { toast } from '@/lib/toast'
import {
  Plus, Pencil, Trash2, Users, Ban, Phone, Mail,
  Shield, Clock, BarChart3, GitCompare,
  Award, Wrench, Store, Tags, Handshake, ShieldAlert, ChevronLeft, Send,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Canonical service domains (תחומי שירות) — covers all building needs and
// matches the seeded vendor database. Keep in sync with vendorMatch synonyms.
const CATEGORY_OPTIONS = [
  { value: 'אינסטלציה', label: 'אינסטלציה' },
  { value: 'חשמל', label: 'חשמל' },
  { value: 'מיזוג אוויר', label: 'מיזוג אוויר' },
  { value: 'דוד שמש', label: 'דוד שמש' },
  { value: 'ביוב ושאיבה', label: 'ביוב ושאיבה' },
  { value: 'מעליות', label: 'מעליות' },
  { value: 'אינטרקום', label: 'אינטרקום' },
  { value: 'שערים ודלתות אוטומטיות', label: 'שערים ודלתות אוטומטיות' },
  { value: 'מצלמות ואזעקות', label: 'מצלמות ואזעקות' },
  { value: 'כיבוי וגילוי אש', label: 'כיבוי וגילוי אש' },
  { value: 'גנרטור', label: 'גנרטור' },
  { value: 'משאבות מים', label: 'משאבות מים' },
  { value: 'גינון', label: 'גינון' },
  { value: 'ניקיון', label: 'ניקיון' },
  { value: 'הדברה', label: 'הדברה' },
  { value: 'מנעולן', label: 'מנעולן' },
  { value: 'איטום וגגות', label: 'איטום וגגות' },
  { value: 'צבע ושיפוצים', label: 'צבע ושיפוצים' },
  { value: 'זגגות', label: 'זגגות' },
  { value: 'בריכת שחייה', label: 'בריכת שחייה' },
  { value: 'חדר כושר', label: 'חדר כושר' },
  { value: 'גז מרכזי', label: 'גז מרכזי' },
  { value: 'פינוי אשפה ודחסנים', label: 'פינוי אשפה ודחסנים' },
  { value: 'בדיקת מעליות', label: 'בדיקת מעליות (בקרה)' },
  { value: 'בדיקת חשמל', label: 'בדיקת חשמל (בקרה)' },
  { value: 'בטיחות אש - בדיקות ואישורים', label: 'בטיחות אש — בדיקות ואישורים (בקרה)' },
  { value: 'חיטוי מאגרי מים', label: 'חיטוי מאגרי מים (בקרה)' },
  { value: 'מהנדס בניין', label: 'מהנדס בניין (בקרה)' },
  { value: 'יועץ נגישות', label: 'יועץ נגישות (בקרה)' },
  { value: 'בנייה ושיפוצים', label: 'בנייה ושיפוצים' },
  { value: 'אחזקה כללית', label: 'אחזקה כללית' },
  { value: 'שירותי חירום', label: 'שירותי חירום' },
  { value: 'אחר', label: 'אחר' },
]

// Division of the pool by the nature of the service:
//   regular    — ongoing maintenance / standing contracts (קבוע)
//   control    — periodic mandatory inspections & approvals (בקרה)
//   occasional — fault-driven, called when needed (מזדמן, the default)
const SERVICE_TYPE = {
  'מעליות': 'regular', 'גנרטור': 'regular', 'משאבות מים': 'regular',
  'אינטרקום': 'regular', 'גינון': 'regular', 'ניקיון': 'regular',
  'הדברה': 'regular', 'כיבוי וגילוי אש': 'regular', 'בריכת שחייה': 'regular',
  'חדר כושר': 'regular', 'גז מרכזי': 'regular', 'פינוי אשפה ודחסנים': 'regular',
  'בדיקת מעליות': 'control', 'בדיקת חשמל': 'control',
  'בטיחות אש - בדיקות ואישורים': 'control', 'מהנדס בניין': 'control',
  'חיטוי מאגרי מים': 'control', 'יועץ נגישות': 'control',
}
const serviceTypeOf = (cat) => SERVICE_TYPE[cat] || 'occasional'
const SERVICE_GROUPS = [
  { key: 'regular', label: 'נותני שירות קבועים', desc: 'אחזקה שוטפת וחוזי שירות' },
  { key: 'control', label: 'גורמי בקרה ובדיקות', desc: 'בדיקות ואישורים תקופתיים מחויבים' },
  { key: 'occasional', label: 'ספקים לפי צורך', desc: 'נקראים בעת תקלה' },
]

const EMPTY_FORM = {
  name: '',
  category: '',
  phone: '',
  email: '',
  contact_channel: 'auto',
  address: '',
  license_number: '',
  insurance_expiry: '',
  service_area: '',
  is_regular: false,
  available_24_7: false,
  preferred: false,
  rating: '3',
  is_blacklisted: false,
  sanctions: '',
  notes: '',
  specialties: '',
}

const TABS = [
  { key: 'my-vendors', label: 'הספקים שלי' },
  { key: 'invites', label: 'הזמנות למאגר' },
  { key: 'compare', label: 'השוואת ספקים' },
]

const EMPTY_STATS = { totalJobs: 0, completedJobs: 0, totalSpent: 0, avgResponseDays: null, onTimeRate: null }

// Insurance is flagged when it expires within this many days.
const INSURANCE_WARN_DAYS = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StarRating({ rating, interactive = false, onChange }) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span
        key={i}
        className={cn(
          'transition-all duration-200',
          i <= rating ? 'text-[var(--warning)]' : 'text-[var(--outline-variant)]',
          interactive && 'cursor-pointer hover:scale-125'
        )}
        onClick={interactive ? () => onChange?.(i) : undefined}
      >
        &#9733;
      </span>
    )
  }
  return <span className="text-base inline-flex gap-0.5">{stars}</span>
}

function getVendorStats(vendor, workOrders) {
  const vendorOrders = workOrders.filter(
    (wo) => wo.vendor_id === vendor.id || wo.vendor === vendor.name
  )
  const completed = vendorOrders.filter((wo) => wo.status === 'completed' || wo.status === 'הושלם')
  const totalSpent = completed.reduce((sum, wo) => sum + (Number(wo.cost) || Number(wo.actual_cost) || 0), 0)
  const avgResponseDays = vendor.avg_response_time || null
  const onTimeRate = null

  return {
    totalJobs: vendorOrders.length,
    completedJobs: completed.length,
    totalSpent,
    avgResponseDays,
    onTimeRate,
    reputation: vendorReputation(vendor, workOrders),
  }
}

function getVendorTags(vendor) {
  const tags = []
  if (vendor.preferred) tags.push({ label: 'מומלץ', variant: 'success' })
  if (vendor.available_24_7) tags.push({ label: 'זמין 24/7', variant: 'info' })
  if (vendor.license_number) tags.push({ label: 'רישיון', variant: 'default' })
  return tags
}

// Days until the vendor's insurance expires (negative = expired), or null.
function insuranceDays(vendor) {
  if (!vendor.insurance_expiry) return null
  const exp = new Date(vendor.insurance_expiry)
  if (Number.isNaN(exp.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((exp - today) / 86400000)
}

function InsuranceChip({ vendor }) {
  const days = insuranceDays(vendor)
  if (days === null) return <span className="text-[11px] text-[var(--text-muted)]">—</span>
  const cls = days < 0
    ? 'bg-[var(--danger-light)] text-[var(--danger)]'
    : days <= INSURANCE_WARN_DAYS
      ? 'bg-[var(--warning-light)] text-[var(--warning)]'
      : 'bg-[var(--success-light)] text-[var(--success)]'
  const label = days < 0 ? 'פג תוקף' : days <= INSURANCE_WARN_DAYS ? `פג בעוד ${days} ימים` : 'בתוקף'
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', cls)} title={vendor.insurance_expiry}>
      <Shield className="h-3 w-3" />{label}
    </span>
  )
}

// Vendor membership in the Vaad Plus pool — after the database is finalized the
// committee invites each vendor (WhatsApp) to confirm they want to receive the
// building's work requests.
const MEMBERSHIP = {
  pending: { label: 'ממתין להזמנה', variant: 'default' },
  invited: { label: 'הוזמן', variant: 'info' },
  agreed: { label: 'אישר הצטרפות', variant: 'success' },
  declined: { label: 'סירב', variant: 'danger' },
}

function MembershipBadge({ status }) {
  const m = MEMBERSHIP[status || 'pending'] || MEMBERSHIP.pending
  return <Badge variant={m.variant} className="text-[10px] whitespace-nowrap">{m.label}</Badge>
}

// Variables for the Meta-approved "vendor_invite" template (official channel).
const inviteTemplate = (vendor) => ({
  key: 'vendor_invite',
  variables: [vendor?.name || 'שלום', vendor?.category || 'שירותי תחזוקה לבניינים'],
})

function buildInviteMessage(vendor) {
  const trade = vendor?.category ? ` בתחום ${vendor.category}` : ''
  return `שלום${vendor?.name ? ' ' + vendor.name : ''},\n\n` +
    `אנחנו *ועד1* — מערכת לניהול תחזוקת בנייני מגורים. אנו מנהלים עבור ועדי בתים את הטיפול בתקלות ובעבודות, ומפנים אותן לספקים מהמאגר שלנו.\n\n` +
    `נשמח לצרף אתכם${trade} למאגר. מעת לעת, כשעולה צורך בבניין באזורכם, תקבלו פנייה לעבודה עם כל פרטי התקלה (כולל תמונה) — ישירות לנייד. אין כאן התחייבות לעבודות קבועות, אלא פניות לפי צורך.\n\n` +
    `שקיפות מלאה: שיתוף הפעולה כרוך בעמלה לכל עבודה שתתקבל דרך המערכת. הפרטים המלאים יסוכמו איתכם לאחר שתאשרו.\n\n` +
    `*אם אתם מעוניינים לקבל פניות לעבודות — השיבו "מאשר", ונמשיך משם.* תודה!\n` +
    `בברכה,\nתומר — ועד1`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VendorAvatar({ vendor }) {
  return (
    <span className="h-9 w-9 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[14px] font-bold shrink-0">
      {vendor.name?.charAt(0) || '?'}
    </span>
  )
}

function VendorNameCell({ vendor, stats }) {
  const tags = getVendorTags(vendor)
  const rep = stats?.reputation
  return (
    <div className="flex items-center gap-3 min-w-0">
      <VendorAvatar vendor={vendor} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{vendor.name}</span>
          {vendor.preferred && <Award className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />}
          {vendor.is_blacklisted && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--danger-light)] text-[var(--danger)]">
              <Ban className="h-3 w-3" />רשימה שחורה
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          {tags.map((t) => <Badge key={t.label} variant={t.variant} className="text-[10px] px-1.5 py-0">{t.label}</Badge>)}
          {rep?.flag && rep.flag !== 'good' && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
              rep.flag === 'blacklist' ? 'bg-[var(--danger-light)] text-[var(--danger)]'
                : rep.flag === 'watch' ? 'bg-[var(--warning-light)] text-[var(--warning)]'
                  : 'bg-[var(--success-light)] text-[var(--success)]')}>
              {rep.label} ({rep.jobCount} עבודות)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function VendorPerformance({ vendor, stats, workOrders }) {
  const vendorOrders = workOrders.filter(
    (wo) => wo.vendor_id === vendor.id || wo.vendor === vendor.name
  )

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="עבודות שהושלמו" icon={Wrench} color="blue" value={String(stats.completedJobs)} />
        <StatCard label='סה"כ הוצאה' icon={BarChart3} color="emerald" value={stats.totalSpent > 0 ? formatCurrency(stats.totalSpent) : '—'} />
        <StatCard label="דירוג ממוצע" icon={Award} color="amber" value={vendor.rating ? String(vendor.rating) : '—'} />
        <StatCard label="סיום בזמן" icon={Clock} color="slate" value={stats.onTimeRate !== null ? `${stats.onTimeRate}%` : '—'} />
      </div>

      {/* Work orders list */}
      <h4 className="text-[14px] font-bold text-[var(--text-primary)]">עבודות אחרונות</h4>
      {vendorOrders.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">אין עבודות רשומות לספק זה</p>
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead><tr><th>עבודה</th><th>תאריך</th><th className="!text-left">עלות</th><th>סטטוס</th></tr></thead>
              <tbody>
                {vendorOrders.slice(0, 10).map((wo) => (
                  <tr key={wo.id}>
                    <td className="min-w-[160px] font-semibold">{wo.title || wo.description || 'עבודה'}</td>
                    <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)] num-tabular">{wo.date || wo.created_at || ''}</td>
                    <td className="whitespace-nowrap !text-left font-bold num-tabular">
                      {(wo.cost || wo.actual_cost) ? formatCurrency(Number(wo.cost || wo.actual_cost)) : '—'}
                    </td>
                    <td><Badge variant={wo.status === 'completed' || wo.status === 'הושלם' ? 'success' : 'warning'}>{wo.status || 'לא ידוע'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ComparisonTable({ vendors, statsMap }) {
  if (vendors.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="בחר ספקים להשוואה"
        description='סמן עד 3 ספקים בלשונית "הספקים שלי" כדי להשוות ביניהם'
      />
    )
  }

  const rows = [
    { label: 'התמחות', render: (v) => v.category || '—' },
    { label: 'דירוג', render: (v) => <StarRating rating={v.rating || 0} /> },
    { label: 'עבודות שהושלמו', render: (v) => statsMap[v.id]?.completedJobs ?? 0 },
    { label: 'סה"כ הוצאה', render: (v) => {
      const spent = statsMap[v.id]?.totalSpent
      return spent ? formatCurrency(spent) : '—'
    }},
    { label: 'זמן תגובה (ימים)', render: (v) => statsMap[v.id]?.avgResponseDays ?? '—' },
    { label: 'סיום בזמן', render: (v) => {
      const rate = statsMap[v.id]?.onTimeRate
      return rate !== null && rate !== undefined ? `${rate}%` : '—'
    }},
    { label: 'טלפון', render: (v) => v.phone || '—' },
    { label: 'זמין 24/7', render: (v) => v.available_24_7 ? 'כן' : 'לא' },
    { label: 'מומלץ', render: (v) => v.preferred ? 'כן' : 'לא' },
    { label: 'חסום', render: (v) => v.is_blacklisted ? <Badge variant="danger">כן</Badge> : 'לא' },
    { label: 'ביטוח', render: (v) => <InsuranceChip vendor={v} /> },
    { label: 'רישיון', render: (v) => v.license_number || '—' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="ds-table">
        <thead>
          <tr>
            <th className="min-w-[120px]">קריטריון</th>
            {vendors.map((v) => (
              <th key={v.id} className="min-w-[150px] !text-[var(--text-primary)] !font-semibold">{v.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="text-[var(--text-secondary)] font-medium whitespace-nowrap">{row.label}</td>
              {vendors.map((v) => (
                <td key={v.id} className="num-tabular">{row.render(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FILTER_CARD = 'p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]'
const LEDGER_CARD = 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden'

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function Vendors() {
  const { data: allVendors, create, update, remove, isSaving, isLoading } = useCollection('vendors')
  const { data: workOrders } = useCollection('workOrders')

  const [activeTab, setActiveTab] = useState('my-vendors')
  const [membershipFilter, setMembershipFilter] = useState('pending')
  const [inviteCategoryFilter, setInviteCategoryFilter] = useState('')
  useEffect(() => { isWhatsappSystemEnabled() }, []) // warm the gateway flag
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailVendor, setDetailVendor] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [performanceVendor, setPerformanceVendor] = useState(null)
  const [compareIds, setCompareIds] = useState([])

  // Pre-compute stats for all vendors
  const statsMap = useMemo(() => {
    const map = {}
    allVendors.forEach((v) => {
      map[v.id] = getVendorStats(v, workOrders)
    })
    return map
  }, [allVendors, workOrders])

  // Filter vendors (search + category; status applied separately so the tab
  // counts reflect the current search/category)
  const searched = useMemo(() => {
    let result = allVendors
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.category?.toLowerCase().includes(q) ||
          v.phone?.toLowerCase().includes(q) ||
          v.email?.toLowerCase().includes(q)
      )
    }
    if (categoryFilter) {
      result = result.filter((v) => v.category === categoryFilter)
    }
    return result
  }, [allVendors, search, categoryFilter])

  const filtered = useMemo(
    () => (statusFilter === 'blacklisted' ? searched.filter((v) => v.is_blacklisted === true) : searched),
    [searched, statusFilter],
  )

  // Compare vendors
  const compareVendors = useMemo(() => {
    return allVendors.filter((v) => compareIds.includes(v.id))
  }, [allVendors, compareIds])

  // KPIs — derived from the already-loaded vendor list
  const kpi = useMemo(() => {
    const active = allVendors.filter((v) => !v.is_blacklisted)
    const categories = new Set(allVendors.map((v) => v.category).filter(Boolean))
    const byType = { regular: 0, control: 0, occasional: 0 }
    allVendors.forEach((v) => { byType[serviceTypeOf(v.category)]++ })
    const agreed = allVendors.filter((v) => v.membership_status === 'agreed').length
    const invited = allVendors.filter((v) => v.membership_status === 'invited').length
    let expired = 0
    let expiring = 0
    active.forEach((v) => {
      const d = insuranceDays(v)
      if (d === null) return
      if (d < 0) expired++
      else if (d <= INSURANCE_WARN_DAYS) expiring++
    })
    return {
      total: allVendors.length,
      blacklisted: allVendors.length - active.length,
      categories: categories.size,
      byType, agreed, invited, expired, expiring,
    }
  }, [allVendors])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (vendor) => {
    setEditingId(vendor.id)
    setForm({
      name: vendor.name || '',
      category: vendor.category || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      contact_channel: vendor.contact_channel || 'auto',
      address: vendor.address || '',
      license_number: vendor.license_number || '',
      insurance_expiry: vendor.insurance_expiry || '',
      service_area: vendor.service_area || '',
      is_regular: vendor.is_regular || false,
      available_24_7: vendor.available_24_7 || false,
      preferred: vendor.preferred || false,
      rating: String(vendor.rating || 3),
      is_blacklisted: vendor.is_blacklisted || false,
      sanctions: vendor.sanctions || '',
      notes: vendor.notes || '',
      specialties: vendor.specialties || '',
    })
    setFormOpen(true)
    setDetailVendor(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Vendors are WhatsApp-first: a valid Israeli mobile is required so the
    // whole flow (invite → confirm → quote requests) can run over WhatsApp.
    if (!isMobile(form.phone)) {
      toast('נדרש מספר נייד ישראלי תקין (05X) — כל התקשורת עם ספקים היא בוואטסאפ', 'error')
      return
    }
    const data = {
      ...form,
      rating: Number(form.rating),
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    setFormOpen(false)
  }

  const setField = (field) => (e) => {
    const val = e?.target?.value !== undefined ? e.target.value : e
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  // Invite a vendor to the pool — via the GreenAPI gateway when enabled, else
  // opens manual WhatsApp / phone. Marks the vendor invited either way.
  const sendInvite = async (vendor) => {
    const sent = await sendOrOpen(vendor.phone, buildInviteMessage(vendor), { audience: 'vendor', template: inviteTemplate(vendor) })
    if (sent) toast('ההזמנה נשלחה בוואטסאפ דרך המערכת')
    await update(vendor.id, { membership_status: 'invited', invited_at: new Date().toISOString() })
  }

  // Bulk: send the invite to every pending vendor in sequence (system gateway
  // only — paced to avoid spam flags). Manual wa.me would open many tabs, so it
  // requires the GreenAPI connection to be active.
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0 })
  const sendBulkInvites = async () => {
    if (!(await isWhatsappSystemEnabled())) {
      toast('לשליחה מרוכזת יש להפעיל "חיבור פעיל" בהגדרות מערכת ← וואטסאפ', 'error')
      return
    }
    const targets = allVendors.filter(
      (v) => !v.is_blacklisted && (v.membership_status || 'pending') === 'pending' && isMobile(v.phone),
    )
    if (targets.length === 0) { toast('אין ספקים ממתינים עם מספר וואטסאפ תקין', 'info'); return }
    if (!window.confirm(`לשלוח הזמנת שיתוף פעולה ל-${targets.length} ספקים ממתינים? השליחה תיקח כדקה לכל ~50 ספקים.`)) return
    setBulk({ running: true, done: 0, total: targets.length })
    let sent = 0
    for (const v of targets) {
      const res = await systemSendWhatsapp(v.phone, buildInviteMessage(v), { audience: 'vendor', template: inviteTemplate(v) })
      if (res.sent) { sent++; await update(v.id, { membership_status: 'invited', invited_at: new Date().toISOString() }) }
      setBulk((b) => ({ ...b, done: b.done + 1 }))
      await new Promise((r) => setTimeout(r, 1200)) // pacing between messages
    }
    setBulk({ running: false, done: 0, total: 0 })
    toast(`נשלחו ${sent} הזמנות מתוך ${targets.length}`, sent > 0 ? 'success' : 'error')
  }

  const setMembership = async (vendor, status) => {
    await update(vendor.id, { membership_status: status })
  }

  const handleBlacklist = async (vendor) => {
    await update(vendor.id, { is_blacklisted: !vendor.is_blacklisted })
    toast(vendor.is_blacklisted ? 'הספק הוסר מהרשימה השחורה' : 'הספק נוסף לרשימה השחורה')
  }

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const header = (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מאגר ספקים</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          <span className="num-tabular">{allVendors.length}</span> ספקים במערכת • נותני שירות, גורמי בקרה וספקים לפי צורך
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TabGroup tabs={TABS.map((t) => (t.key === 'compare' && compareIds.length ? { ...t, count: compareIds.length } : t))} activeTab={activeTab} onChange={setActiveTab} />
        <Button onClick={openCreate}><Plus className="h-4 w-4" />ספק חדש</Button>
      </div>
    </div>
  )

  if (isLoading) return (
    <div className="space-y-6">
      {header}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  const compareMode = compareIds.length > 0

  return (
    <div className="space-y-6">
      {header}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="ספקים במאגר" icon={Store} color="blue"
          value={String(kpi.total)}
          sub={`${kpi.byType.regular} קבועים • ${kpi.byType.control} בקרה • ${kpi.byType.occasional} לפי צורך`}
          footer={kpi.blacklisted ? (
            <button onClick={() => { setActiveTab('my-vendors'); setStatusFilter('blacklisted') }} className="text-[var(--danger)] font-semibold hover:underline">
              {kpi.blacklisted} ברשימה שחורה ←
            </button>
          ) : null} />
        <StatCard label="תחומי שירות מכוסים" icon={Tags} color="purple"
          value={String(kpi.categories)}
          note={`מתוך ${CATEGORY_OPTIONS.length}`}
          progress={CATEGORY_OPTIONS.length ? Math.round((kpi.categories / CATEGORY_OPTIONS.length) * 100) : 0} />
        <StatCard label="אישרו הצטרפות למאגר" icon={Handshake} color="emerald"
          value={String(kpi.agreed)}
          sub={`${kpi.invited} הוזמנו וממתינים לתשובה`}
          progress={kpi.total ? Math.round((kpi.agreed / kpi.total) * 100) : 0} />
        <StatCard label="ביטוח פג / עומד לפוג" icon={ShieldAlert}
          color={kpi.expired ? 'red' : kpi.expiring ? 'amber' : 'emerald'}
          value={String(kpi.expired + kpi.expiring)}
          sub={kpi.expired + kpi.expiring
            ? `${kpi.expired} פגי תוקף • ${kpi.expiring} בתוך ${INSURANCE_WARN_DAYS} יום`
            : 'כל הביטוחים הרשומים בתוקף ✓'} />
      </div>

      {/* ================================================================== */}
      {/* TAB 1 - My Vendors */}
      {/* ================================================================== */}
      {activeTab === 'my-vendors' && (
        <div className="space-y-4">
          {/* Filter card */}
          <div className={cn(FILTER_CARD, 'space-y-3')}>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="חיפוש לפי שם, התמחות, טלפון..."
                />
              </div>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={[{ value: '', label: 'כל ההתמחויות' }, ...CATEGORY_OPTIONS]}
                className="sm:w-60"
                aria-label="סינון לפי התמחות"
              />
            </div>
            <TabGroup
              tabs={[
                { key: 'all', label: 'הכל', count: searched.length },
                { key: 'blacklisted', label: 'רשימה שחורה', icon: Ban, count: searched.filter((v) => v.is_blacklisted === true).length },
              ]}
              activeTab={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          {/* Compare mode indicator */}
          {compareMode && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] border border-[var(--border)]">
              <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface)] text-[var(--primary)]"><GitCompare className="h-4 w-4" /></span>
              <span className="text-[13px] text-[var(--primary-dark)] font-semibold num-tabular">
                {compareIds.length}/3 ספקים נבחרו להשוואה
              </span>
              <div className="flex gap-2 ms-auto">
                <Button size="sm" variant="outline" onClick={() => { setActiveTab('compare') }}>השווה עכשיו</Button>
                <Button size="sm" variant="ghost" onClick={() => setCompareIds([])}>נקה בחירה</Button>
              </div>
            </div>
          )}

          {/* Vendor ledger */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="אין ספקים"
              description={search || categoryFilter ? 'לא נמצאו תוצאות לחיפוש' : 'לא נוספו ספקים עדיין'}
              actionLabel={!search && !categoryFilter ? 'הוסף ספק' : undefined}
              onAction={!search && !categoryFilter ? openCreate : undefined}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className={cn(LEDGER_CARD, 'hidden md:block')}>
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        {compareMode && <th className="w-8"></th>}
                        <th>ספק</th>
                        <th>התמחות</th>
                        <th>טלפון</th>
                        <th>דירוג</th>
                        <th>עבודות</th>
                        <th>ביטוח</th>
                        <th>סטטוס במאגר</th>
                        <th></th>
                      </tr>
                    </thead>
                    {SERVICE_GROUPS.map((g) => {
                      const group = filtered.filter((v) => serviceTypeOf(v.category) === g.key)
                      if (group.length === 0) return null
                      return (
                        <tbody key={g.key}>
                          <tr className="!bg-[var(--bg)] hover:!bg-[var(--bg)]">
                            <td colSpan={compareMode ? 9 : 8} className="!py-2">
                              <span className="text-[12px] font-bold text-[var(--text-primary)]">{g.label}</span>
                              <span className="text-[11px] text-[var(--text-muted)] ms-2">{g.desc} · <span className="num-tabular">{group.length}</span></span>
                            </td>
                          </tr>
                          {group.map((vendor) => {
                            const stats = statsMap[vendor.id] || EMPTY_STATS
                            const selected = compareIds.includes(vendor.id)
                            return (
                              <tr
                                key={vendor.id}
                                onClick={() => !compareMode && setDetailVendor(vendor)}
                                className={cn(
                                  !compareMode && 'cursor-pointer',
                                  selected && '!bg-[var(--surface-secondary)]',
                                  vendor.is_blacklisted && 'opacity-60',
                                )}
                              >
                                {compareMode && (
                                  <td onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => toggleCompare(vendor.id)}
                                      className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)] cursor-pointer"
                                    />
                                  </td>
                                )}
                                <td className="min-w-[220px]"><VendorNameCell vendor={vendor} stats={stats} /></td>
                                <td className="whitespace-nowrap">
                                  {vendor.category
                                    ? <span className="px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold">{vendor.category}</span>
                                    : <span className="text-[var(--text-muted)]">—</span>}
                                </td>
                                <td className="whitespace-nowrap text-[12px] num-tabular" dir="ltr">{vendor.phone || <span className="text-[var(--text-muted)]">—</span>}</td>
                                <td className="whitespace-nowrap">{vendor.rating > 0 ? <StarRating rating={vendor.rating} /> : <span className="text-[var(--text-muted)]">—</span>}</td>
                                <td className="whitespace-nowrap text-[12px]">
                                  <span className="font-bold num-tabular">{stats.completedJobs}</span>
                                  {stats.avgResponseDays !== null && (
                                    <span className="block text-[11px] text-[var(--text-muted)]"><Clock className="inline h-3 w-3" /> {stats.avgResponseDays} ימים</span>
                                  )}
                                </td>
                                <td><InsuranceChip vendor={vendor} /></td>
                                <td><MembershipBadge status={vendor.membership_status} /></td>
                                <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-0.5">
                                    <button onClick={() => setDetailVendor(vendor)} title="פרטים" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-secondary)]"><ChevronLeft className="h-4 w-4" /></button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
                  מציג <span className="num-tabular">{filtered.length}</span> מתוך <span className="num-tabular">{allVendors.length}</span> ספקים
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-5">
                {SERVICE_GROUPS.map((g) => {
                  const group = filtered.filter((v) => serviceTypeOf(v.category) === g.key)
                  if (group.length === 0) return null
                  return (
                    <div key={g.key} className="space-y-2">
                      <div className="flex items-baseline gap-2 border-b border-[var(--border)] pb-1.5">
                        <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{g.label}</h3>
                        <span className="text-[11px] text-[var(--text-muted)]">{g.desc} · {group.length}</span>
                      </div>
                      {group.map((vendor) => {
                        const stats = statsMap[vendor.id] || EMPTY_STATS
                        const selected = compareIds.includes(vendor.id)
                        return (
                          <div
                            key={vendor.id}
                            onClick={() => !compareMode && setDetailVendor(vendor)}
                            className={cn(
                              'p-3 rounded-[var(--radius)] border bg-[var(--surface)] shadow-[var(--shadow)] space-y-2',
                              selected ? 'border-[var(--primary)]' : 'border-[var(--border)]',
                              !compareMode && 'cursor-pointer',
                              vendor.is_blacklisted && 'opacity-60',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <VendorNameCell vendor={vendor} stats={stats} />
                              {compareMode && (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => toggleCompare(vendor.id)}
                                  className="h-4 w-4 mt-1 rounded border-[var(--border)] accent-[var(--primary)] cursor-pointer shrink-0"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {vendor.category && <span className="px-2 py-0.5 rounded-full bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold">{vendor.category}</span>}
                              <MembershipBadge status={vendor.membership_status} />
                              <InsuranceChip vendor={vendor} />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-light)]">
                              <span className="flex items-center gap-1.5 num-tabular" dir="ltr">{vendor.phone && <><Phone className="h-3 w-3 text-[var(--text-muted)]" />{vendor.phone}</>}</span>
                              <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /><span className="num-tabular">{stats.completedJobs}</span> עבודות</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2 - Membership invitations */}
      {/* ================================================================== */}
      {activeTab === 'invites' && (() => {
        const counts = allVendors.reduce((acc, v) => {
          const s = v.membership_status || 'pending'
          acc[s] = (acc[s] || 0) + 1
          return acc
        }, {})
        // Vendors are WhatsApp-first: only mobile numbers that can receive
        // WhatsApp appear in the invite flow (others are counted + surfaced).
        const noMobile = allVendors.filter((v) => !v.is_blacklisted && !isMobile(v.phone)).length
        const list = allVendors
          .filter((v) => !v.is_blacklisted && isMobile(v.phone))
          .filter((v) => (membershipFilter === 'all' ? true : (v.membership_status || 'pending') === membershipFilter))
          .filter((v) => (inviteCategoryFilter ? v.category === inviteCategoryFilter : true))
          .slice()
          .sort((a, b) => (a.category || '').localeCompare(b.category || '', 'he'))

        const inviteActions = (v, status) => (
          <div className="flex gap-1.5 flex-wrap">
            {v.phone && (
              <Button size="sm" variant="outline" onClick={() => sendInvite(v)}>
                {isWhatsappable(v.phone) ? '📨' : '📞'} {status === 'pending' ? 'שלח הזמנה' : 'שלח שוב'}
              </Button>
            )}
            {status !== 'agreed' && (
              <Button size="sm" variant="ghost" className="text-[var(--success)]" onClick={() => setMembership(v, 'agreed')}>✓ אישר</Button>
            )}
            {status !== 'declined' && (
              <Button size="sm" variant="ghost" className="text-[var(--danger)]" onClick={() => setMembership(v, 'declined')}>✗ סירב</Button>
            )}
          </div>
        )

        return (
          <div className="space-y-4">
            <SectionCard
              icon={Send}
              title="הזמנת ספקים למאגר ועד1"
              subtitle='לחיצה על "שלח הזמנה" מסמנת את הספק כ"הוזמן"; לאחר תשובתו סמן "אישר" או "סירב". רק ספק שאישר מקבל בקשות לקריאות.'
              actions={
                <Button size="sm" variant="outline" onClick={sendBulkInvites} disabled={bulk.running}>
                  {bulk.running ? `שולח ${bulk.done}/${bulk.total}...` : `📨 שלח לכל הממתינים (${counts.pending || 0})`}
                </Button>
              }
            />

            {/* Status + category filters */}
            <div className={cn(FILTER_CARD, 'flex flex-col lg:flex-row lg:items-center gap-3')}>
              <TabGroup
                tabs={[
                  { key: 'pending', label: 'ממתינים', count: counts.pending || 0 },
                  { key: 'invited', label: 'הוזמנו', count: counts.invited || 0 },
                  { key: 'agreed', label: 'אישרו', count: counts.agreed || 0 },
                  { key: 'declined', label: 'סירבו', count: counts.declined || 0 },
                  { key: 'all', label: 'הכל' },
                ]}
                activeTab={membershipFilter}
                onChange={setMembershipFilter}
              />
              <Select
                value={inviteCategoryFilter}
                onChange={(e) => setInviteCategoryFilter(e.target.value)}
                options={[{ value: '', label: 'כל הקטגוריות' }, ...CATEGORY_OPTIONS]}
                className="lg:w-60"
                aria-label="סינון לפי קטגוריה"
              />
              {noMobile > 0 && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-[var(--warning-light)] text-[var(--warning)] font-semibold">
                  {noMobile} ספקים ללא נייד וואטסאפ מוסתרים — עדכן להם מספר נייד
                </span>
              )}
            </div>

            {list.length === 0 ? (
              <EmptyState icon={Users} title="אין ספקים בסטטוס זה" description="בחר סטטוס אחר או הוסף ספקים." />
            ) : (
              <>
                <div className={cn(LEDGER_CARD, 'hidden md:block')}>
                  <div className="overflow-x-auto">
                    <table className="ds-table">
                      <thead><tr><th>ספק</th><th>קטגוריה</th><th>טלפון</th><th>סטטוס</th><th>פעולות</th></tr></thead>
                      <tbody>
                        {list.map((v) => {
                          const status = v.membership_status || 'pending'
                          return (
                            <tr key={v.id}>
                              <td className="min-w-[180px]">
                                <div className="flex items-center gap-3"><VendorAvatar vendor={v} /><span className="font-semibold">{v.name}</span></div>
                              </td>
                              <td className="whitespace-nowrap text-[12px]">{v.category || '—'}</td>
                              <td className="whitespace-nowrap text-[12px] num-tabular" dir="ltr">{v.phone}</td>
                              <td><MembershipBadge status={status} /></td>
                              <td className="whitespace-nowrap">{inviteActions(v, status)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
                    מציג <span className="num-tabular">{list.length}</span> ספקים
                  </div>
                </div>
                <div className="md:hidden space-y-2">
                  {list.map((v) => {
                    const status = v.membership_status || 'pending'
                    return (
                      <div key={v.id} className="p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <VendorAvatar vendor={v} />
                            <div className="min-w-0">
                              <p className="font-semibold text-[13px] text-[var(--text-primary)] truncate">{v.name}</p>
                              <p className="text-[11px] text-[var(--text-secondary)]">{v.category}{v.phone ? ` · ${v.phone}` : ''}</p>
                            </div>
                          </div>
                          <MembershipBadge status={status} />
                        </div>
                        {inviteActions(v, status)}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* ================================================================== */}
      {/* TAB 3 - Compare Vendors */}
      {/* ================================================================== */}
      {activeTab === 'compare' && (
        <SectionCard
          icon={GitCompare}
          title="השוואת ספקים"
          subtitle={compareVendors.length === 0 ? 'בחר עד 3 ספקים מהרשימה להשוואה' : `משווה ${compareVendors.length} ספקים`}
          actions={compareVendors.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setCompareIds([])}>נקה השוואה</Button>
          ) : null}
        >
          {/* Quick-select chips if no vendors chosen */}
          {compareVendors.length === 0 && allVendors.length > 0 && (
            <div className="p-4 border-b border-[var(--border)] space-y-2">
              <p className="text-[12px] text-[var(--text-secondary)]">בחר עד 3 ספקים:</p>
              <div className="flex flex-wrap gap-2">
                {allVendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => toggleCompare(v.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12px] border transition-colors cursor-pointer',
                      compareIds.includes(v.id)
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                    )}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ComparisonTable vendors={compareVendors} statsMap={statsMap} />
        </SectionCard>
      )}

      {/* ================================================================== */}
      {/* Detail Modal */}
      {/* ================================================================== */}
      <DetailModal
        open={!!detailVendor}
        onOpenChange={() => setDetailVendor(null)}
        title={detailVendor ? detailVendor.name : ''}
        onEdit={() => openEdit(detailVendor)}
      >
        {detailVendor && (
          <>
            <DetailRow label="שם" value={detailVendor.name} />
            <DetailRow label="התמחות" value={detailVendor.category} />
            <DetailRow label="טלפון" value={detailVendor.phone} />
            <DetailRow label="אימייל" value={detailVendor.email} />
            <DetailRow label="כתובת" value={detailVendor.address} />
            <DetailRow label="מספר רישיון" value={detailVendor.license_number} />
            <DetailRow
              label="תוקף ביטוח"
              value={detailVendor.insurance_expiry ? (
                <span className="inline-flex items-center gap-2"><span className="num-tabular">{detailVendor.insurance_expiry}</span><InsuranceChip vendor={detailVendor} /></span>
              ) : null}
            />
            <DetailRow label="אזור שירות" value={detailVendor.service_area} />
            <DetailRow label="סטטוס במאגר" value={<MembershipBadge status={detailVendor.membership_status} />} />
            {detailVendor.specialties && (
              <DetailRow
                label="התמחויות"
                value={
                  <div className="flex flex-wrap gap-1">
                    {detailVendor.specialties.split(',').map((s, i) => (
                      <Badge key={i} variant="info">{s.trim()}</Badge>
                    ))}
                  </div>
                }
              />
            )}
            <DetailRow
              label="זמינות 24/7"
              value={detailVendor.available_24_7 ? <Badge variant="info">כן</Badge> : 'לא'}
            />
            <DetailRow
              label="מומלץ"
              value={detailVendor.preferred ? <Badge variant="success">מומלץ</Badge> : 'לא'}
            />
            <DetailRow
              label="דירוג"
              value={<StarRating rating={detailVendor.rating} />}
            />
            <DetailRow
              label="חסום"
              value={detailVendor.is_blacklisted ? <Badge variant="danger">חסום</Badge> : 'לא'}
            />
            <DetailRow label="סנקציות" value={detailVendor.sanctions} />
            <DetailRow label="הערות" value={detailVendor.notes} />

            {/* Stats summary */}
            {statsMap[detailVendor.id] && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h4 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">ביצועים</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1"><Wrench className="h-3 w-3" />עבודות</p>
                    <p className="text-[18px] font-bold num-tabular text-[var(--text-primary)]">{statsMap[detailVendor.id].completedJobs}</p>
                  </div>
                  <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)]">
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1"><BarChart3 className="h-3 w-3" />הוצאה</p>
                    <p className="text-[18px] font-bold num-tabular text-[var(--text-primary)]">
                      {statsMap[detailVendor.id].totalSpent > 0 ? formatCurrency(statsMap[detailVendor.id].totalSpent) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Contact quick info */}
            {(detailVendor.phone || detailVendor.email) && (
              <div className="flex flex-wrap gap-3 pt-3 text-[12px] text-[var(--text-secondary)]">
                {detailVendor.phone && <span className="flex items-center gap-1.5 num-tabular" dir="ltr"><Phone className="h-3 w-3 text-[var(--text-muted)]" />{detailVendor.phone}</span>}
                {detailVendor.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-[var(--text-muted)]" />{detailVendor.email}</span>}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => openEdit(detailVendor)}>
                <Pencil className="h-3.5 w-3.5" />
                עריכה
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPerformanceVendor(detailVendor)
                  setDetailVendor(null)
                }}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                ביצועים
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  toggleCompare(detailVendor.id)
                }}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {compareIds.includes(detailVendor.id) ? 'הסר מהשוואה' : 'הוסף להשוואה'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={detailVendor.is_blacklisted
                  ? 'text-[var(--success)] border-[var(--success)]/30 hover:bg-[var(--success-light)]'
                  : 'text-[var(--danger)] border-[var(--danger)]/30 hover:bg-[var(--danger-light)]'}
                onClick={() => handleBlacklist(detailVendor)}
              >
                <Ban className="h-3.5 w-3.5" />
                {detailVendor.is_blacklisted ? 'הסר מרשימה שחורה' : 'הוסף לרשימה שחורה'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDetailVendor(null)
                  setDeleteTarget(detailVendor)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                מחיקה
              </Button>
            </div>
          </>
        )}
      </DetailModal>

      {/* ================================================================== */}
      {/* Performance Modal */}
      {/* ================================================================== */}
      <Dialog open={!!performanceVendor} onOpenChange={() => setPerformanceVendor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              ביצועים — {performanceVendor?.name}
            </DialogTitle>
          </DialogHeader>
          {performanceVendor && (
            <VendorPerformance
              vendor={performanceVendor}
              stats={statsMap[performanceVendor.id] || EMPTY_STATS}
              workOrders={workOrders}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* Delete Confirm */}
      {/* ================================================================== */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? deleteTarget.name || 'ספק' : ''}
      />

      {/* ================================================================== */}
      {/* Create/Edit Dialog */}
      {/* ================================================================== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת ספק' : 'ספק חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="שם"
              value={form.name}
              onChange={setField('name')}
              required
            />
            <FormSelect
              label="התמחות"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
              placeholder="בחר התמחות"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="טלפון"
                value={form.phone}
                onChange={setField('phone')}
              />
              <FormField
                label="אימייל"
                type="email"
                value={form.email}
                onChange={setField('email')}
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <label className="text-[12px] font-semibold text-[var(--text-secondary)]">איך הספק מקבל פניות?</label>
              <Select
                value={form.contact_channel}
                onChange={setField('contact_channel')}
                options={[
                  { value: 'auto', label: 'אוטומטי — וואטסאפ, ואם אין אז מייל' },
                  { value: 'whatsapp', label: 'וואטסאפ בלבד' },
                  { value: 'email', label: 'מייל בלבד' },
                  { value: 'phone', label: 'טלפון בלבד — לא לשלוח הודעות' },
                ]}
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                ספק שמסומן "טלפון בלבד" לא יקבל הודעה אוטומטית. בפתיחת תקלה תוצג התראה לוועד להתקשר אליו.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="מספר רישיון"
                value={form.license_number}
                onChange={setField('license_number')}
              />
              <FormField
                label="תוקף ביטוח"
                type="date"
                value={form.insurance_expiry}
                onChange={setField('insurance_expiry')}
              />
            </div>
            <FormField
              label="כתובת"
              value={form.address}
              onChange={setField('address')}
            />
            <FormField
              label="אזור שירות"
              value={form.service_area}
              onChange={setField('service_area')}
            />
            <FormTextarea
              label="התמחויות (מופרד בפסיקים)"
              value={form.specialties}
              onChange={setField('specialties')}
              placeholder="מחזירי דלתות, צירים, ידיות, סגרי שמן, תיקון מנעולים, התקנת דלתות"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormBool
                label="זמין 24/7"
                value={form.available_24_7}
                onChange={setField('available_24_7')}
              />
              <FormBool
                label="ספק מומלץ"
                value={form.preferred}
                onChange={setField('preferred')}
              />
            </div>

            {/* Interactive star rating */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                דירוג
              </label>
              <div className="flex items-center gap-1 text-2xl">
                <StarRating
                  rating={Number(form.rating)}
                  interactive
                  onChange={(val) => setForm((prev) => ({ ...prev, rating: String(val) }))}
                />
                <span className="text-sm text-[var(--text-secondary)] mr-2 num-tabular">{form.rating}/5</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormBool
                label="חסום (רשימה שחורה)"
                value={form.is_blacklisted}
                onChange={setField('is_blacklisted')}
              />
            </div>
            <FormTextarea
              label="סנקציות"
              value={form.sanctions}
              onChange={setField('sanctions')}
            />
            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={setField('notes')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'הוסף ספק'}</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Vendors
