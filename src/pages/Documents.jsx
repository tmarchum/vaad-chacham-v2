import { useState, useMemo, useRef, createElement } from 'react'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { TabGroup } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, FileText, Shield, BookOpen, CheckSquare, FileSignature, File, LayoutGrid, List, Upload, Download, ExternalLink, FolderOpen, AlertTriangle, CalendarClock, CloudUpload } from 'lucide-react'
import { toastError } from '@/lib/toast'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  insurance:  { label: 'ביטוח',       icon: Shield,        category: 'ביטוח' },
  protocol:   { label: 'פרוטוקול',    icon: FileText,      category: 'פרוטוקולים' },
  bylaws:     { label: 'תקנון',       icon: BookOpen,      category: 'תקנון' },
  inspection: { label: 'בדיקה',       icon: CheckSquare,   category: 'בדיקות' },
  contract:   { label: 'חוזה',        icon: FileSignature, category: 'חוזים' },
  other:      { label: 'אחר',         icon: File,          category: 'אחר' },
}

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }))

const CATEGORY_FILTERS = ['הכל', 'ביטוח', 'פרוטוקולים', 'תקנון', 'בדיקות', 'חוזים', 'אחר']

const EMPTY_FORM = {
  buildingId: '', title: '', type: '', category: '',
  uploadedAt: new Date().toISOString().slice(0, 10),
  expiresAt: '', notes: '', fileSize: '', fileUrl: '',
}

const STORAGE_BUCKET = 'documents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExpiryStatus(expiresAt) {
  if (!expiresAt) return null
  const today = new Date()
  const expiry = new Date(expiresAt)
  const diff = Math.floor((expiry - today) / (1000 * 60 * 60 * 24))
  if (diff < 0)   return { label: 'פג תוקף',                variant: 'danger' }
  if (diff <= 30)  return { label: `פג בעוד ${diff} ימים`, variant: 'warning' }
  return { label: 'בתוקף', variant: 'success' }
}

function getExpiryBadge(expiresAt) {
  if (!expiresAt) return null
  const now = new Date(); now.setHours(0,0,0,0)
  const exp = new Date(expiresAt)
  const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: 'פג תוקף', variant: 'danger', urgent: true }
  if (daysLeft <= 7) return { label: `${daysLeft} ימים`, variant: 'danger', urgent: true }
  if (daysLeft <= 30) return { label: `${daysLeft} ימים`, variant: 'warning', urgent: false }
  return null
}

function getTypeIcon(type) {
  return TYPE_CONFIG[type]?.icon ?? File
}

const CHIP = {
  danger:  'bg-[var(--danger-light)] text-[var(--danger)]',
  warning: 'bg-[var(--warning-light)] text-[var(--warning)]',
  success: 'bg-[var(--success-light)] text-[var(--success)]',
}

