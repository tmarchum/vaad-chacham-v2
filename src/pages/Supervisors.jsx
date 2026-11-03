import { useState, useMemo } from 'react'
import { useCollection } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { FormField, FormBool, FormTextarea } from '@/components/common/FormField'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { isWhatsappable, waLink, telHref } from '@/lib/phone'
import { cn, formatCurrency } from '@/lib/utils'
import { ShieldCheck, Plus, Pencil, Trash2, Phone, Mail, Star, MapPin, UserCheck, Coins } from 'lucide-react'

// Supervisors (מפקחים) — a SEPARATE registry from vendors. A supervisor oversees
// a vendor's work on an issue when the committee decides one is needed.

const EMPTY_FORM = {
  name: '', phone: '', email: '', area: '', specialty: '', call_price: '', rating: '', notes: '', is_active: true,
}

const ICON_BTN = 'p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]'
const hasPrice = (s) => s.call_price != null && s.call_price !== ''

function StatusChip({ active }) {
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-light)] text-[var(--success)]">פעיל</span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--text-secondary)]">לא פעיל</span>
  )
}

function ContactButton({ s }) {
  if (!s.phone) return null
  const wa = waLink(s.phone, `שלום ${s.name}, מדובר בוועד הבית.`)
  return (
    <a href={wa || telHref(s.phone)} target="_blank" rel="noopener noreferrer" className="inline-block" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="outline">{isWhatsappable(s.phone) ? '💬 וואטסאפ' : '📞 התקשר'}</Button>
    </a>
  )
}

