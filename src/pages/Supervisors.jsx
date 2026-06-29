import { useState, useMemo } from 'react'
import { useCollection } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormBool, FormTextarea } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { isWhatsappable, waLink, telHref } from '@/lib/phone'
import { ShieldCheck, Plus, Pencil, Trash2, Phone, Mail, Star, MapPin } from 'lucide-react'

// Supervisors (מפקחים) — a SEPARATE registry from vendors. A supervisor oversees
// a vendor's work on an issue when the committee decides one is needed.

const EMPTY_FORM = {
  name: '', phone: '', email: '', area: '', specialty: '', call_price: '', rating: '', notes: '', is_active: true,
}

export default function Supervisors() {
  const { data: supervisors, create, update, remove, isSaving, isLoading } = useCollection('supervisors')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supervisors
    return supervisors.filter((s) =>
      [s.name, s.specialty, s.area, s.phone].some((v) => (v || '').toLowerCase().includes(q)))
  }, [supervisors, search])

  const set = (f) => (e) =>
    setForm((p) => ({ ...p, [f]: e?.target?.value !== undefined ? e.target.value : e }))

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }
  const openEdit = (s) => {
    setEditingId(s.id)
    setForm({
      name: s.name || '', phone: s.phone || '', email: s.email || '', area: s.area || '',
      specialty: s.specialty || '', call_price: s.call_price != null ? String(s.call_price) : '',
      rating: s.rating != null ? String(s.rating) : '',
      notes: s.notes || '', is_active: s.is_active !== false,
    })
    setFormOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const data = {
      ...form,
      rating: form.rating === '' ? null : Number(form.rating),
      call_price: form.call_price === '' ? null : Number(form.call_price),
    }
    if (editingId) await update(editingId, data)
    else await create(data)
    setFormOpen(false)
  }

  if (isLoading) return (
    <div className="p-6"><PageHeader icon={ShieldCheck} iconColor="indigo" title="מפקחים" />
      <p className="text-center text-[var(--text-muted)] py-12">טוען...</p></div>
  )

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <PageHeader
        icon={ShieldCheck} iconColor="indigo" title="מפקחים"
        subtitle={`${supervisors.length} מפקחים — מלווים ומפקחים על עבודת הספקים`}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" />מפקח חדש</Button>}
      />

      <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם, התמחות, אזור, טלפון..." />

      {filtered.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="אין מפקחים"
          description={search ? 'לא נמצאו תוצאות' : 'הוסף מפקחים לרשימה — הם ילוו את עבודות הספקים'}
          actionLabel={!search ? 'הוסף מפקח' : undefined} onAction={!search ? openCreate : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const wa = waLink(s.phone, `שלום ${s.name}, מדובר בוועד הבית.`)
            return (
              <Card key={s.id} className={`border ${s.is_active === false ? 'opacity-60' : ''}`}>
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-600" />
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-[var(--text-primary)] truncate">{s.name}</h3>
                        {s.rating > 0 && <span className="text-xs text-amber-500 flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400" />{s.rating}</span>}
                        {s.is_active === false && <Badge variant="default" className="text-[10px]">לא פעיל</Badge>}
                      </div>
                      {s.specialty && <p className="text-xs text-[var(--text-secondary)]">{s.specialty}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] space-y-1">
                    {s.area && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-[var(--text-muted)]" />{s.area}</p>}
                    {s.call_price != null && s.call_price !== '' && <p className="font-medium text-[var(--text-primary)]">מחיר לקריאה: ₪{s.call_price}</p>}
                    {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-[var(--text-muted)]" />{s.phone}</p>}
                    {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-[var(--text-muted)]" />{s.email}</p>}
                  </div>
                  {s.phone && (
                    <a href={wa || telHref(s.phone)} target="_blank" rel="noopener noreferrer" className="inline-block">
                      <Button size="sm" variant="outline">{isWhatsappable(s.phone) ? '💬 וואטסאפ' : '📞 התקשר'}</Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <DeleteConfirm open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}
        onConfirm={async () => { await remove(deleteTarget.id); setDeleteTarget(null) }}
        itemName={deleteTarget?.name || 'מפקח'} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'עריכת מפקח' : 'מפקח חדש'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
            <FormField label="שם" value={form.name} onChange={set('name')} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="טלפון" value={form.phone} onChange={set('phone')} />
              <FormField label="אימייל" type="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="תחום פיקוח / התמחות" value={form.specialty} onChange={set('specialty')} placeholder="מהנדס בניין, בודק חשמל, מפקח עבודות..." />
              <FormField label="אזור שירות" value={form.area} onChange={set('area')} placeholder="פתח תקווה, גוש דן..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="מחיר לקריאה (₪)" type="number" value={form.call_price} onChange={set('call_price')} />
              <FormField label="דירוג (1-5)" type="number" value={form.rating} onChange={set('rating')} />
              <FormBool label="פעיל" value={form.is_active} onChange={set('is_active')} />
            </div>
            <FormTextarea label="הערות" value={form.notes} onChange={set('notes')} />
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={isSaving}>{isSaving ? 'שומר...' : editingId ? 'שמור' : 'הוסף מפקח'}</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
