import { useState, useMemo } from 'react'
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
import {
  Plus, Pencil, Trash2, Users, Ban, Phone, Mail, Star,
  Shield, Clock, CheckCircle, Search, BarChart3, GitCompare,
  Award, Wrench, MapPin, UserPlus, Store,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: 'אינסטלציה', label: 'אינסטלציה' },
  { value: 'חשמל', label: 'חשמל' },
  { value: 'ניקיון', label: 'ניקיון' },
  { value: 'בנייה ושיפוצים', label: 'בנייה ושיפוצים' },
  { value: 'צבע', label: 'צבע' },
  { value: 'מיזוג אוויר', label: 'מיזוג אוויר' },
  { value: 'מעליות', label: 'מעליות' },
  { value: 'גינון', label: 'גינון' },
  { value: 'מנעולנות', label: 'מנעולנות' },
  { value: 'אלומיניום וזכוכית', label: 'אלומיניום וזכוכית' },
  { value: 'איטום', label: 'איטום' },
  { value: 'ריצוף', label: 'ריצוף' },
  { value: 'פסולת ופינוי', label: 'פסולת ופינוי' },
  { value: 'הדברה', label: 'הדברה' },
  { value: 'דלתות וחלונות', label: 'דלתות וחלונות' },
  { value: 'מסגרות', label: 'מסגרות' },
  { value: 'מערכות בטיחות אש', label: 'מערכות בטיחות אש' },
  { value: 'גגות', label: 'גגות' },
  { value: 'שירותי חירום', label: 'שירותי חירום' },
  { value: 'אחר', label: 'אחר' },
]


const EMPTY_FORM = {
  name: '',
  category: '',
  phone: '',
  email: '',
  license_number: '',
  insurance_expiry: '',
  service_area: '',
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
  { key: 'find-vendor', label: 'מצא ספק' },
  { key: 'compare', label: 'השוואת ספקים' },
]