export default function Supervisors() {
  const { data: supervisors, create, update, remove, isSaving, isLoading } = useCollection('supervisors')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supervisors
    return supervisors.filter((s) =>
      [s.name, s.specialty, s.area, s.phone].some((v) => (v || '').toLowerCase().includes(q)))
  }, [supervisors, search])

  const filtered = useMemo(() => {
    if (statusFilter === 'active') return searched.filter((s) => s.is_active !== false)
    if (statusFilter === 'inactive') return searched.filter((s) => s.is_active === false)
    return searched
  }, [searched, statusFilter])

  const kpi = useMemo(() => {
    const active = supervisors.filter((s) => s.is_active !== false)
    const priced = supervisors.filter(hasPrice).map((s) => Number(s.call_price)).filter((n) => !Number.isNaN(n))
    const rated = supervisors.map((s) => Number(s.rating)).filter((n) => n > 0)
    const areas = new Set(supervisors.map((s) => (s.area || '').trim()).filter(Boolean))
    return {
      total: supervisors.length,
      active: active.length,
      avgPrice: priced.length ? priced.reduce((a, n) => a + n, 0) / priced.length : null,
      minPrice: priced.length ? Math.min(...priced) : null,
      maxPrice: priced.length ? Math.max(...priced) : null,
      avgRating: rated.length ? rated.reduce((a, n) => a + n, 0) / rated.length : null,
      ratedCount: rated.length,
      areas: areas.size,
    }
  }, [supervisors])

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

  const header = (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">מפקחים</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          <span className="num-tabular">{supervisors.length}</span> מפקחים — מלווים ומפקחים על עבודת הספקים
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={openCreate}><Plus className="h-4 w-4" />מפקח חדש</Button>
      </div>
    </div>
  )

  if (isLoading) return (
    <div className="space-y-6">
      {header}
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
      </div>
    </div>
  )

  const rowActions = (s) => (
    <div className="flex gap-0.5">
      <button className={cn(ICON_BTN, 'hover:text-[var(--text-primary)]')} title="עריכה" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></button>
      <button className={cn(ICON_BTN, 'hover:text-[var(--danger)] hover:bg-[var(--danger-light)]')} title="מחיקה" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      {header}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="מפקחים ברשימה" icon={ShieldCheck} color="blue" value={String(kpi.total)}
          sub={`${kpi.areas} אזורי שירות`} />
        <StatCard label="מפקחים פעילים" icon={UserCheck} color="emerald" value={String(kpi.active)}
          progress={kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0} />
        <StatCard label="מחיר ממוצע לקריאה" icon={Coins} color="purple"
          value={kpi.avgPrice != null ? formatCurrency(Math.round(kpi.avgPrice)) : '—'}
          sub={kpi.minPrice != null ? `טווח ${formatCurrency(kpi.minPrice)} – ${formatCurrency(kpi.maxPrice)}` : 'לא הוזנו מחירים'} />
        <StatCard label="דירוג ממוצע" icon={Star} color="amber"
          value={kpi.avgRating != null ? kpi.avgRating.toFixed(1) : '—'}
          note={kpi.avgRating != null ? '/ 5' : null}
          sub={kpi.ratedCount ? `מבוסס על ${kpi.ratedCount} מפקחים מדורגים` : 'אין דירוגים עדיין'} />
      </div>

      {/* Filter card */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
        <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם, התמחות, אזור, טלפון..." />
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל', count: searched.length },
            { key: 'active', label: 'פעילים', count: searched.filter((s) => s.is_active !== false).length },
            { key: 'inactive', label: 'לא פעילים', count: searched.filter((s) => s.is_active === false).length },
          ]}
          activeTab={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="אין מפקחים"
          description={search ? 'לא נמצאו תוצאות' : 'הוסף מפקחים לרשימה — הם ילוו את עבודות הספקים'}
          actionLabel={!search ? 'הוסף מפקח' : undefined} onAction={!search ? openCreate : undefined} />
      ) : (
        <>
          {/* Desktop ledger */}
          <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>מפקח</th><th>תחום פיקוח</th><th>אזור</th><th>יצירת קשר</th><th className="!text-left">מחיר לקריאה</th><th>דירוג</th><th>סטטוס</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} onClick={() => openEdit(s)} className={cn('cursor-pointer', s.is_active === false && 'opacity-60')}>
                      <td className="min-w-[160px]">
                        <div className="flex items-center gap-2.5">
                          <span className="h-9 w-9 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[14px] font-bold shrink-0">{s.name?.charAt(0) || '?'}</span>
                          <div className="min-w-0">
                            <span className="block text-[13px] font-semibold truncate">{s.name}</span>
                            {s.notes && <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{s.notes}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="text-[12px]">{s.specialty || <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="whitespace-nowrap text-[12px]">{s.area ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-[var(--text-muted)]" />{s.area}</span> : <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="whitespace-nowrap text-[12px]">
                        {s.phone && <span className="flex items-center gap-1 num-tabular" dir="ltr"><Phone className="h-3 w-3 text-[var(--text-muted)]" />{s.phone}</span>}
                        {s.email && <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"><Mail className="h-3 w-3 text-[var(--text-muted)]" />{s.email}</span>}
                        {!s.phone && !s.email && <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="whitespace-nowrap !text-left"><span className="text-[14px] font-bold num-tabular">{hasPrice(s) ? formatCurrency(Number(s.call_price)) : '—'}</span></td>
                      <td className="whitespace-nowrap">
                        {s.rating > 0 ? <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[var(--warning)] num-tabular"><Star className="h-3.5 w-3.5 fill-current" />{s.rating}</span> : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td><StatusChip active={s.is_active !== false} /></td>
                      <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5"><ContactButton s={s} />{rowActions(s)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
              מציג <span className="num-tabular">{filtered.length}</span> מתוך <span className="num-tabular">{supervisors.length}</span> מפקחים
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((s) => (
              <div key={s.id} className={cn('p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-2', s.is_active === false && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-9 w-9 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[14px] font-bold shrink-0">{s.name?.charAt(0) || '?'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-semibold truncate">{s.name}</p>
                        {s.rating > 0 && <span className="text-[11px] text-[var(--warning)] flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />{s.rating}</span>}
                      </div>
                      {s.specialty && <p className="text-[11px] text-[var(--text-secondary)]">{s.specialty}</p>}
                    </div>
                  </div>
                  <StatusChip active={s.is_active !== false} />
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] space-y-1">
                  {s.area && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-[var(--text-muted)]" />{s.area}</p>}
                  {hasPrice(s) && <p className="font-semibold text-[var(--text-primary)]">מחיר לקריאה: <span className="num-tabular">{formatCurrency(Number(s.call_price))}</span></p>}
                  {s.phone && <p className="flex items-center gap-1.5 num-tabular"><Phone className="h-3 w-3 text-[var(--text-muted)]" />{s.phone}</p>}
                  {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-[var(--text-muted)]" />{s.email}</p>}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-light)]">
                  <ContactButton s={s} />
                  {rowActions(s)}
                </div>
              </div>
            ))}
          </div>
        </>
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
