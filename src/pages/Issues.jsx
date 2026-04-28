import { useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { callVaadAgent } from '@/lib/vaadAgent'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabGroup } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { FilterPills } from '@/components/common/FilterPills'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  AlertTriangle, Plus, Pencil, Trash2, CheckCircle2, Clock,
  FileText, Calendar, Users, LayoutList, Columns3,
  ArrowRight, Send, Check, X, Sparkles, Copy, CheckCheck, RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUSES = ['reported', 'pending_committee', 'acknowledged', 'approved_for_quotes', 'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'closed']

const STATUS_MAP = {
  reported:          { label: 'דווח',           variant: 'danger' },
  pending_committee: { label: 'ממתין לועד',     variant: 'warning' },
  acknowledged:      { label: 'אושר קבלה',      variant: 'warning' },
  approved_for_quotes: { label: 'אושר להצעות מחיר', variant: 'info' },
  quoted:       { label: 'הצעת מחיר', variant: 'info' },
  approved:     { label: 'מאושר',     variant: 'info' },
  scheduled:    { label: 'מתוזמן',    variant: 'default' },
  in_progress:  { label: 'בטיפול',    variant: 'warning' },
  completed:    { label: 'הושלם',     variant: 'success' },
  closed:       { label: 'סגור',      variant: 'success' },
}

const PRIORITY_MAP = {
  low:    { label: 'נמוכה', variant: 'default', order: 4, color: 'bg-green-100 text-green-800' },
  medium: { label: 'בינונית', variant: 'warning', order: 3, color: 'bg-yellow-100 text-yellow-800' },
  high:   { label: 'גבוהה', variant: 'danger', order: 2, color: 'bg-orange-100 text-orange-800' },
  urgent: { label: 'דחוף', variant: 'danger', order: 1, color: 'bg-red-100 text-red-800' },
}

// SLA hours per priority
const SLA_HOURS = { urgent: 24, high: 48, medium: 7 * 24, low: 14 * 24 }

const CATEGORIES = [
  'אינסטלציה', 'חשמל', 'מעלית', 'ניקיון', 'בטיחות',
  'חניה', 'רעש', 'מבנה', 'גינון', 'דלתות וחלונות',
  'מסגרות', 'איטום', 'מיזוג אוויר', 'אחר',
]

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }))

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'נמוכה' },
  { value: 'medium', label: 'בינונית' },
  { value: 'high', label: 'גבוהה' },
  { value: 'urgent', label: 'דחוף' },
]

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_MAP[s].label }))

const STATUS_FILTERS = [
  { key: 'all', label: 'הכל' },
  ...STATUSES.map((s) => ({ key: s, label: STATUS_MAP[s].label })),
]

const PRIORITY_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'urgent', label: 'דחוף' },
  { key: 'high', label: 'גבוהה' },
  { key: 'medium', label: 'בינונית' },
  { key: 'low', label: 'נמוכה' },
]

const ISSUE_TEMPLATES = [
  { label: 'נזילת מים', title: 'נזילת מים', category: 'אינסטלציה', priority: 'high' },
  { label: 'תקלת חשמל', title: 'תקלת חשמל', category: 'חשמל', priority: 'high' },
  { label: 'מעלית תקועה', title: 'מעלית תקועה', category: 'מעלית', priority: 'urgent' },
  { label: 'דלת/חלון שבור', title: 'דלת/חלון שבור', category: 'מבנה', priority: 'medium' },
  { label: 'ניקיון', title: 'בעיית ניקיון', category: 'ניקיון', priority: 'low' },
  { label: 'רעש/מטרד', title: 'תלונת רעש', category: 'רעש', priority: 'medium' },
  { label: 'חניה', title: 'בעיית חניה', category: 'חניה', priority: 'low' },
]

const EMPTY_FORM = {
  buildingId: '',
  unitId: '',
  title: '',
  description: '',
  priority: 'medium',
  status: 'reported',
  category: '',
  reportedAt: '',
  resolvedAt: '',
  scheduledDate: '',
  vendor_name: '',
  cost: '',
  estimatedCost: '',
}

const QUOTE_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'yes', label: 'יש הצעות' },
  { key: 'no', label: 'ללא הצעות' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const then = new Date(dateStr)
  const diffMs = now - then
  if (diffMs < 0) return ''
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `לפני ${diffMins} דקות`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `לפני ${diffDays} ימים`
  const diffMonths = Math.floor(diffDays / 30)
  return `לפני ${diffMonths} חודשים`
}

function isOverdueSLA(issue) {
  if (!issue.reportedAt || issue.status === 'completed' || issue.status === 'closed') return false
  const slaHours = SLA_HOURS[issue.priority] || SLA_HOURS.medium
  const now = new Date()
  const reported = new Date(issue.reportedAt)
  const diffHours = (now - reported) / (1000 * 60 * 60)
  return diffHours > slaHours
}