function ExpiryChip({ expiresAt }) {
  const expiry = getExpiryStatus(expiresAt)
  if (!expiry) return <span className="text-[11px] text-[var(--text-muted)]">ללא תוקף</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${CHIP[expiry.variant]}`}>
      {expiry.label}
    </span>
  )
}

function CategoryChip({ category }) {
  if (!category) return <span className="text-[var(--text-muted)]">—</span>
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold whitespace-nowrap">
      {category}
    </span>
  )
}

function TypeTile({ type, size = 'md' }) {
  return (
    <span className={`shrink-0 inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] ${size === 'lg' ? 'p-2.5' : 'p-1.5'}`}>
      {createElement(getTypeIcon(type), { className: size === 'lg' ? 'h-6 w-6' : 'h-4 w-4', strokeWidth: 1.75 })}
    </span>
  )
}

function RowActions({ doc, onEdit, onDelete }) {
  const url = doc.fileUrl || doc.file_url
  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" title="צפייה / הורדה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-secondary)]">
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
      <button onClick={() => onEdit(doc)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => onDelete(doc)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Document file card (grid view + mobile fallback)
// ---------------------------------------------------------------------------

function DocumentCard({ doc, onEdit, onDelete, onView }) {
  const badge = getExpiryBadge(doc.expiresAt || doc.expires_at)
  return (
    <div
      className="group p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] hover:border-[var(--primary)]/30 transition-colors cursor-pointer flex flex-col gap-3"
      onClick={() => onView(doc)}
    >
      <div className="flex items-start gap-3">
        <TypeTile type={doc.type} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--text-primary)] line-clamp-2 leading-5">{doc.title}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 num-tabular">
            {TYPE_CONFIG[doc.type]?.label || 'מסמך'}
            {doc.uploadedAt && ` • ${formatDate(doc.uploadedAt)}`}
            {doc.fileSize && ` • ${doc.fileSize}`}
          </p>
        </div>
        <RowActions doc={doc} onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[var(--border-light)]">
        <CategoryChip category={doc.category} />
        <ExpiryChip expiresAt={doc.expiresAt} />
        {badge && (
          <Badge variant={badge.variant} className={`text-[10px] ${badge.urgent ? 'animate-pulse' : ''}`}>{badge.label}</Badge>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Documents() {
  const { buildings, selectedBuilding } = useBuildingContext()
  // Building-scoped server-side by the sidebar's building.
  const { data: documents, create, update, remove, isLoading } = useCollection('documents', { building_id: selectedBuilding?.id })

  // UI state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('הכל')
  const [viewMode, setViewMode] = useState('list')

  // Dialog / modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailDoc, setDetailDoc] = useState(null)
  const [deleteDoc, setDeleteDoc] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Building options for FormSelect
  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: b.name })),
    [buildings]
  )

  // Building id -> name map
  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => { map[b.id] = b })
    return map
  }, [buildings])

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return documents
      .filter((doc) => {
        if (categoryFilter !== 'הכל' && doc.category !== categoryFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const haystack = [doc.title, doc.category, doc.notes].join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))
  }, [documents, categoryFilter, search])

  const categoryCounts = useMemo(() => {
    const m = {}
    documents.forEach((d) => { if (d.category) m[d.category] = (m[d.category] || 0) + 1 })
    return m
  }, [documents])

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const summary = useMemo(() => {
    let expiringSoon = 0
    let expired = 0
    const attention = []
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
    let recent = 0

    documents.forEach((doc) => {
      if (doc.uploadedAt && new Date(doc.uploadedAt) >= monthAgo) recent++
      if (!doc.expiresAt) return
      const today = new Date()
      const expiry = new Date(doc.expiresAt)
      const diff = Math.floor((expiry - today) / (1000 * 60 * 60 * 24))
      if (diff < 0) { expired++; attention.push(doc) }
      else if (diff <= 30) { expiringSoon++; attention.push(doc) }
    })
    attention.sort((a, b) => (a.expiresAt || '').localeCompare(b.expiresAt || ''))

    const categories = new Set(documents.map((d) => d.category).filter(Boolean))

    return { total: documents.length, expiringSoon, expired, categories: categories.size, recent, attention }
  }, [documents])

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  function openCreate() {
    setEditingDoc(null)
    setForm({ ...EMPTY_FORM, buildingId: selectedBuilding?.id ?? '' })
    setSelectedFile(null)
    setFormOpen(true)
  }

  function openEdit(doc) {
    setEditingDoc(doc)
    setForm({
      buildingId:  doc.buildingId  ?? '',
      title:       doc.title       ?? '',
      type:        doc.type        ?? '',
      category:    doc.category    ?? '',
      uploadedAt:  doc.uploadedAt  ?? new Date().toISOString().slice(0, 10),
      expiresAt:   doc.expiresAt   ?? '',
      notes:       doc.notes       ?? '',
      fileSize:    doc.fileSize    ?? '',
      fileUrl:     doc.fileUrl     ?? doc.file_url ?? '',
    })
    setSelectedFile(null)
    setDetailDoc(null)
    setFormOpen(true)
  }

  async function uploadFileToStorage(file, buildingId) {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${buildingId || 'general'}/${Date.now()}_${sanitizedName}`
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) {
      console.error('Storage upload error:', error)
      return null
    }
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path)
    return { url: publicUrl, size: formatFileSize(file.size) }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function handleFormChange(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'type' && TYPE_CONFIG[value]) {
        next.category = TYPE_CONFIG[value].category
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setUploading(true)
    try {
      let fileUrl = form.fileUrl
      let fileSize = form.fileSize

      if (selectedFile) {
        const result = await uploadFileToStorage(selectedFile, form.buildingId)
        if (result) {
          fileUrl = result.url
          fileSize = result.size
        }
      }

      const docData = { ...form, fileUrl, file_url: fileUrl, fileSize }
      if (editingDoc) {
        await update(editingDoc.id, docData)
      } else {
        await create(docData)
      }
      setFormOpen(false)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (deleteDoc) {
      try {
        const fileUrl = deleteDoc.file_url || deleteDoc.fileUrl
        if (fileUrl) {
          try {
            // Extract path after /documents/
            const match = fileUrl.match(/\/documents\/(.+)$/)
            if (match) {
              const filePath = decodeURIComponent(match[1])
              await supabase.storage.from('documents').remove([filePath])
            }
          } catch { /* storage errors are non-fatal */ }
        }
        await remove(deleteDoc.id)
      } catch (err) {
        console.error('Failed to delete document:', err)
        toastError('שגיאה במחיקת מסמך')
      }
      setDeleteDoc(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const subtitle = `ספריית המסמכים, החוזים והביטוחים של הבניין${selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}`

  if (isLoading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ארכיון מסמכים</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">{subtitle}</p>
      </div>
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
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ארכיון מסמכים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />מסמך חדש</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="סה״כ מסמכים" icon={FolderOpen} color="blue"
          value={String(summary.total)}
          sub={`${summary.categories} קטגוריות פעילות`} />
        <StatCard label="פגים בעוד 30 יום" icon={CalendarClock} color={summary.expiringSoon ? 'amber' : 'emerald'}
          value={String(summary.expiringSoon)}
          sub={summary.expiringSoon ? 'דורשים חידוש בקרוב' : 'אין מסמכים שפגים בקרוב'} />
        <StatCard label="פג תוקף" icon={AlertTriangle} color={summary.expired ? 'red' : 'emerald'}
          value={String(summary.expired)}
          sub={summary.expired ? 'יש לחדש או להעלות גרסה עדכנית' : 'כל המסמכים בתוקף ✓'} />
        <StatCard label="הועלו ב-30 הימים האחרונים" icon={CloudUpload} color="purple"
          value={String(summary.recent)}
          sub={summary.total ? `${Math.round((summary.recent / summary.total) * 100)}% מהארכיון` : 'הארכיון ריק'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-4">
          {/* Filter card */}
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי כותרת, קטגוריה, הערות..." />
              </div>
              <TabGroup
                tabs={[
                  { key: 'list', label: 'טבלה', icon: List },
                  { key: 'grid', label: 'כרטיסים', icon: LayoutGrid },
                ]}
                activeTab={viewMode}
                onChange={setViewMode}
                className="self-end sm:self-auto shrink-0"
              />
            </div>
            <TabGroup
              tabs={CATEGORY_FILTERS.map((cat) => ({
                key: cat,
                label: cat,
                count: cat === 'הכל' ? documents.length : (categoryCounts[cat] || 0),
              }))}
              activeTab={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>

          {/* Documents */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={File}
              title="לא נמצאו מסמכים"
              description="הוסף מסמך חדש או שנה את הסינון"
              actionLabel="מסמך חדש"
              onAction={openCreate}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtered.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} onEdit={openEdit} onDelete={setDeleteDoc} onView={setDetailDoc} />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop ledger */}
              <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>מסמך</th><th>קטגוריה</th><th>הועלה</th><th>תוקף</th><th>גודל</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((doc) => {
                        const badge = getExpiryBadge(doc.expiresAt || doc.expires_at)
                        return (
                          <tr key={doc.id} onClick={() => setDetailDoc(doc)} className="cursor-pointer">
                            <td className="min-w-[220px]">
                              <div className="flex items-center gap-2.5">
                                <TypeTile type={doc.type} />
                                <div className="min-w-0">
                                  <span className="block text-[13px] font-semibold truncate">{doc.title}</span>
                                  {doc.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{doc.notes}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap"><CategoryChip category={doc.category} /></td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">{doc.uploadedAt ? formatDate(doc.uploadedAt) : '—'}</td>
                            <td className="whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <ExpiryChip expiresAt={doc.expiresAt} />
                                {badge?.urgent && <Badge variant={badge.variant} className="text-[10px] animate-pulse">{badge.label}</Badge>}
                              </div>
                              {doc.expiresAt && <span className="block text-[11px] text-[var(--text-muted)] num-tabular mt-0.5">{formatDate(doc.expiresAt)}</span>}
                            </td>
                            <td className="whitespace-nowrap text-[12px] text-[var(--text-secondary)] num-tabular">{doc.fileSize || '—'}</td>
                            <td className="whitespace-nowrap"><RowActions doc={doc} onEdit={openEdit} onDelete={setDeleteDoc} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>מציג {filtered.length} מתוך {documents.length} מסמכים</span>
                  <span>ממוין לפי תאריך העלאה</span>
                </div>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {filtered.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} onEdit={openEdit} onDelete={setDeleteDoc} onView={setDetailDoc} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Side panel: expiry watch-list */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-4">
          <SectionCard
            icon={CalendarClock}
            title="מעקב תוקף"
            subtitle="מסמכים שפג תוקפם או פגים ב-30 הימים הקרובים"
            footer={summary.attention.length ? `${summary.attention.length} מסמכים דורשים טיפול` : null}
          >
            {summary.attention.length === 0 ? (
              <p className="p-6 text-center text-[12px] text-[var(--text-muted)]">כל המסמכים בתוקף ✓</p>
            ) : (
              <ul className="divide-y divide-[var(--border-light)]">
                {summary.attention.slice(0, 8).map((doc) => (
                  <li key={doc.id}>
                    <button onClick={() => setDetailDoc(doc)} className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-[var(--surface-secondary)]">
                      <TypeTile type={doc.type} />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-[var(--text-primary)] truncate">{doc.title}</span>
                        <span className="block text-[11px] text-[var(--text-muted)] num-tabular">{formatDate(doc.expiresAt)}</span>
                      </div>
                      <ExpiryChip expiresAt={doc.expiresAt} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={FolderOpen} title="לפי קטגוריה" subtitle={`${summary.categories} קטגוריות`}>
            <div className="p-4 space-y-3">
              {CATEGORY_FILTERS.slice(1).map((cat) => {
                const n = categoryCounts[cat] || 0
                const pct = summary.total ? Math.round((n / summary.total) * 100) : 0
                return (
                  <button key={cat} onClick={() => setCategoryFilter(cat)} className="w-full text-right">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className={`font-medium ${categoryFilter === cat ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'}`}>{cat}</span>
                      <span className="num-tabular text-[var(--text-secondary)]"><strong>{n}</strong> ({pct}%)</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </SectionCard>
        </aside>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit Dialog                                                */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'עריכת מסמך' : 'מסמך חדש'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormSelect
              label="בניין"
              value={form.buildingId}
              onChange={(e) => handleFormChange('buildingId', e.target.value)}
              options={buildingOptions}
              placeholder="בחר בניין"
            />

            <FormField
              label="כותרת"
              required
              value={form.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
              placeholder="שם המסמך"
            />

            <FormSelect
              label="סוג"
              value={form.type}
              onChange={(e) => handleFormChange('type', e.target.value)}
              options={TYPE_OPTIONS}
              placeholder="בחר סוג"
            />

            <FormField
              label="קטגוריה"
              value={form.category}
              onChange={(e) => handleFormChange('category', e.target.value)}
              placeholder="מתמלא אוטומטית לפי סוג"
            />

            <FormField
              label="תאריך העלאה"
              type="date"
              value={form.uploadedAt}
              onChange={(e) => handleFormChange('uploadedAt', e.target.value)}
            />

            <FormField
              label="תאריך פקיעת תוקף"
              type="date"
              value={form.expiresAt}
              onChange={(e) => handleFormChange('expiresAt', e.target.value)}
            />

            <FormTextarea
              label="הערות"
              value={form.notes}
              onChange={(e) => handleFormChange('notes', e.target.value)}
              placeholder="הערות נוספות..."
              rows={3}
            />

            <FormField
              label="גודל קובץ"
              value={form.fileSize}
              onChange={(e) => handleFormChange('fileSize', e.target.value)}
              placeholder="מחושב אוטומטית בעת העלאת קובץ"
              readOnly
              className="bg-[var(--surface-secondary)]"
            />

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                העלאת קובץ
              </label>
              <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] border border-dashed border-[var(--outline-variant)] bg-[var(--bg)]">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setSelectedFile(file)
                    if (file) {
                      const fileSizeKB = Math.round(file.size / 1024)
                      const sizeLabel = fileSizeKB > 1024
                        ? `${(fileSizeKB / 1024).toFixed(1)} MB`
                        : `${fileSizeKB} KB`
                      setForm(f => ({ ...f, fileSize: sizeLabel }))
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 ml-1" />
                  בחר קובץ
                </Button>
                {selectedFile && (
                  <span className="text-sm text-[var(--text-secondary)] truncate">
                    {selectedFile.name}
                  </span>
                )}
                {!selectedFile && form.fileUrl && (
                  <a
                    href={form.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--primary)] underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    קובץ קיים
                  </a>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? 'מעלה...' : editingDoc ? 'שמור שינויים' : 'הוסף מסמך'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Detail Modal                                                        */}
      {/* ------------------------------------------------------------------ */}
      {detailDoc && (
        <DetailModal
          open={!!detailDoc}
          onOpenChange={(v) => { if (!v) setDetailDoc(null) }}
          title={detailDoc.title}
          onEdit={() => openEdit(detailDoc)}
        >
          <DetailRow label="בניין"                value={buildingMap[detailDoc.buildingId]?.name} />
          <DetailRow label="סוג"                  value={TYPE_CONFIG[detailDoc.type]?.label} />
          <DetailRow label="קטגוריה"              value={detailDoc.category} />
          <DetailRow label="תאריך העלאה"          value={detailDoc.uploadedAt ? formatDate(detailDoc.uploadedAt) : null} />
          <DetailRow label="תאריך פקיעת תוקף"    value={detailDoc.expiresAt  ? formatDate(detailDoc.expiresAt)  : null} />
          <DetailRow
            label="סטטוס תוקף"
            value={(() => {
              const exp = getExpiryStatus(detailDoc.expiresAt)
              return exp ? <Badge variant={exp.variant}>{exp.label}</Badge> : null
            })()}
          />
          <DetailRow label="גודל קובץ"            value={detailDoc.fileSize} />
          <DetailRow label="הערות"                value={detailDoc.notes} />
          {(detailDoc.fileUrl || detailDoc.file_url) && (
            <DetailRow
              label="קובץ"
              value={
                <a
                  href={detailDoc.fileUrl || detailDoc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[var(--primary)] underline text-sm"
                >
                  <Download className="h-4 w-4" />
                  הורד / צפה בקובץ
                </a>
              }
            />
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => openEdit(detailDoc)}>
              <Pencil className="h-3.5 w-3.5" />
              עריכה
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { const d = detailDoc; setDetailDoc(null); setDeleteDoc(d) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              מחיקה
            </Button>
          </div>
        </DetailModal>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirm                                                      */}
      {/* ------------------------------------------------------------------ */}
      <DeleteConfirm
        open={!!deleteDoc}
        onOpenChange={(v) => { if (!v) setDeleteDoc(null) }}
        onConfirm={handleDelete}
        itemName={deleteDoc?.title ?? 'מסמך'}
      />
    </div>
  )
}
