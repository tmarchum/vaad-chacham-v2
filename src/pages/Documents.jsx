import { useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetailModal, DetailRow } from '@/components/common/DetailModal'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/common/PageHeader'
import { Plus, Pencil, Trash2, FileText, Shield, BookOpen, CheckSquare, FileSignature, File, LayoutGrid, List, Upload, Download, ExternalLink, FolderOpen, AlertTriangle } from 'lucide-react'

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

function getTypeIcon(type) {
  return TYPE_CONFIG[type]?.icon ?? File
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function DocStatCard({ label, value, icon: Icon, gradient }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">{label}</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Document Grid Card
// ---------------------------------------------------------------------------

// Gradient map for document types
const DOC_TYPE_GRADIENTS = {
  insurance:  'from-sky-500 to-sky-600',
  protocol:   'from-violet-500 to-violet-600',
  bylaws:     'from-indigo-500 to-indigo-600',
  inspection: 'from-amber-500 to-amber-600',
  contract:   'from-blue-500 to-blue-600',
  other:      'from-slate-500 to-slate-600',
}

function DocumentGridCard({ doc, onEdit, onDelete, onView }) {
  const TypeIcon = getTypeIcon(doc.type)
  const expiry = getExpiryStatus(doc.expiresAt)
  const gradient = DOC_TYPE_GRADIENTS[doc.type] || DOC_TYPE_GRADIENTS.other

  // Expiry dot color
  const expiryDotColor = expiry
    ? expiry.variant === 'danger' ? 'bg-red-500'
      : expiry.variant === 'warning' ? 'bg-amber-500'
      : 'bg-emerald-500'
    : null
  const expiryTextColor = expiry
    ? expiry.variant === 'danger' ? 'text-red-700'
      : expiry.variant === 'warning' ? 'text-amber-700'
      : 'text-emerald-700'
    : null

  return (
    <div
      className="group relative rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer overflow-hidden"
      onClick={() => onView(doc)}
    >
      {/* Gradient top accent */}
      <div className={`h-1.5 bg-gradient-to-l ${gradient}`} />

      <div className="p-5 flex flex-col items-center gap-3 text-center">
        {/* Gradient icon circle */}
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm`}>
          <TypeIcon className="h-7 w-7" />
        </div>

        {/* Title */}
        <p className="font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight text-[14px]">
          {doc.title}
        </p>

        {/* Category badge */}
        {doc.category && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {doc.category}
          </span>
        )}

        {/* Meta info row */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          {doc.uploadedAt && <span>{formatDate(doc.uploadedAt)}</span>}
          {doc.fileSize && <span>{doc.fileSize}</span>}
        </div>

        {/* Expiry status */}
        {expiry && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${expiryDotColor}`} />
            <span className={`text-[11px] font-medium ${expiryTextColor}`}>{expiry.label}</span>
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div
        className="absolute top-3 left-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 bg-white/80 backdrop-blur-sm shadow-sm"
          onClick={(e) => { e.stopPropagation(); onEdit(doc) }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 bg-white/80 backdrop-blur-sm shadow-sm"
          onClick={(e) => { e.stopPropagation(); onDelete(doc) }}
        >
          <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Document List Row
// ---------------------------------------------------------------------------

function DocumentListRow({ doc, onEdit, onDelete, onView }) {
  const TypeIcon = getTypeIcon(doc.type)
  const expiry = getExpiryStatus(doc.expiresAt)
  const gradient = DOC_TYPE_GRADIENTS[doc.type] || DOC_TYPE_GRADIENTS.other

  // Expiry dot
  const expiryDotColor = expiry
    ? expiry.variant === 'danger' ? 'bg-red-500'
      : expiry.variant === 'warning' ? 'bg-amber-500'
      : 'bg-emerald-500'
    : null
  const expiryTextColor = expiry
    ? expiry.variant === 'danger' ? 'text-red-700'
      : expiry.variant === 'warning' ? 'text-amber-700'
      : 'text-emerald-700'
    : null

  return (
    <div
      className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
      onClick={() => onView(doc)}
    >
      {/* Gradient type circle */}
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shrink-0 shadow-sm`}>
        <TypeIcon className="h-5 w-5" />
      </div>

      {/* Title + category */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
            {doc.title}
          </span>
          {doc.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 shrink-0">
              {doc.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          {doc.uploadedAt && <span>{formatDate(doc.uploadedAt)}</span>}
          {doc.fileSize && <span>{doc.fileSize}</span>}
        </div>
      </div>

      {/* Expiry status */}
      <div className="hidden sm:flex items-center gap-2 min-w-[100px]">
        {expiry ? (
          <>
            <div className={`w-2 h-2 rounded-full shrink-0 ${expiryDotColor}`} />
            <span className={`text-[12px] font-medium ${expiryTextColor}`}>{expiry.label}</span>
          </>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div
        className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button size="icon" variant="ghost" onClick={() => onEdit(doc)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(doc)}>
          <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Documents() {
  const { data: documents, create, update, remove, isLoading } = useCollection('documents')
  const { buildings } = useBuildingContext()

  // UI state
  const [search, setSearch] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('הכל')
  const [categoryFilter, setCategoryFilter] = useState('הכל')
  const [viewMode, setViewMode] = useState('grid')

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
    return documents.filter((doc) => {
      // Building filter
      if (buildingFilter !== 'הכל') {
        const building = buildingMap[doc.buildingId]
        if (!building || building.name !== buildingFilter) return false
      }

      // Category filter
      if (categoryFilter !== 'הכל' && doc.category !== categoryFilter) return false

      // Search
      if (search) {
        const q = search.toLowerCase()
        const haystack = [doc.title, doc.category, doc.notes].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }, [documents, buildingFilter, categoryFilter, search, buildingMap])

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const summary = useMemo(() => {
    let expiringSoon = 0
    let expired = 0

    documents.forEach((doc) => {
      if (!doc.expiresAt) return
      const today = new Date()
      const expiry = new Date(doc.expiresAt)
      const diff = Math.floor((expiry - today) / (1000 * 60 * 60 * 24))
      if (diff < 0) expired++
      else if (diff <= 30) expiringSoon++
    })

    const categories = new Set(documents.map((d) => d.category).filter(Boolean))

    return { total: documents.length, expiringSoon, expired, categories: categories.size }
  }, [documents])

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  function openCreate() {
    setEditingDoc(null)
    setForm(EMPTY_FORM)
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
        await remove(deleteDoc.id)
      } catch (err) {
        console.error('Failed to delete document:', err)
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה במחיקת מסמך', type: 'error' } }))
      }
      setDeleteDoc(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) return (
    <div className="p-6">
      <PageHeader icon={FolderOpen} iconColor="blue" title="ארכיון מסמכים" />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div dir="rtl" className="space-y-6 p-6">

      <PageHeader
        icon={FolderOpen}
        iconColor="blue"
        title="ארכיון מסמכים"
        subtitle="ניהול מסמכים ותיקים של הבניין"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            מסמך חדש
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DocStatCard label="סה״כ מסמכים" value={summary.total} icon={FolderOpen} gradient="from-blue-500 to-blue-600" />
        <DocStatCard label="פגים בעוד 30 יום" value={summary.expiringSoon} icon={AlertTriangle} gradient="from-amber-400 to-amber-500" />
        <DocStatCard label="פג תוקף" value={summary.expired} icon={AlertTriangle} gradient="from-red-500 to-red-600" />
        <DocStatCard label="קטגוריות" value={summary.categories} icon={LayoutGrid} gradient="from-indigo-500 to-indigo-600" />
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="חיפוש לפי כותרת, קטגוריה, הערות..."
          className="w-full sm:w-80"
        />

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1 self-end sm:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded p-1.5 transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
            title="תצוגת כרטיסים"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded p-1.5 transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
            title="תצוגת רשימה"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Building filter pills */}
      {buildings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {['הכל', ...buildings.map((b) => b.name)].map((name) => (
            <button
              key={name}
              onClick={() => setBuildingFilter(name)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                buildingFilter === name
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              categoryFilter === cat
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {cat}
          </button>
        ))}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <DocumentGridCard
              key={doc.id}
              doc={doc}
              onEdit={openEdit}
              onDelete={setDeleteDoc}
              onView={setDetailDoc}
            />
          ))}
        </div>
      ) : (
        /* List view — premium card rows */
        <div className="space-y-2">
          {filtered.map((doc) => (
            <DocumentListRow
              key={doc.id}
              doc={doc}
              onEdit={openEdit}
              onDelete={setDeleteDoc}
              onView={setDetailDoc}
            />
          ))}
        </div>
      )}

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
            />

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                העלאת קובץ
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
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