function getAvgResolutionDays(issues) {
  const resolved = issues.filter((i) => i.resolvedAt && i.reportedAt)
  if (resolved.length === 0) return 0
  const total = resolved.reduce((sum, i) => {
    const diff = new Date(i.resolvedAt) - new Date(i.reportedAt)
    return sum + diff / (1000 * 60 * 60 * 24)
  }, 0)
  return Math.round(total / resolved.length)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function Issues() {
  const { buildings, selectedBuilding } = useBuildingContext()
  const { data: allIssues, create, update, remove, isSaving, isLoading } = useCollection('issues',
    selectedBuilding ? { building_id: selectedBuilding.id } : {}
  )
  const { data: allUnits } = useCollection('units')
  const { data: allVendors } = useCollection('vendors')
  const { data: allQuotes, create: createQuote, update: updateQuote } = useCollection('quotes')

  // State
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [quoteFilter, setQuoteFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailIssue, setDetailIssue] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [quoteDialogIssue, setQuoteDialogIssue] = useState(null)
  const [quoteSelectedVendors, setQuoteSelectedVendors] = useState([])
  const [quoteDescription, setQuoteDescription] = useState('')
  const [scheduleDialogIssue, setScheduleDialogIssue] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [completeDialogIssue, setCompleteDialogIssue] = useState(null)
  const [completeCost, setCompleteCost] = useState('')
  const [vendorAssignIssue, setVendorAssignIssue] = useState(null)
  const [selectedVendorName, setSelectedVendorName] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

  // AI issue analysis
  const [aiAnalysisIssue, setAiAnalysisIssue] = useState(null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null)
  const [aiAnalysisError, setAiAnalysisError] = useState(null)
  const [copiedField, setCopiedField] = useState(null)

  // Issue workflow
  const [workflowIssue, setWorkflowIssue] = useState(null)
  const [workflowStep, setWorkflowStep] = useState(1) // 1=analysis, 2=committee, 3=vendor
  const [committeeMembers, setCommitteeMembers] = useState([])
  const [vendorSearchLoading, setVendorSearchLoading] = useState(false)
  const [externalVendors, setExternalVendors] = useState([])
  const [quoteRequestCopied, setQuoteRequestCopied] = useState(null)

  // Maps
  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  const unitMap = useMemo(() => {
    const map = {}
    allUnits.forEach((u) => { map[u.id] = u })
    return map
  }, [allUnits])

  // Quotes grouped by issueId
  const quotesByIssue = useMemo(() => {
    const map = {}
    allQuotes.forEach((q) => {
      if (!map[q.issueId]) map[q.issueId] = []
      map[q.issueId].push(q)
    })
    return map
  }, [allQuotes])

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

  const formUnitOptions = useMemo(() => {
    const units = form.buildingId
      ? allUnits.filter((u) => u.buildingId === form.buildingId)
      : allUnits
    return units.map((u) => ({
      value: u.id,
      label: `דירה ${u.unit_number || u.number} - ${u.ownerName || ''}`,
    }))
  }, [allUnits, form.buildingId])

  const vendorOptions = useMemo(
    () => [
      { value: '', label: 'ללא ספק' },
      ...allVendors.map((v) => ({ value: v.name, label: `${v.name} (${v.category || ''})` })),
    ],
    [allVendors]
  )

  const vendorFilterOptions = useMemo(
    () => [
      { key: 'all', label: 'כל הספקים' },
      ...allVendors.map((v) => ({ key: v.name, label: v.name })),
    ],
    [allVendors]
  )

  // Filtering
  const filtered = useMemo(() => {
    let result = allIssues

    if (buildingFilter !== 'all') {
      result = result.filter((iss) => iss.buildingId === buildingFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((iss) => iss.status === statusFilter)
    }
    if (priorityFilter !== 'all') {
      result = result.filter((iss) => iss.priority === priorityFilter)
    }
    if (vendorFilter !== 'all') {
      result = result.filter((iss) => iss.vendor_name === vendorFilter)
    }
    if (quoteFilter === 'yes') {
      result = result.filter((iss) => (quotesByIssue[iss.id] || []).length > 0)
    } else if (quoteFilter === 'no') {
      result = result.filter((iss) => (quotesByIssue[iss.id] || []).length === 0)
    }
    if (dateFrom) {
      result = result.filter((iss) => iss.reportedAt && iss.reportedAt >= dateFrom)
    }
    if (dateTo) {
      result = result.filter((iss) => iss.reportedAt && iss.reportedAt.slice(0, 10) <= dateTo)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (iss) =>
          iss.title?.toLowerCase().includes(q) ||
          iss.description?.toLowerCase().includes(q) ||
          iss.vendor_name?.toLowerCase().includes(q) ||
          iss.category?.toLowerCase().includes(q)
      )
    }

    // Sort: urgent first, then by date
    result = [...result].sort((a, b) => {
      const oa = PRIORITY_MAP[a.priority]?.order ?? 5
      const ob = PRIORITY_MAP[b.priority]?.order ?? 5
      if (oa !== ob) return oa - ob
      return new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0)
    })

    return result
  }, [allIssues, buildingFilter, statusFilter, priorityFilter, vendorFilter, quoteFilter, dateFrom, dateTo, search, quotesByIssue])

  // Summary stats
  const stats = useMemo(() => {
    const openStatuses = ['reported', 'acknowledged', 'quoted', 'approved', 'scheduled', 'in_progress']
    const openIssues = allIssues.filter((i) => openStatuses.includes(i.status))
    const overdue = openIssues.filter(isOverdueSLA)
    const pendingQuotes = allIssues.filter((i) => {
      const quotes = quotesByIssue[i.id] || []
      return quotes.some((q) => q.status === 'pending')
    })
    const avgDays = getAvgResolutionDays(allIssues)
    return { open: openIssues.length, overdue: overdue.length, pendingQuotes: pendingQuotes.length, avgDays }
  }, [allIssues, quotesByIssue])

  // Helpers
  const getUnitDisplay = (unitId) => {
    const unit = unitMap[unitId]
    if (!unit) return ''
    return `דירה ${unit.unit_number || unit.number}`
  }

  const openCreate = () => {
    setEditingId(null)
    setFormErrors({})
    setForm({
      ...EMPTY_FORM,
      reportedAt: new Date().toISOString().slice(0, 10),
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
    })
    setFormOpen(true)
    setShowTemplates(false)
  }

  const openCreateFromTemplate = (template) => {
    setEditingId(null)
    setFormErrors({})
    setForm({
      ...EMPTY_FORM,
      title: template.title,
      category: template.category,
      priority: template.priority,
      reportedAt: new Date().toISOString().slice(0, 10),
      buildingId: buildingFilter !== 'all' ? buildingFilter : (buildings[0]?.id || ''),
    })
    setShowTemplates(false)
    setFormOpen(true)
  }

  const openEdit = (iss) => {
    setEditingId(iss.id)
    setFormErrors({})
    setForm({
      buildingId: iss.buildingId || '',
      unitId: iss.unitId || iss.reportedBy || '',
      title: iss.title || '',
      description: iss.description || '',
      priority: iss.priority || 'medium',
      status: iss.status || 'reported',
      category: iss.category || '',
      reportedAt: iss.reportedAt ? iss.reportedAt.slice(0, 10) : '',
      resolvedAt: iss.resolvedAt ? iss.resolvedAt.slice(0, 10) : '',
      scheduledDate: iss.scheduledDate ? iss.scheduledDate.slice(0, 10) : '',
      vendor_name: iss.vendor_name || '',
      cost: iss.cost ?? '',
      estimatedCost: iss.estimatedCost ?? '',
    })
    setFormOpen(true)
    setDetailIssue(null)
  }

  const [formErrors, setFormErrors] = useState({})

  const validateForm = () => {
    const errs = {}
    if (!form.buildingId) errs.buildingId = 'חובה לבחור בניין'
    if (!form.title?.trim()) errs.title = 'חובה להזין כותרת'
    if (!form.priority) errs.priority = 'חובה לבחור עדיפות'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validateForm()
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setFormErrors({})
    const data = {
      ...form,
      unitId: form.unitId || null,
      category: form.category || null,
      vendor_name: form.vendor_name || null,
      cost: form.cost !== '' ? Number(form.cost) : null,
      estimatedCost: form.estimatedCost !== '' ? Number(form.estimatedCost) : null,
      reportedAt: form.reportedAt ? new Date(form.reportedAt).toISOString() : null,
      resolvedAt: form.resolvedAt ? new Date(form.resolvedAt).toISOString() : null,
      scheduledDate: form.scheduledDate || null,
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
    setForm((prev) => {
      const next = { ...prev, [field]: val }
      if (field === 'buildingId') next.unitId = ''
      return next
    })
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await remove(deleteTarget.id)
      } catch (err) {
        console.error('Failed to delete issue:', err)
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה במחיקת תקלה', type: 'error' } }))
      }
      setDeleteTarget(null)
    }
  }

  // AI issue analysis
  const openAiAnalysis = async (iss) => {
    setAiAnalysisIssue(iss)
    setAiAnalysisResult(null)
    setAiAnalysisError(null)
    setAiAnalysisLoading(true)
    const building = buildingMap[iss.buildingId]
    // Send all non-blacklisted vendors to AI so it can match by specialties too
    const relevantVendors = allVendors.filter(
      (v) => !v.is_blacklisted
    ).slice(0, 15)
    try {
      const result = await callVaadAgent('issue_analysis', building?.name ?? 'הבניין', {
        issue: {
          title: iss.title,
          description: iss.description,
          category: iss.category,
          priority: iss.priority,
          status: iss.status,
          reportedAt: iss.reportedAt,
        },
        buildingAddress: [building?.address, building?.city].filter(Boolean).join(', '),
        buildingFloors: building?.floors,
        buildingUnits: building?.total_units,
        availableVendors: relevantVendors.map((v) => ({
          name: v.name, category: v.category, rating: v.rating, phone: v.phone,
          specialties: v.specialties || '',
        })),
      })
      setAiAnalysisResult(result)
      // Save AI-recommended category and search terms to the issue
      if (result.recommended_vendor_category || result.recommended_search_terms) {
        update(iss.id, {
          ai_category: result.recommended_vendor_category || null,
          ai_search_terms: result.recommended_search_terms || null,
        })
      }
    } catch (e) {
      setAiAnalysisError(e.message)
    } finally {
      setAiAnalysisLoading(false)
    }
  }

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  // Open full workflow for an issue
  const openWorkflow = async (iss) => {
    setWorkflowIssue(iss)
    setWorkflowStep(1)
    setExternalVendors([])
    setQuoteRequestCopied(null)

    // Load committee members for this building
    const { data: memberships } = await supabase
      .from('building_memberships')
      .select('*, profiles(first_name, last_name, email)')
      .eq('building_id', iss.buildingId)
      .in('role', ['committee_chair', 'committee', 'manager'])
    setCommitteeMembers(memberships ?? [])

    // If no AI analysis yet, trigger it
    if (!aiAnalysisResult || aiAnalysisIssue?.id !== iss.id) {
      openAiAnalysis(iss)
    }
  }

  // Generate WhatsApp link for a phone number + message
  const buildWhatsAppLink = (phone, message) => {
    const cleaned = (phone || '').replace(/\D/g, '').replace(/^0/, '972')
    const encoded = encodeURIComponent(message)
    return `https://wa.me/${cleaned}?text=${encoded}`
  }

  // Generate committee notification message for an issue
  const buildCommitteeMessage = (iss, analysis) => {
    const building = buildingMap[iss.buildingId]
    const priority = PRIORITY_MAP[iss.priority]?.label || iss.priority
    return `*דיווח תקלה — ${building?.name || 'הבניין'}*

📋 *כותרת:* ${iss.title}
🔴 *עדיפות:* ${priority}
📁 *קטגוריה:* ${iss.category || 'כללי'}
📝 *תיאור:* ${iss.description || '—'}

${analysis ? `🔍 *אבחון:* ${analysis.diagnosis}
⚠️ *סיכון:* ${analysis.risks || '—'}
💰 *עלות משוערת:* ${analysis.estimated_cost_range || 'לא ידוע'}` : ''}

אנא אשרו: האם להמשיך לקבלת הצעות מחיר?
✅ כן — נפתח פנייה לספקים
❌ לא — נסגור את התקלה`
  }

  // Generate quote request message for a vendor
  const buildVendorQuoteMessage = (iss, vendor, building) => {
    return `שלום ${vendor.name || vendor.business_name || ''},

אנו *ועד הבית* ב${building?.name || 'הבניין'}${building?.address ? `, ${building.address}` : ''}.

נדרשת הצעת מחיר לעבודה הבאה:
📋 *${iss.title}*
🔧 קטגוריה: ${iss.category || 'כללי'}
📝 ${iss.description || ''}

אנא שלחו הצעת מחיר בהקדם. נשמח לתאם ביקור לסקירה.

תודה`
  }

  // Search for external vendors via Madrag scraping — uses AI search terms when available
  const searchExternalVendors = async (category, building) => {
    setVendorSearchLoading(true)
    setExternalVendors([])
    const searchTerms = aiAnalysisResult?.recommended_search_terms || category
    try {
      const result = await callVaadAgent('vendor_search', building?.name || 'הבניין', {
        category,
        searchTerms,
        city: building?.city || '',
        address: building?.address || '',
      })
      setExternalVendors(result.vendors ?? [])
    } catch (e) {
      // Fallback: generate search links
      setExternalVendors([])
    } finally {
      setVendorSearchLoading(false)
    }
  }

  // Approve issue for quotes
  const approveForQuotes = (iss) => {
    update(iss.id, { status: 'approved_for_quotes' })
    setWorkflowIssue((prev) => prev ? { ...prev, status: 'approved_for_quotes' } : prev)
    setWorkflowStep(3)
    // Auto-search externally if fewer than 2 local vendor matches
    const category = aiAnalysisResult?.recommended_vendor_category || iss.category || ''
    const ic = category.toLowerCase()
    const localMatches = allVendors.filter((v) => {
      if (v.is_blacklisted) return false
      const vc = (v.category || '').toLowerCase()
      return vc.includes(ic) || ic.includes(vc)
    })
    if (localMatches.length < 2) {
      const building = buildingMap[iss.buildingId]
      searchExternalVendors(category, building)
    }
  }

  // Reject/close issue by committee
  const closeByCommittee = (iss) => {
    update(iss.id, { status: 'closed' })
    setWorkflowIssue(null)
  }

  // Mark as sent to committee
  const markSentToCommittee = (iss) => {
    update(iss.id, { status: 'pending_committee' })
    setWorkflowIssue((prev) => prev ? { ...prev, status: 'pending_committee' } : prev)
    setWorkflowStep(2)
  }

  // Quick actions
  const handleAcknowledge = (iss) => {
    update(iss.id, { status: 'acknowledged' })
  }

  const handleOpenQuoteDialog = (iss) => {
    setQuoteDialogIssue(iss)
    setQuoteSelectedVendors([])
    setQuoteDescription(iss.description || '')
  }

  const handleSendQuoteRequests = async () => {
    if (!quoteDialogIssue || quoteSelectedVendors.length === 0) return
    try {
      for (const vendorName of quoteSelectedVendors) {
        await createQuote({
          issueId: quoteDialogIssue.id,
          vendorName,
          amount: null,
          status: 'pending',
          description: quoteDescription,
          requestedAt: new Date().toISOString(),
          validUntil: null,
        })
      }
      // Move issue to quoted status if still earlier in the flow
      const idx = STATUSES.indexOf(quoteDialogIssue.status)
      if (idx < STATUSES.indexOf('quoted')) {
        await update(quoteDialogIssue.id, { status: 'quoted' })
      }
    } catch (err) {
      console.error('Failed to send quote requests:', err)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בשליחת בקשות הצעות מחיר', type: 'error' } }))
    }
    setQuoteDialogIssue(null)
  }

  const handleAcceptQuote = async (quote) => {
    // Accept this quote, reject others for same issue
    const issueQuotes = quotesByIssue[quote.issueId] || []
    await Promise.all(issueQuotes.map((q) => {
      if (q.id === quote.id) {
        return updateQuote(q.id, { status: 'accepted' })
      } else if (q.status === 'pending' || q.status === 'received') {
        return updateQuote(q.id, { status: 'rejected' })
      }
      return Promise.resolve()
    }))
    // Update issue with estimated cost and vendor, move to approved
    await update(quote.issueId, {
      estimatedCost: quote.amount,
      vendor_name: quote.vendorName,
      status: 'approved',
    })
    // Refresh detail issue
    setDetailIssue((prev) => prev ? { ...prev, estimatedCost: quote.amount, vendor_name: quote.vendorName, status: 'approved' } : null)
  }

  const handleAssignVendor = async () => {
    if (!vendorAssignIssue || !selectedVendorName) return
    await update(vendorAssignIssue.id, { vendor_name: selectedVendorName })
    setVendorAssignIssue(null)
    setSelectedVendorName('')
  }

  const handleSchedule = async () => {
    if (!scheduleDialogIssue || !scheduleDate) return
    await update(scheduleDialogIssue.id, { scheduledDate: scheduleDate, status: 'scheduled' })
    setScheduleDialogIssue(null)
    setScheduleDate('')
  }

  const handleComplete = async () => {
    if (!completeDialogIssue) return
    await update(completeDialogIssue.id, {
      status: 'completed',
      resolvedAt: new Date().toISOString(),
      cost: completeCost !== '' ? Number(completeCost) : null,
    })
    setCompleteDialogIssue(null)
    setCompleteCost('')
  }

  const handleClose = (iss) => {
    update(iss.id, { status: 'closed' })
  }

  // Refresh detail issue from latest data
  const currentDetailIssue = useMemo(() => {
    if (!detailIssue) return null
    return allIssues.find((i) => i.id === detailIssue.id) || detailIssue
  }, [detailIssue, allIssues])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderSLABadge = (iss) => {
    if (iss.status === 'completed' || iss.status === 'closed') return null
    const overdue = isOverdueSLA(iss)
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-600' : 'text-green-600'}`}>
        <Clock className="h-3 w-3" />
        {overdue ? 'חריגת SLA' : 'בזמן'}
      </span>
    )
  }

  const renderQuickActions = (iss) => {
    const actions = []
    const status = iss.status

    if (status === 'reported') {
      actions.push(
        <Button key="ack" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleAcknowledge(iss) }}>
          <Check className="h-3.5 w-3.5" />
          אשר
        </Button>
      )
    }
    if (status === 'reported' || status === 'acknowledged') {
      actions.push(
        <Button key="quote" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenQuoteDialog(iss) }}>
          <FileText className="h-3.5 w-3.5" />
          בקש הצעת מחיר
        </Button>
      )
    }
    if (!iss.vendor_name && ['reported', 'acknowledged', 'quoted', 'approved'].includes(status)) {
      actions.push(
        <Button key="vendor" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setVendorAssignIssue(iss); setSelectedVendorName('') }}>
          <Users className="h-3.5 w-3.5" />
          קבע ספק
        </Button>
      )
    }
    if (status === 'approved') {
      actions.push(
        <Button key="sched" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setScheduleDialogIssue(iss); setScheduleDate('') }}>
          <Calendar className="h-3.5 w-3.5" />
          תזמן
        </Button>
      )
    }
    if (['scheduled', 'in_progress'].includes(status)) {
      actions.push(
        <Button key="complete" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setCompleteDialogIssue(iss); setCompleteCost(iss.estimatedCost ?? '') }}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          סמן כבוצע
        </Button>
      )
    }
    if (status === 'completed') {
      actions.push(
        <Button key="close" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleClose(iss) }}>
          <X className="h-3.5 w-3.5" />
          סגור
        </Button>
      )
    }

    return actions.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 mt-3" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    ) : null
  }

  const renderIssueCard = (iss) => {
    const priority = PRIORITY_MAP[iss.priority] || PRIORITY_MAP.medium
    const status = STATUS_MAP[iss.status] || STATUS_MAP.reported
    const issueQuotes = quotesByIssue[iss.id] || []
    const pendingCount = issueQuotes.filter((q) => q.status === 'pending').length
    const receivedCount = issueQuotes.filter((q) => q.status === 'received').length
    const displayCost = iss.cost != null && iss.cost !== '' ? iss.cost : (iss.estimatedCost != null && iss.estimatedCost !== '' ? iss.estimatedCost : null)

    return (
      <div
        key={iss.id}
        className="rounded-xl border border-[var(--border)] bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all group relative overflow-hidden cursor-pointer"
        onClick={() => setDetailIssue(iss)}
      >
        {/* Priority accent bar at top */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${
          iss.priority === 'urgent' ? 'bg-red-500' : iss.priority === 'high' ? 'bg-orange-500' : iss.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-300'
        }`} />

        <div className="pt-1">
          {/* Header with priority + status */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant={priority.variant}>{priority.label}</Badge>
              {iss.category && <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{iss.category}</span>}
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          {/* Title */}
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2 line-clamp-2">{iss.title}</h3>

          {/* Description preview */}
          {iss.description && <p className="text-[12px] text-[var(--text-muted)] line-clamp-2 mb-3">{iss.description}</p>}

          {/* SLA + Quotes row */}
          <div className="flex items-center gap-3 mb-3">
            {iss.reportedAt && renderSLABadge(iss)}
            {issueQuotes.length > 0 && (
              <span className="text-[11px] text-[var(--primary)] font-medium">
                {pendingCount > 0 && `${pendingCount} ממתינות`}{pendingCount > 0 && receivedCount > 0 && ', '}{receivedCount > 0 && `${receivedCount} התקבלו`}
                {pendingCount === 0 && receivedCount === 0 && `${issueQuotes.length} הצעות`}
              </span>
            )}
          </div>

          {/* Footer with meta */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-light,var(--border))]">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              {iss.reportedAt && <span>{timeAgo(iss.reportedAt)}</span>}
              {iss.vendor_name && <span>{iss.reportedAt ? '·' : ''} {iss.vendor_name}</span>}
              {buildingMap[iss.buildingId]?.name && <span>· {buildingMap[iss.buildingId].name}</span>}
            </div>
            {displayCost != null && <span className="text-[12px] font-semibold text-[var(--text-primary)]">{formatCurrency(displayCost)}</span>}
          </div>

          {renderQuickActions(iss)}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={AlertTriangle} iconColor="purple" title="תקלות" />
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
        icon={AlertTriangle}
        iconColor="purple"
        title="תקלות"
        subtitle={`${filtered.length} תקלות`}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowTemplates(true)}>
              <FileText className="h-4 w-4" />
              מתבנית
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              תקלה חדשה
            </Button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="תקלות פתוחות" value={String(stats.open)} icon={AlertTriangle} color="red" />
        <StatCard label="חריגת SLA" value={String(stats.overdue)} color={stats.overdue > 0 ? 'red' : 'emerald'} icon={Clock} />
        <StatCard label="הצעות ממתינות" value={String(stats.pendingQuotes)} icon={FileText} color="amber" />
        <StatCard label="זמן פתרון ממוצע" value={`${stats.avgDays} ימים`} icon={Calendar} color="blue" />
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="חיפוש לפי כותרת, תיאור, ספק או קטגוריה..."
      />

      {/* Building filter pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={buildingFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBuildingFilter('all')}
        >
          כל הבניינים
        </Button>
        {buildings.map((b) => (
          <Button
            key={b.id}
            variant={buildingFilter === b.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBuildingFilter(b.id)}
          >
            {b.name}
          </Button>
        ))}
      </div>

      {/* Status filter pills */}
      <FilterPills
        options={STATUS_FILTERS.map(f => ({ key: f.key, label: f.label }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* Priority filter pills */}
      <FilterPills
        options={PRIORITY_FILTERS.map(f => ({ key: f.key, label: f.label }))}
        value={priorityFilter}
        onChange={setPriorityFilter}
      />

      {/* Extra filters row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--text-secondary)]">ספק</label>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
          >
            {vendorFilterOptions.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--text-secondary)]">הצעות מחיר</label>
          <select
            value={quoteFilter}
            onChange={(e) => setQuoteFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
          >
            {QUOTE_FILTERS.map((qf) => (
              <option key={qf.key} value={qf.key}>{qf.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--text-secondary)]">מתאריך</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--text-secondary)]">עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
          />
        </div>
        {/* View toggle */}
        <div className="flex gap-1 mr-auto">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('kanban')}
          >
            <Columns3 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Issue cards / Kanban */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="אין תקלות"
          description={search ? 'לא נמצאו תוצאות לחיפוש' : 'לא דווחו תקלות'}
          actionLabel={!search ? 'דווח תקלה' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : viewMode === 'list' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(renderIssueCard)}
        </div>
      ) : (
        /* Kanban view */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map((statusKey) => {
            const statusInfo = STATUS_MAP[statusKey]
            const columnIssues = filtered.filter((iss) => iss.status === statusKey)
            return (
              <div key={statusKey} className="min-w-[280px] max-w-[320px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 px-2 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  <span className="text-[11px] font-medium text-[var(--text-muted)] bg-white px-1.5 py-0.5 rounded-full">{columnIssues.length}</span>
                </div>
                <div className="space-y-3">
                  {columnIssues.length === 0 ? (
                    <div className="text-center text-xs text-[var(--text-muted)] py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      אין תקלות
                    </div>
                  ) : (
                    columnIssues.map(renderIssueCard)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={!!currentDetailIssue}
        onOpenChange={() => setDetailIssue(null)}
        title={currentDetailIssue ? currentDetailIssue.title : ''}
        onEdit={() => openEdit(currentDetailIssue)}
      >
        {currentDetailIssue && (() => {
          const iss = currentDetailIssue
          const issueQuotes = quotesByIssue[iss.id] || []
          return (
            <>
              <DetailRow label="בניין" value={buildingMap[iss.buildingId]?.name} />
              <DetailRow label="דירה" value={getUnitDisplay(iss.unitId || iss.reportedBy)} />
              <DetailRow label="קטגוריה" value={iss.category} />
              <DetailRow label="תיאור" value={iss.description} />
              <DetailRow
                label="עדיפות"
                value={
                  <Badge variant={PRIORITY_MAP[iss.priority]?.variant}>
                    {PRIORITY_MAP[iss.priority]?.label}
                  </Badge>
                }
              />
              <DetailRow
                label="סטטוס"
                value={
                  <Badge variant={STATUS_MAP[iss.status]?.variant}>
                    {STATUS_MAP[iss.status]?.label}
                  </Badge>
                }
              />
              <DetailRow label="ספק" value={iss.vendor_name} />
              <DetailRow label="עלות משוערת" value={iss.estimatedCost != null && iss.estimatedCost !== '' ? formatCurrency(iss.estimatedCost) : null} />
              <DetailRow label="עלות בפועל" value={iss.cost != null && iss.cost !== '' ? formatCurrency(iss.cost) : null} />
              <DetailRow label="תאריך דיווח" value={iss.reportedAt ? formatDate(iss.reportedAt) : null} />
              <DetailRow label="תאריך מתוזמן" value={iss.scheduledDate ? formatDate(iss.scheduledDate) : null} />
              <DetailRow label="תאריך פתרון" value={iss.resolvedAt ? formatDate(iss.resolvedAt) : null} />
              <DetailRow label="זמן שחלף" value={iss.reportedAt ? timeAgo(iss.reportedAt) : null} />
              <DetailRow label="SLA" value={renderSLABadge(iss)} />

              {/* Quote Management Panel */}
              {issueQuotes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">הצעות מחיר ({issueQuotes.length})</h4>
                  <div className="space-y-2">
                    {issueQuotes.map((q) => (
                      <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-hover)] text-sm">
                        <div className="space-y-0.5">
                          <p className="font-medium text-[var(--text-primary)]">{q.vendorName}</p>
                          <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                            {q.amount != null && <span>{formatCurrency(q.amount)}</span>}
                            <Badge variant={q.status === 'accepted' ? 'success' : q.status === 'rejected' ? 'danger' : q.status === 'received' ? 'info' : 'warning'}>
                              {q.status === 'pending' ? 'ממתין' : q.status === 'received' ? 'התקבל' : q.status === 'accepted' ? 'התקבל' : 'נדחה'}
                            </Badge>
                            {q.validUntil && <span>בתוקף עד: {formatDate(q.validUntil)}</span>}
                          </div>
                        </div>
                        {(q.status === 'received' || (q.status === 'pending' && q.amount != null)) && (
                          <Button size="sm" variant="outline" onClick={() => handleAcceptQuote(q)}>
                            <Check className="h-3 w-3" />
                            קבל הצעה
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-4">
                <Button
                  size="sm"
                  onClick={() => openWorkflow(iss)}
                  className="gap-1.5"
                  style={{ background: 'var(--primary)', color: 'white' }}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  תהליך מלא
                </Button>
                <Button
                  size="sm"
                  onClick={() => openAiAnalysis(iss)}
                  className="gap-1.5 bg-[var(--primary)] text-white hover:opacity-90"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  ניתוח AI
                </Button>
                {renderQuickActions(iss)}
                <Button variant="outline" size="sm" onClick={() => openEdit(iss)}>
                  <Pencil className="h-3.5 w-3.5" />
                  עריכה
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDetailIssue(null)
                    setDeleteTarget(iss)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  מחיקה
                </Button>
              </div>
            </>
          )
        })()}
      </DetailModal>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget ? (deleteTarget.title || 'תקלה') : ''}
      />

      {/* Full Issue Workflow Dialog */}
      <Dialog open={!!workflowIssue} onOpenChange={(open) => { if (!open) setWorkflowIssue(null) }}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-5 w-5 text-[var(--primary)]" />
              תהליך טיפול — {workflowIssue?.title}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-0 mb-4">
            {['1. ניתוח', '2. ועד', '3. ספקים'].map((label, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
                    style={{
                      background: workflowStep > i + 1 ? 'var(--success, #22c55e)' : workflowStep === i + 1 ? 'var(--primary)' : 'var(--border)',
                      color: workflowStep >= i + 1 ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {workflowStep > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className="text-xs mt-1 text-[var(--text-secondary)]">{label.split('. ')[1]}</span>
                </div>
                {i < 2 && (
                  <div className="h-0.5 flex-1 mx-1 mb-4" style={{ background: workflowStep > i + 1 ? 'var(--success, #22c55e)' : 'var(--border)' }} />
                )}
              </div>
            ))}
          </div>

          {/* STEP 1: Analysis */}
          {workflowStep === 1 && (
            <div className="space-y-4">
              {(aiAnalysisLoading || (!aiAnalysisResult && !aiAnalysisError)) && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
                  <span className="text-[var(--text-secondary)]">Claude מנתח את התקלה...</span>
                </div>
              )}
              {aiAnalysisError && (
                <p className="text-sm text-[var(--danger)] py-4">{aiAnalysisError}</p>
              )}
              {aiAnalysisResult && (
                <>
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                    <p className="text-xs font-bold text-[var(--text-secondary)]">🔍 אבחון</p>
                    <p className="text-sm text-[var(--text-primary)]">{aiAnalysisResult.diagnosis}</p>
                    {aiAnalysisResult.scope && <p className="text-xs text-[var(--text-secondary)]">היקף: {aiAnalysisResult.scope}</p>}
                  </div>
                  {aiAnalysisResult.risks && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                      <p className="text-xs font-bold text-red-700">⚠️ סיכון</p>
                      <p className="text-sm text-red-800">{aiAnalysisResult.risks}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {aiAnalysisResult.recommended_vendor_category && (
                      <Badge variant="info">{aiAnalysisResult.recommended_vendor_category}</Badge>
                    )}
                    {aiAnalysisResult.estimated_cost_range && (
                      <Badge variant="warning">עלות: {aiAnalysisResult.estimated_cost_range}</Badge>
                    )}
                  </div>
                  {aiAnalysisResult.recommended_search_terms && (
                    <p className="text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] rounded-lg px-3 py-1.5">
                      🔍 מונחי חיפוש: {aiAnalysisResult.recommended_search_terms}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => { markSentToCommittee(workflowIssue); setWorkflowStep(2) }} disabled={!workflowIssue}>
                      המשך — הגשה לוועד
                      <ArrowRight className="h-4 w-4 mr-1" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: Committee */}
          {workflowStep === 2 && workflowIssue && (() => {
            const building = buildingMap[workflowIssue.buildingId]
            const msg = buildCommitteeMessage(workflowIssue, aiAnalysisResult)
            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                  <p className="text-sm font-bold text-[var(--text-primary)] mb-2">📨 הודעה לוועד הבית</p>
                  <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-hover)] rounded-lg p-3 text-sm">{msg}</pre>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(msg, 'committee_msg')}>
                    {copiedField === 'committee_msg' ? <><CheckCheck className="h-3.5 w-3.5 text-green-600 ml-1" />הועתק</> : <><Copy className="h-3.5 w-3.5 ml-1" />העתק הודעה</>}
                  </Button>
                </div>

                {/* Committee members with WhatsApp buttons */}
                {committeeMembers.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">חברי ועד הבניין ({committeeMembers.length})</p>
                    {committeeMembers.map((m) => {
                      const profile = m.profiles
                      const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email : m.user_id
                      const phone = profile?.phone || ''
                      return (
                        <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border)]">
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{m.role === 'committee_chair' ? 'יו"ר ועד' : m.role === 'committee' ? 'חבר ועד' : 'מנהל'}{phone ? ` · ${phone}` : ''}</p>
                          </div>
                          {phone ? (
                            <a href={buildWhatsAppLink(phone, msg)} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="outline">💬 שלח WhatsApp</Button>
                            </a>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">אין טלפון</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">לא הוגדרו חברי ועד לבניין זה. ניתן להוסיף בהגדרות מערכת.</p>
                )}

                {/* Decision buttons */}
                <div className="pt-2 border-t border-[var(--border)]">
                  <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">החלטת ועד:</p>
                  <div className="flex gap-3">
                    <Button onClick={() => { approveForQuotes(workflowIssue) }} className="gap-1.5">
                      <CheckCheck className="h-4 w-4" />
                      אשר — קבל הצעות מחיר
                    </Button>
                    <Button variant="destructive" onClick={() => closeByCommittee(workflowIssue)}>
                      סגור תקלה
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* STEP 3: Vendors */}
          {workflowStep === 3 && workflowIssue && (() => {
            const building = buildingMap[workflowIssue.buildingId]
            const category = aiAnalysisResult?.recommended_vendor_category || workflowIssue.category || ''

            // Find matching vendors from DB — multi-signal: category + specialties + AI terms
            const issueText = `${workflowIssue.title} ${workflowIssue.description || ''} ${aiAnalysisResult?.recommended_search_terms || ''}`.toLowerCase()
            const matchedVendors = allVendors.filter((v) => {
              if (v.is_blacklisted) return false
              const vc = (v.category || '').toLowerCase()
              const ic = category.toLowerCase()
              // Category match (existing logic)
              const categoryMatch = ic && (vc.includes(ic) || ic.includes(vc))
              // Specialties match: check if any specialty keyword appears in issue text or AI search terms
              const specialties = (v.specialties || '').toLowerCase()
              const specialtyMatch = specialties && specialties.split(',').some((s) => {
                const term = s.trim()
                return term && (issueText.includes(term) || term.includes(ic))
              })
              return categoryMatch || specialtyMatch
            }).sort((a, b) => {
              // Score-based: preferred first, then specialties relevance, then rating
              let scoreA = (a.preferred ? 10 : 0) + (a.rating || 0)
              let scoreB = (b.preferred ? 10 : 0) + (b.rating || 0)
              if ((a.specialties || '').split(',').some((s) => s.trim() && issueText.includes(s.trim().toLowerCase()))) scoreA += 5
              if ((b.specialties || '').split(',').some((s) => s.trim() && issueText.includes(s.trim().toLowerCase()))) scoreB += 5
              return scoreB - scoreA
            }).slice(0, 6)

            const totalVendors = matchedVendors.length + externalVendors.length
            const needsMore = matchedVendors.length < 2

            return (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      ספקים מתאימים — {category || 'כללי'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {matchedVendors.length} במאגר{externalVendors.length > 0 ? ` + ${externalVendors.length} ממדרג` : ''}
                    </p>
                  </div>
                  {needsMore && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => searchExternalVendors(category, building)}
                      disabled={vendorSearchLoading}
                    >
                      {vendorSearchLoading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin ml-1" />מחפש...</> : '🔍 חפש במדרג'}
                    </Button>
                  )}
                </div>

                {needsMore && externalVendors.length === 0 && !vendorSearchLoading && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    נמצאו פחות מ-2 ספקים במאגר לקטגוריה זו. לחץ "חפש במדרג" לאיתור ספקים נוספים.
                  </div>
                )}

                {/* DB vendors */}
                {matchedVendors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">ממאגר הספקים</p>
                    {matchedVendors.map((v) => {
                      const quoteMsg = buildVendorQuoteMessage(workflowIssue, v, building)
                      return (
                        <div key={v.id} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-[var(--text-primary)]">{v.name}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{v.category}{v.rating ? ` · ⭐ ${v.rating}` : ''}{v.phone ? ` · ${v.phone}` : ''}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(quoteMsg, `vendor_${v.id}`)}>
                                {quoteRequestCopied === `vendor_${v.id}` || copiedField === `vendor_${v.id}` ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                              {v.phone && (
                                <a href={buildWhatsAppLink(v.phone, quoteMsg)} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline">💬 שלח</Button>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* External vendors from Madrag */}
                {externalVendors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">ממדרג / חיפוש חיצוני</p>
                    {externalVendors.map((v, i) => {
                      const quoteMsg = buildVendorQuoteMessage(workflowIssue, v, building)
                      return (
                        <div key={i} className="rounded-lg border border-[var(--border)] p-3 space-y-2 border-dashed">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-[var(--text-primary)]">{v.name || v.business_name}</p>
                              <p className="text-xs text-[var(--text-secondary)]">
                                {v.category || category}{v.rating ? ` · ⭐ ${v.rating}` : ''}{v.phone ? ` · ${v.phone}` : ''}
                                {v.source && <span className="mr-1 text-[var(--text-muted)]">· {v.source}</span>}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(quoteMsg, `ext_${i}`)}>
                                {copiedField === `ext_${i}` ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                              {v.phone && (
                                <a href={buildWhatsAppLink(v.phone, quoteMsg)} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline">💬 שלח</Button>
                                </a>
                              )}
                              {v.url && (
                                <a href={v.url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="ghost">🔗</Button>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* External search links — always visible for manual search */}
                {!vendorSearchLoading && (() => {
                  const searchQuery = aiAnalysisResult?.recommended_search_terms || category
                  return (
                    <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
                      <p className="text-xs font-semibold text-[var(--text-secondary)]">חיפוש ידני:</p>
                      <div className="flex flex-wrap gap-2">
                        <a href={`https://www.madrag.co.il/search/?q=${encodeURIComponent(searchQuery)}&loc=${encodeURIComponent(building?.city || '')}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">🔍 מדרג</Button>
                        </a>
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(`${searchQuery} ${building?.city || ''} ספק`)}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">🔍 Google</Button>
                        </a>
                        <a href={`https://www.d.co.il/search/?q=${encodeURIComponent(searchQuery + ' ' + (building?.city || ''))}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">🔍 דפי זהב</Button>
                        </a>
                      </div>
                    </div>
                  )
                })()}

                <div className="pt-2 border-t border-[var(--border)]">
                  <Button
                    onClick={() => { update(workflowIssue.id, { status: 'quoted' }); setWorkflowIssue(null) }}
                    disabled={totalVendors < 1}
                  >
                    סיים — המשך למעקב הצעות
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* AI Issue Analysis Dialog */}
      <Dialog open={!!aiAnalysisIssue} onOpenChange={(open) => { if (!open) setAiAnalysisIssue(null) }}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--primary)]" />
              ניתוח תקלה — {aiAnalysisIssue?.title}
            </DialogTitle>
          </DialogHeader>

          {aiAnalysisLoading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
              <span className="text-[var(--text-secondary)]">Claude מנתח את התקלה...</span>
            </div>
          )}

          {aiAnalysisError && (
            <div className="py-4">
              <p className="text-sm text-[var(--danger)]">שגיאה: {aiAnalysisError}</p>
            </div>
          )}

          {aiAnalysisResult && (
            <div className="space-y-5 py-2">

              {/* Diagnosis */}
              <div className="rounded-xl border border-[var(--border)] p-4 space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  🔍 אבחון מקצועי
                </h4>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{aiAnalysisResult.diagnosis}</p>
                {aiAnalysisResult.scope && (
                  <p className="text-sm text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">היקף עבודה:</span> {aiAnalysisResult.scope}</p>
                )}
              </div>

              {/* Risks + Urgency */}
              {(aiAnalysisResult.risks || aiAnalysisResult.urgency_reasoning) && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1">
                  <h4 className="text-sm font-bold text-red-700">⚠️ סיכונים ודחיפות</h4>
                  {aiAnalysisResult.risks && (
                    <p className="text-sm text-red-800">{aiAnalysisResult.risks}</p>
                  )}
                  {aiAnalysisResult.urgency_reasoning && (
                    <p className="text-xs text-red-600 mt-1">{aiAnalysisResult.urgency_reasoning}</p>
                  )}
                </div>
              )}

              {/* Vendor recommendation */}
              <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                <h4 className="text-sm font-bold text-[var(--text-primary)]">🔧 המלצת ספק</h4>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="info">{aiAnalysisResult.recommended_vendor_category}</Badge>
                  {aiAnalysisResult.recommended_vendor_name && (
                    <Badge variant="success">{aiAnalysisResult.recommended_vendor_name}</Badge>
                  )}
                  {aiAnalysisResult.estimated_cost_range && (
                    <Badge variant="warning">עלות משוערת: {aiAnalysisResult.estimated_cost_range}</Badge>
                  )}
                </div>
                {aiAnalysisResult.recommended_vendor_reason && (
                  <p className="text-xs text-[var(--text-secondary)]">{aiAnalysisResult.recommended_vendor_reason}</p>
                )}
              </div>

              {/* Action steps */}
              {aiAnalysisResult.action_steps?.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">📋 צעדים לביצוע</h4>
                  <ol className="space-y-1 mr-1">
                    {aiAnalysisResult.action_steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--primary)] text-white text-xs flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Vendor message */}
              {aiAnalysisResult.vendor_message && (
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">💬 הודעה לספק</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(aiAnalysisResult.vendor_message, 'vendor')}
                    >
                      {copiedField === 'vendor'
                        ? <><CheckCheck className="h-3.5 w-3.5 text-green-600" /> הועתק</>
                        : <><Copy className="h-3.5 w-3.5" /> העתק</>
                      }
                    </Button>
                  </div>
                  <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-hover)] rounded-lg p-3">
                    {aiAnalysisResult.vendor_message}
                  </pre>
                </div>
              )}

              {/* Committee summary */}
              {aiAnalysisResult.committee_summary && (
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">📝 סיכום לועד הבית</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(aiAnalysisResult.committee_summary, 'committee')}
                    >
                      {copiedField === 'committee'
                        ? <><CheckCheck className="h-3.5 w-3.5 text-green-600" /> הועתק</>
                        : <><Copy className="h-3.5 w-3.5" /> העתק</>
                      }
                    </Button>
                  </div>
                  <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-hover)] rounded-lg p-3">
                    {aiAnalysisResult.committee_summary}
                  </pre>
                </div>
              )}

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Template Picker Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>יצירה מתבנית</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {ISSUE_TEMPLATES.map((tpl) => (
              <Button
                key={tpl.label}
                variant="outline"
                className="h-auto py-3 flex-col items-start text-right"
                onClick={() => openCreateFromTemplate(tpl)}
              >
                <span className="text-sm font-medium">{tpl.label}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {tpl.category} - {PRIORITY_MAP[tpl.priority]?.label}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Quote Dialog */}
      <Dialog open={!!quoteDialogIssue} onOpenChange={() => setQuoteDialogIssue(null)}>
        <DialogContent className="w-full max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>בקשת הצעת מחיר</DialogTitle>
          </DialogHeader>
          {quoteDialogIssue && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                תקלה: {quoteDialogIssue.title}
              </p>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">בחר ספקים</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-[var(--border)] rounded-lg p-2">
                  {allVendors
                    .filter((v) => !quoteDialogIssue.category || !v.category || v.category === quoteDialogIssue.category)
                    .map((v) => (
                      <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--surface-hover)] p-1 rounded">
                        <input
                          type="checkbox"
                          checked={quoteSelectedVendors.includes(v.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setQuoteSelectedVendors((prev) => [...prev, v.name])
                            } else {
                              setQuoteSelectedVendors((prev) => prev.filter((n) => n !== v.name))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-[var(--text-primary)]">{v.name}</span>
                        {v.category && <span className="text-xs text-[var(--text-muted)]">({v.category})</span>}
                      </label>
                    ))}
                  {allVendors.filter((v) => !quoteDialogIssue.category || !v.category || v.category === quoteDialogIssue.category).length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-2">אין ספקים מתאימים</p>
                  )}
                </div>
              </div>
              <FormTextarea
                label="תיאור לבקשה"
                value={quoteDescription}
                onChange={(e) => setQuoteDescription(e.target.value)}
              />
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSendQuoteRequests} disabled={quoteSelectedVendors.length === 0}>
                  <Send className="h-4 w-4" />
                  שלח בקשה ({quoteSelectedVendors.length})
                </Button>
                <Button variant="outline" onClick={() => setQuoteDialogIssue(null)}>
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Vendor Dialog */}
      <Dialog open={!!vendorAssignIssue} onOpenChange={() => setVendorAssignIssue(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>קבע ספק</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormSelect
              label="בחר ספק"
              value={selectedVendorName}
              onChange={(e) => setSelectedVendorName(e.target.value)}
              options={allVendors.map((v) => ({ value: v.name, label: `${v.name} (${v.category || ''})` }))}
              placeholder="בחר ספק"
            />
            <div className="flex gap-3">
              <Button onClick={handleAssignVendor} disabled={!selectedVendorName}>
                קבע
              </Button>
              <Button variant="outline" onClick={() => setVendorAssignIssue(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={!!scheduleDialogIssue} onOpenChange={() => setScheduleDialogIssue(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>תזמון עבודה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField
              label="תאריך מתוזמן"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              required
            />
            <div className="flex gap-3">
              <Button onClick={handleSchedule} disabled={!scheduleDate}>
                <Calendar className="h-4 w-4" />
                תזמן
              </Button>
              <Button variant="outline" onClick={() => setScheduleDialogIssue(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={!!completeDialogIssue} onOpenChange={() => setCompleteDialogIssue(null)}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>סימון כבוצע</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField
              label="עלות בפועל"
              type="number"
              value={completeCost}
              onChange={(e) => setCompleteCost(e.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={handleComplete}>
                <CheckCircle2 className="h-4 w-4" />
                סמן כבוצע
              </Button>
              <Button variant="outline" onClick={() => setCompleteDialogIssue(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת תקלה' : 'תקלה חדשה'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormSelect
              label="בניין *"
              value={form.buildingId}
              onChange={setField('buildingId')}
              options={buildingOptions}
              placeholder="בחר בניין"
              error={formErrors.buildingId}
            />
            <FormSelect
              label="דירה"
              value={form.unitId}
              onChange={setField('unitId')}
              options={formUnitOptions}
              placeholder="בחר דירה"
            />
            <FormField
              label="כותרת *"
              value={form.title}
              onChange={setField('title')}
              error={formErrors.title}
            />
            <FormTextarea
              label="תיאור"
              value={form.description}
              onChange={setField('description')}
            />
            <FormSelect
              label="קטגוריה"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
              placeholder="בחר קטגוריה"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormSelect
                label="עדיפות *"
                value={form.priority}
                onChange={setField('priority')}
                options={PRIORITY_OPTIONS}
                error={formErrors.priority}
              />
              <FormSelect
                label="סטטוס"
                value={form.status}
                onChange={setField('status')}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="תאריך דיווח"
                type="date"
                value={form.reportedAt}
                onChange={setField('reportedAt')}
              />
              <FormField
                label="תאריך מתוזמן"
                type="date"
                value={form.scheduledDate}
                onChange={setField('scheduledDate')}
              />
            </div>
            <FormField
              label="תאריך פתרון"
              type="date"
              value={form.resolvedAt}
              onChange={setField('resolvedAt')}
            />
            <FormSelect
              label="ספק"
              value={form.vendor_name}
              onChange={setField('vendor_name')}
              options={vendorOptions}
              placeholder="בחר ספק"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="עלות משוערת"
                type="number"
                value={form.estimatedCost}
                onChange={setField('estimatedCost')}
              />
              <FormField
                label="עלות בפועל"
                type="number"
                value={form.cost}
                onChange={setField('cost')}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור שינויים' : 'צור תקלה'}</Button>
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

export default Issues