const MOCK_MARKETPLACE_VENDORS = [
  { id: 'mp-1', name: 'שלומי אינסטלציה בע"מ', category: 'אינסטלציה', area: 'מרכז', rating: 5, phone: '050-1234567', description: 'מומחה אינסטלציה עם 15 שנות ניסיון' },
  { id: 'mp-2', name: 'חשמל פלוס', category: 'חשמל', area: 'מרכז וצפון', rating: 4, phone: '052-9876543', description: 'חשמלאי מוסמך, זמין 24/7' },
  { id: 'mp-3', name: 'ניקיון הזהב', category: 'ניקיון', area: 'ארצי', rating: 4, phone: '054-5551234', description: 'חברת ניקיון מקצועית לבניינים' },
  { id: 'mp-4', name: 'בוב הבנאי', category: 'בנייה ושיפוצים', area: 'מרכז', rating: 5, phone: '053-1112222', description: 'שיפוצים כלליים ובנייה' },
  { id: 'mp-5', name: 'צבעי המרכז', category: 'צבע', area: 'מרכז ושרון', rating: 3, phone: '050-3334444', description: 'צביעת דירות ובניינים' },
  { id: 'mp-6', name: 'מיזוג ישראל', category: 'מיזוג אוויר', area: 'ארצי', rating: 4, phone: '052-7778888', description: 'התקנה ותיקון מזגנים' },
  { id: 'mp-7', name: 'גרין גארדן', category: 'גינון', area: 'מרכז ודרום', rating: 5, phone: '054-2223333', description: 'עיצוב ותחזוקת גינות' },
  { id: 'mp-8', name: 'מעליות השרון', category: 'מעליות', area: 'שרון ומרכז', rating: 4, phone: '053-4445555', description: 'תחזוקה ותיקון מעליות' },
  { id: 'mp-9', name: 'מנעולן 24', category: 'מנעולנות', area: 'ארצי', rating: 4, phone: '050-6667777', description: 'פריצת דלתות והחלפת מנעולים 24/7' },
  { id: 'mp-10', name: 'איטום פרו', category: 'איטום', area: 'מרכז', rating: 5, phone: '052-8889999', description: 'איטום גגות ומרפסות' },
  { id: 'mp-11', name: 'הדברה ירוקה', category: 'הדברה', area: 'ארצי', rating: 4, phone: '054-1110000', description: 'הדברה אקולוגית ובטוחה' },
  { id: 'mp-12', name: 'אלו-זכוכית', category: 'אלומיניום וזכוכית', area: 'צפון ומרכז', rating: 3, phone: '053-2221111', description: 'חלונות, דלתות ומעקות' },
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
                  חסום
                </Badge>
              )}
            </div>
            {/* Rating */}
            {vendor.rating > 0 && (
              <StarRating rating={vendor.rating} />
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

function MarketplaceCard({ vendor, onAdd, alreadyAdded }) {
  const firstLetter = vendor.name?.charAt(0) || '?'
  const MP_CATEGORY_GRADIENTS = {
    'אינסטלציה': 'from-blue-500 to-blue-600',
    'חשמל': 'from-amber-500 to-amber-600',
    'ניקיון': 'from-emerald-500 to-emerald-600',
    'בנייה ושיפוצים': 'from-orange-500 to-orange-600',
    'מעליות': 'from-indigo-500 to-indigo-600',
    'גינון': 'from-green-500 to-green-600',
    'מיזוג אוויר': 'from-cyan-500 to-cyan-600',
    'הדברה': 'from-red-500 to-red-600',
    'מנעולנות': 'from-slate-500 to-slate-600',
    'איטום': 'from-teal-500 to-teal-600',
    'אלומיניום וזכוכית': 'from-sky-500 to-sky-600',
  }
  const mpGradient = MP_CATEGORY_GRADIENTS[vendor.category] || 'from-purple-500 to-purple-600'

  return (
    <Card className="group overflow-hidden border border-[var(--border)] hover:shadow-lg hover:border-blue-200 transition-all bg-white">
      {/* Gradient accent bar */}
      <div className={`h-1 bg-gradient-to-r ${mpGradient}`} />
      <CardContent className="pt-4 pb-4">
        {/* Header with circle */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mpGradient} flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md`}>
            {firstLetter}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight truncate mb-0.5">
              {vendor.name}
            </h3>
            <StarRating rating={vendor.rating} />
          </div>
        </div>

        <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 mb-2">
          {vendor.category}
        </span>

        <p className="text-xs text-[var(--text-secondary)] mt-1 mb-2 line-clamp-2">{vendor.description}</p>

        <div className="text-xs text-[var(--text-secondary)] space-y-1">
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-[var(--text-muted)]" /> {vendor.area}
          </p>
          <p className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-[var(--text-muted)]" /> {vendor.phone}
          </p>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          {alreadyAdded ? (
            <Button variant="outline" size="sm" disabled className="w-full">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              נוסף לרשימה
            </Button>
          ) : (
            <Button size="sm" onClick={() => onAdd?.(vendor)} className="w-full">
              <UserPlus className="h-3.5 w-3.5" />
              הוסף לרשימה שלי
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function Vendors() {
  const { data: allVendors, create, update, remove, isSaving, isLoading } = useCollection('vendors')
  const { data: workOrders } = useCollection('workOrders')

  const [activeTab, setActiveTab] = useState('my-vendors')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailVendor, setDetailVendor] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [performanceVendor, setPerformanceVendor] = useState(null)
  const [compareIds, setCompareIds] = useState([])
  const [marketplaceCategory, setMarketplaceCategory] = useState('')
  const [addedMarketplace, setAddedMarketplace] = useState([])

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
    return result
  }, [allVendors, search, categoryFilter])

  // Marketplace filtered
  const filteredMarketplace = useMemo(() => {
    if (!marketplaceCategory) return MOCK_MARKETPLACE_VENDORS
    return MOCK_MARKETPLACE_VENDORS.filter((v) => v.category === marketplaceCategory)
  }, [marketplaceCategory])

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
      license_number: vendor.license_number || '',
      insurance_expiry: vendor.insurance_expiry || '',
      service_area: vendor.service_area || '',
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

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  const addFromMarketplace = (mpVendor) => {
    create({
      name: mpVendor.name,
      category: mpVendor.category,
      phone: mpVendor.phone,
      rating: mpVendor.rating,
      service_area: mpVendor.area,
      notes: mpVendor.description,
      is_blacklisted: false,
      preferred: false,
      available_24_7: false,
    })
    setAddedMarketplace((prev) => [...prev, mpVendor.id])
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((vendor) => (
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
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2 - Find Vendor (Marketplace) */}
      {/* ================================================================== */}
      {activeTab === 'find-vendor' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">מצא ספק חדש</h2>
              <p className="text-sm text-[var(--text-secondary)]">חפש ספקים מומלצים לפי תחום</p>
            </div>
            <select
              value={marketplaceCategory}
              onChange={(e) => setMarketplaceCategory(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-light)]/25"
            >
              <option value="">כל הקטגוריות</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMarketplace.map((vendor) => (
              <MarketplaceCard
                key={vendor.id}
                vendor={vendor}
                onAdd={addFromMarketplace}
                alreadyAdded={addedMarketplace.includes(vendor.id)}
              />
            ))}
          </div>

          {filteredMarketplace.length === 0 && (
            <EmptyState
              icon={Search}
              title="לא נמצאו ספקים"
              description="נסה לשנות את הקטגוריה"
            />
          )}
        </div>
      )}

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
            <DetailRow label="מספר רישיון" value={detailVendor.license_number} />
            <DetailRow label="תוקף ביטוח" value={detailVendor.insurance_expiry} />
            <DetailRow label="אזור שירות" value={detailVendor.service_area} />
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
