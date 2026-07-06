import { useState, useMemo, useEffect } from 'react'
import { useCollection } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormBool, FormTextarea } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { cn } from '@/lib/utils'
import { vendorReputation } from '@/lib/reputation'
import { isWhatsappable, waNumber, isMobile } from '@/lib/phone'
import { sendOrOpen, isWhatsappSystemEnabled, systemSendWhatsapp } from '@/lib/whatsapp'
import {
  Plus, Pencil, Trash2, Users, Ban, Phone, Mail, Star,
  Shield, Clock, Search, BarChart3, GitCompare,
  Award, Wrench, Store,
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
          i <= rating ? 'text-amber-400 drop-shadow-sm' : 'text-slate-200',
          interactive && 'cursor-pointer hover:scale-125 hover:text-amber-300'
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
  if (vendor.insurance_expiry) tags.push({ label: 'מבוטח', variant: 'default' })
  if (vendor.license_number) tags.push({ label: 'רישיון', variant: 'default' })
  return tags
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

function buildInviteMessage(vendor) {
  const trade = vendor?.category ? ` בתחום ${vendor.category}` : ''
  return `שלום${vendor?.name ? ' ' + vendor.name : ''},\n\n` +
    `אנחנו *ועד פלוס* — מערכת לניהול תחזוקת בנייני מגורים. אנו מנהלים עבור ועדי בתים את הטיפול בתקלות ובעבודות, ומפנים אותן לספקים מהמאגר שלנו.\n\n` +
    `נשמח לצרף אתכם${trade} למאגר. מעת לעת, כשעולה צורך בבניין באזורכם, תקבלו פנייה לעבודה עם כל פרטי התקלה (כולל תמונה) — ישירות לנייד. אין כאן התחייבות לעבודות קבועות, אלא פניות לפי צורך.\n\n` +
    `שקיפות מלאה: שיתוף הפעולה כרוך בעמלה לכל עבודה שתתקבל דרך המערכת. הפרטים המלאים יסוכמו איתכם לאחר שתאשרו.\n\n` +
    `*אם אתם מעוניינים לקבל פניות לעבודות — השיבו "מאשר", ונמשיך משם.* תודה!\n` +
    `בברכה,\nתומר — ועד פלוס`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VendorCard({ vendor, stats, onClick, compareMode, isSelected, onToggleCompare }) {
  const tags = getVendorTags(vendor)
  const firstLetter = vendor.name?.charAt(0) || '?'

  // Category-based gradient for visual variety
  const CATEGORY_GRADIENTS = {
    'אינסטלציה': 'from-blue-500 to-blue-600',
    'חשמל': 'from-amber-500 to-amber-600',
    'ניקיון': 'from-emerald-500 to-emerald-600',
    'בנייה ושיפוצים': 'from-orange-500 to-orange-600',
    'מעליות': 'from-indigo-500 to-indigo-600',
    'גינון': 'from-green-500 to-green-600',
    'מיזוג אוויר': 'from-cyan-500 to-cyan-600',
    'הדברה': 'from-red-500 to-red-600',
  }
  const vendorGradient = CATEGORY_GRADIENTS[vendor.category] || 'from-amber-500 to-amber-600'

  // Stats progress: jobs completed as a mini indicator
  const maxJobs = 20
  const jobPct = Math.min(100, (stats.completedJobs / maxJobs) * 100)

  return (
    <Card
      className={cn(
        'group cursor-pointer relative overflow-hidden border hover:shadow-lg hover:border-blue-200 transition-all bg-white',
        isSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary-light)]/30' : 'border-[var(--border)]',
        vendor.is_blacklisted && 'opacity-60'
      )}
      onClick={() => !compareMode && onClick?.()}
    >
      {/* Gradient accent bar */}
      <div className={`h-1 bg-gradient-to-r ${vendorGradient}`} />

      <CardContent className="pt-4 pb-4">
        {/* Compare checkbox */}
        {compareMode && (
          <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleCompare?.(vendor.id)}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)] cursor-pointer"
            />
          </div>
        )}

        {/* Header: circle + name + badges */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${vendorGradient} flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md`}>
            {firstLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight truncate">
                {vendor.name}
              </h3>
              {vendor.preferred && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-sm shrink-0">
                  <Award className="h-3 w-3" />
                </span>
              )}
              {vendor.is_blacklisted && (
                <Badge variant="danger" className="text-[10px] px-1.5 shrink-0">
                  <Ban className="h-3 w-3 ml-0.5" />
                  ברשימה שחורה
                </Badge>
              )}
            </div>
            {/* Rating */}
            {vendor.rating > 0 && (
              <StarRating rating={vendor.rating} />
            )}
            {/* Reputation flag from completed-job ratings */}
            {stats?.reputation?.flag && stats.reputation.flag !== 'good' && (
              <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded ${
                stats.reputation.flag === 'blacklist' ? 'bg-red-50 text-red-600'
                : stats.reputation.flag === 'watch' ? 'bg-amber-50 text-amber-600'
                : 'bg-emerald-50 text-emerald-600'}`}>
                {stats.reputation.label} ({stats.reputation.jobCount} עבודות)
              </span>
            )}
          </div>
        </div>

        {/* Category badge */}
        {vendor.category && (
          <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 mb-2">
            {vendor.category}
          </span>
        )}

        {/* Specialties as colored pills */}
        {vendor.specialties && (
          <div className="flex flex-wrap gap-1 mb-2">
            {vendor.specialties.split(',').slice(0, 3).map((s, i) => {
              const pillColors = [
                'bg-blue-50 text-blue-700 border-blue-200',
                'bg-purple-50 text-purple-700 border-purple-200',
                'bg-emerald-50 text-emerald-700 border-emerald-200',
              ]
              return (
                <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${pillColors[i % pillColors.length]}`}>
                  {s.trim()}
                </span>
              )
            })}
          </div>
        )}

        {/* Tags as colored pills */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((tag) => (
              <Badge key={tag.label} variant={tag.variant} className="text-[10px] px-2 py-0.5 rounded-full">
                {tag.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Contact info */}
        <div className="text-xs text-[var(--text-secondary)] space-y-1 mt-2">
          {vendor.phone && (
            <p className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-[var(--text-muted)]" /> {vendor.phone}
            </p>
          )}
          {vendor.email && (
            <p className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-[var(--text-muted)]" /> {vendor.email}
            </p>
          )}
        </div>

        {/* Stats row with mini progress */}
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  {stats.completedJobs} עבודות
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${vendorGradient} transition-all duration-500`} style={{ width: `${jobPct}%` }} />
              </div>
            </div>
            {stats.avgResponseDays !== null && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="h-3 w-3" />
                {stats.avgResponseDays} ימים
              </span>
            )}
            {vendor.insurance_expiry && (
              <span className="flex items-center gap-1 shrink-0">
                <Shield className="h-3 w-3 text-emerald-500" />
                מבוטח
              </span>
            )}
          </div>
        </div>

        {/* Hover-reveal action buttons */}
        <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => onClick?.()}>
            פרטים
          </Button>
        </div>
      </CardContent>
    </Card>
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
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-[var(--primary)]">{stats.completedJobs}</p>
            <p className="text-xs text-[var(--text-secondary)]">עבודות שהושלמו</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-[var(--primary)]">
              {stats.totalSpent > 0 ? `₪${stats.totalSpent.toLocaleString()}` : '—'}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">סה"כ הוצאה</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-[var(--primary)]">
              {vendor.rating || '—'}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">דירוג ממוצע</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-[var(--primary)]">
              {stats.onTimeRate !== null ? `${stats.onTimeRate}%` : '—'}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">סיום בזמן</p>
          </CardContent>
        </Card>
      </div>

      {/* Work orders list */}
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">עבודות אחרונות</h4>
      {vendorOrders.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">אין עבודות רשומות לספק זה</p>
      ) : (
        <div className="space-y-2">
          {vendorOrders.slice(0, 10).map((wo) => (
            <Card key={wo.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {wo.title || wo.description || 'עבודה'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {wo.date || wo.created_at || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(wo.cost || wo.actual_cost) && (
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        ₪{Number(wo.cost || wo.actual_cost).toLocaleString()}
                      </span>
                    )}
                    <Badge variant={wo.status === 'completed' || wo.status === 'הושלם' ? 'success' : 'warning'}>
                      {wo.status || 'לא ידוע'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
      return spent ? `₪${spent.toLocaleString()}` : '—'
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
    { label: 'ביטוח', render: (v) => v.insurance_expiry || '—' },
    { label: 'רישיון', render: (v) => v.license_number || '—' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-right py-3 px-4 text-[var(--text-secondary)] font-medium min-w-[120px]">
              קריטריון
            </th>
            {vendors.map((v) => (
              <th key={v.id} className="text-right py-3 px-4 text-[var(--text-primary)] font-semibold min-w-[150px]">
                {v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
              <td className="py-3 px-4 text-[var(--text-secondary)] font-medium">{row.label}</td>
              {vendors.map((v) => (
                <td key={v.id} className="py-3 px-4 text-[var(--text-primary)]">
                  {row.render(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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
  const [search, setSearch] = useState('')
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

  // Filter vendors
  const filtered = useMemo(() => {
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
    if (statusFilter === 'blacklisted') {
      result = result.filter((v) => v.is_blacklisted === true)
    }
    return result
  }, [allVendors, search, categoryFilter, statusFilter])

  // Compare vendors
  const compareVendors = useMemo(() => {
    return allVendors.filter((v) => compareIds.includes(v.id))
  }, [allVendors, compareIds])

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

  const toast = (message, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }))

  // Invite a vendor to the pool — via the GreenAPI gateway when enabled, else
  // opens manual WhatsApp / phone. Marks the vendor invited either way.
  const sendInvite = async (vendor) => {
    const sent = await sendOrOpen(vendor.phone, buildInviteMessage(vendor))
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
      const res = await systemSendWhatsapp(v.phone, buildInviteMessage(v))
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
    window.dispatchEvent(new CustomEvent('app-toast', {
      detail: { message: vendor.is_blacklisted ? 'הספק הוסר מהרשימה השחורה' : 'הספק נוסף לרשימה השחורה', type: 'success' }
    }))
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

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={Store} iconColor="amber" title="ספקים" />
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
      {/* Header */}
      <PageHeader
        icon={Store}
        iconColor="amber"
        title="ספקים"
        subtitle={`${allVendors.length} ספקים במערכת`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            ספק חדש
          </Button>
        }
      />

      {/* Tabs */}
      <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ================================================================== */}
      {/* TAB 1 - My Vendors */}
      {/* ================================================================== */}
      {activeTab === 'my-vendors' && (
        <div className="space-y-4">
          {/* Search & category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="חיפוש לפי שם, התמחות, טלפון..."
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]/25"
            >
              <option value="">כל ההתמחויות</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap gap-2">
            {[{ key: 'all', label: 'הכל' }, { key: 'blacklisted', label: 'רשימה שחורה' }].map((pill) => (
              <Button
                key={pill.key}
                variant={statusFilter === pill.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(pill.key)}
              >
                {pill.key === 'blacklisted' && <Ban className="h-3.5 w-3.5 ml-1" />}
                {pill.label}
              </Button>
            ))}
          </div>

          {/* Compare mode indicator */}
          {compareIds.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--primary-bg)] border border-[var(--primary-light)]">
              <GitCompare className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-sm text-[var(--primary)] font-medium">
                {compareIds.length}/3 ספקים נבחרו להשוואה
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setActiveTab('compare') }}
              >
                השווה עכשיו
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCompareIds([])}
              >
                נקה בחירה
              </Button>
            </div>
          )}

          {/* Vendor cards */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="אין ספקים"
              description={search || categoryFilter ? 'לא נמצאו תוצאות לחיפוש' : 'לא נוספו ספקים עדיין'}
              actionLabel={!search && !categoryFilter ? 'הוסף ספק' : undefined}
              onAction={!search && !categoryFilter ? openCreate : undefined}
            />
          ) : (
            <div className="space-y-6">
              {SERVICE_GROUPS.map((g) => {
                const group = filtered.filter((v) => serviceTypeOf(v.category) === g.key)
                if (group.length === 0) return null
                return (
                  <div key={g.key} className="space-y-3">
                    <div className="flex items-baseline gap-2 border-b border-[var(--border)] pb-1.5">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">{g.label}</h3>
                      <span className="text-xs text-[var(--text-muted)]">{g.desc} · {group.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.map((vendor) => (
                        <VendorCard
                          key={vendor.id}
                          vendor={vendor}
                          stats={statsMap[vendor.id] || { totalJobs: 0, completedJobs: 0, totalSpent: 0, avgResponseDays: null, onTimeRate: null }}
                          onClick={() => setDetailVendor(vendor)}
                          compareMode={compareIds.length > 0}
                          isSelected={compareIds.includes(vendor.id)}
                          onToggleCompare={toggleCompare}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
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

        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--primary-bg)]/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">הזמנת ספקים למאגר ועד פלוס</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    שלח לכל ספק הזמנה בוואטסאפ לאישור הצטרפות. לחיצה על "שלח הזמנה" מסמנת אותו כ"הוזמן";
                    לאחר תשובת הספק סמן "אישר" או "סירב". רק ספק שאישר מקבל בקשות לקריאות.
                  </p>
                </div>
                <Button size="sm" onClick={sendBulkInvites} disabled={bulk.running} className="shrink-0">
                  {bulk.running ? `שולח ${bulk.done}/${bulk.total}...` : `📨 שלח לכל הממתינים (${counts.pending || 0})`}
                </Button>
              </div>
            </div>

            {/* Status + category filters */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'pending', label: `ממתינים (${counts.pending || 0})` },
                { key: 'invited', label: `הוזמנו (${counts.invited || 0})` },
                { key: 'agreed', label: `אישרו (${counts.agreed || 0})` },
                { key: 'declined', label: `סירבו (${counts.declined || 0})` },
                { key: 'all', label: 'הכל' },
              ].map((pill) => (
                <Button
                  key={pill.key}
                  variant={membershipFilter === pill.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMembershipFilter(pill.key)}
                >
                  {pill.label}
                </Button>
              ))}
              <select
                value={inviteCategoryFilter}
                onChange={(e) => setInviteCategoryFilter(e.target.value)}
                className="h-8 rounded-lg border border-[var(--border)] bg-white px-2 text-xs text-[var(--text-primary)]"
              >
                <option value="">כל הקטגוריות</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {noMobile > 0 && (
                <span className="text-[11px] text-amber-600">
                  ({noMobile} ספקים ללא נייד וואטסאפ מוסתרים — עדכן להם מספר נייד)
                </span>
              )}
            </div>

            {list.length === 0 ? (
              <EmptyState icon={Users} title="אין ספקים בסטטוס זה" description="בחר סטטוס אחר או הוסף ספקים." />
            ) : (
              <div className="space-y-2">
                {list.map((v) => {
                  const status = v.membership_status || 'pending'
                  const m = MEMBERSHIP[status]
                  return (
                    <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-[var(--text-primary)] truncate">{v.name}</p>
                          <Badge variant={m.variant} className="text-[10px] shrink-0">{m.label}</Badge>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{v.category}{v.phone ? ` · ${v.phone}` : ''}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {v.phone && (
                          <Button size="sm" variant="outline" onClick={() => sendInvite(v)}>
                            {isWhatsappable(v.phone) ? '📨' : '📞'} {status === 'pending' ? 'שלח הזמנה' : 'שלח שוב'}
                          </Button>
                        )}
                        {status !== 'agreed' && (
                          <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => setMembership(v, 'agreed')}>✓ אישר</Button>
                        )}
                        {status !== 'declined' && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setMembership(v, 'declined')}>✗ סירב</Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ================================================================== */}
      {/* TAB 3 - Compare Vendors */}
      {/* ================================================================== */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">השוואת ספקים</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {compareVendors.length === 0
                  ? 'בחר ספקים מהרשימה להשוואה'
                  : `משווה ${compareVendors.length} ספקים`}
              </p>
            </div>
            {compareVendors.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setCompareIds([])}>
                נקה השוואה
              </Button>
            )}
          </div>

          {/* Quick-select chips if no vendors chosen */}
          {compareVendors.length === 0 && allVendors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text-secondary)]">בחר עד 3 ספקים:</p>
              <div className="flex flex-wrap gap-2">
                {allVendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => toggleCompare(v.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${
                      compareIds.includes(v.id)
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardContent>
              <ComparisonTable vendors={compareVendors} statsMap={statsMap} />
            </CardContent>
          </Card>
        </div>
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
            <DetailRow label="תוקף ביטוח" value={detailVendor.insurance_expiry} />
            <DetailRow label="אזור שירות" value={detailVendor.service_area} />
            <DetailRow
              label="סטטוס במאגר"
              value={(() => { const m = MEMBERSHIP[detailVendor.membership_status || 'pending']; return <Badge variant={m.variant}>{m.label}</Badge> })()}
            />
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
              value={
                detailVendor.is_blacklisted ? (
                  <Badge variant="danger">חסום</Badge>
                ) : (
                  'לא'
                )
              }
            />
            <DetailRow label="סנקציות" value={detailVendor.sanctions} />
            <DetailRow label="הערות" value={detailVendor.notes} />

            {/* Stats summary */}
            {statsMap[detailVendor.id] && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">ביצועים</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text-secondary)]">עבודות:</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {statsMap[detailVendor.id].completedJobs}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text-secondary)]">הוצאה:</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {statsMap[detailVendor.id].totalSpent > 0
                        ? `₪${statsMap[detailVendor.id].totalSpent.toLocaleString()}`
                        : '—'}
                    </span>
                  </div>
                </div>
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
                className={detailVendor.is_blacklisted ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' : 'text-red-600 border-red-200 hover:bg-red-50'}
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
              stats={statsMap[performanceVendor.id] || { totalJobs: 0, completedJobs: 0, totalSpent: 0, avgResponseDays: null, onTimeRate: null }}
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
                <span className="text-sm text-[var(--text-secondary)] mr-2">{form.rating}/5</span>
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
