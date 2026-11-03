import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { SearchBar } from '@/components/common/SearchBar'
import { StatCard } from '@/components/common/StatCard'
import { FormField, FormSelect } from '@/components/common/FormField'
import { cn } from '@/lib/utils'
import { Tags, Plus, Pencil, Trash2, Wand2, Power, CheckCircle2, PowerOff, LayoutGrid, Info, X } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  findExpenseCategory,
} from '@/lib/categories'
import store from '@/data/supabaseStore'
import { expensesToRetag } from '@/lib/vendorRules'

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))

const EMPTY_FORM = { match_text: '', vendor: '', category: '', priority: 10, active: true }

const ICON_BTN = 'p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] disabled:opacity-40'

function StatusChip({ active }) {
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-light)] text-[var(--success)]">פעיל</span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--text-secondary)]">כבוי</span>
  )
}

function CategoryChip({ category }) {
  const cat = findExpenseCategory(category)
  if (!cat) return <span className="text-[var(--text-muted)]">—</span>
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-semibold whitespace-nowrap">
      {cat.icon} {cat.label}
    </span>
  )
}

// Auto-tagging of bank-imported expenses. When an expense description contains
// `match_text`, the import sets its vendor + category automatically (longest
// match wins). Managed here; applied by the Drive-import pipeline.
function VendorRules() {
  const { selectedBuilding } = useBuildingContext()
  const scope = { building_id: selectedBuilding?.id }
  const { data: rules, create, update, remove, isSaving, isLoading } =
    useCollection('vendorRules', scope)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Apply one rule to EXISTING bank-sourced expenses, right now, from the
  // browser. Shared matching logic lives in lib/vendorRules.js; the write is a
  // single batched UPDATE (silent — the notice banner is the feedback, not a
  // toast per row).
  const applyRuleToExisting = async (rule) => {
    if (!selectedBuilding?.id) return 0
    const expenses = await store.expenses.list({ building_id: selectedBuilding.id, source: 'bank' })
    // Include the rule itself — right after save() the hook state may not
    // contain it yet, and longest-match-wins must see it to let it win.
    const matches = expensesToRetag(rule, expenses, [rule, ...(rules || [])])
    if (matches.length === 0) return 0
    await store.expenses.bulkUpdate(
      matches.map((e) => e.id),
      { vendor: rule.vendor, category: rule.category },
      { silent: true },
    )
    return matches.length
  }

  const reapply = async (rule) => {
    setApplying(true)
    try {
      const n = await applyRuleToExisting(rule)
      setNotice(n > 0 ? `הכלל «${rule.vendor}» הוחל על ${n} תנועות קיימות` : `אין תנועות קיימות שתואמות את «${rule.vendor}»`)
    } finally {
      setApplying(false)
    }
  }

  const sorted = useMemo(
    () => [...(rules || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.vendor || '').localeCompare(b.vendor || '')),
    [rules],
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((r) =>
      [r.vendor, r.match_text, findExpenseCategory(r.category)?.label || r.category]
        .some((v) => (v || '').toLowerCase().includes(q)))
  }, [sorted, search])

  const visible = useMemo(() => {
    if (statusFilter === 'active') return searched.filter((r) => r.active !== false)
    if (statusFilter === 'inactive') return searched.filter((r) => r.active === false)
    return searched
  }, [searched, statusFilter])

  const kpi = useMemo(() => {
    const active = sorted.filter((r) => r.active !== false)
    return {
      total: sorted.length,
      active: active.length,
      inactive: sorted.length - active.length,
      vendors: new Set(active.map((r) => (r.vendor || '').trim()).filter(Boolean)).size,
      categories: new Set(active.map((r) => r.category).filter(Boolean)).size,
    }
  }, [sorted])

  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setError(''); setFormOpen(true) }
  const openEdit = (r) => {
    setForm({ match_text: r.match_text || '', vendor: r.vendor || '', category: r.category || '', priority: r.priority ?? 10, active: r.active !== false })
    setEditingId(r.id); setError(''); setFormOpen(true)
  }
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (!form.match_text.trim()) return setError('צריך טקסט לזיהוי (מופיע בתיאור התנועה)')
    if (!form.vendor.trim()) return setError('צריך שם ספק')
    if (!form.category) return setError('צריך לבחור קטגוריה')
    const payload = {
      building_id: selectedBuilding?.id,
      match_text: form.match_text.trim(),
      vendor: form.vendor.trim(),
      category: form.category,
      priority: Number(form.priority) || 0,
      active: form.active !== false && form.active !== 'false',
    }
    if (editingId) await update(editingId, payload)
    else await create(payload)
    setFormOpen(false)
    // Immediately apply the saved rule to existing bank transactions, so the
    // user doesn't have to wait for the next monthly import.
    const n = await applyRuleToExisting(payload)
    setNotice(
      n > 0
        ? `נשמר. הכלל «${payload.vendor}» הוחל על ${n} תנועות קיימות (ויחול אוטומטית על ייבואים הבאים)`
        : `נשמר. אין תנועות קיימות תואמות — הכלל יחול אוטומטית על ייבואים הבאים`,
    )
  }

  if (!selectedBuilding) {
    return <EmptyState icon={Tags} title="בחר בניין" description="יש לבחור בניין כדי לנהל כללי ספקים" />
  }

  const rowActions = (r) => (
    <div className="flex gap-0.5">
      <button className={cn(ICON_BTN, 'hover:text-[var(--primary)]')} title="החל על תנועות קיימות" disabled={applying} onClick={() => reapply(r)}><Wand2 className="h-4 w-4" /></button>
      <button
        className={cn(ICON_BTN, r.active === false ? 'hover:text-[var(--success)]' : 'text-[var(--success)] hover:text-[var(--text-primary)]')}
        title={r.active === false ? 'הפעל כלל' : 'כבה כלל'}
        onClick={() => update(r.id, { active: r.active === false })}
      >
        <Power className="h-4 w-4" />
      </button>
      <button className={cn(ICON_BTN, 'hover:text-[var(--text-primary)]')} title="עריכה" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
      <button className={cn(ICON_BTN, 'hover:text-[var(--danger)] hover:bg-[var(--danger-light)]')} title="מחיקה" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">כללי ספקים</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">שיוך אוטומטי של הוצאות מהבנק לספק וקטגוריה לפי מילה בתיאור • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openNew}><Plus className="h-4 w-4" />כלל חדש</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="כללים מוגדרים" icon={Tags} color="blue" value={String(kpi.total)} sub="ספק ← קטגוריה לפי טקסט בתיאור" />
        <StatCard label="כללים פעילים" icon={CheckCircle2} color="emerald" value={String(kpi.active)}
          progress={kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0} />
        <StatCard label="ספקים וקטגוריות מכוסים" icon={LayoutGrid} color="purple" value={String(kpi.vendors)}
          note="ספקים" sub={`${kpi.categories} קטגוריות הוצאה בשימוש`} />
        <StatCard label="כללים כבויים" icon={PowerOff} color={kpi.inactive ? 'amber' : 'slate'} value={String(kpi.inactive)}
          sub={kpi.inactive ? 'לא מוחלים על ייבואים' : 'כל הכללים פעילים'}
          footer={kpi.inactive ? <button onClick={() => setStatusFilter('inactive')} className="text-[var(--primary)] font-semibold hover:underline">הצג כבויים ←</button> : null} />
      </div>

      {/* How it works */}
      <div className="flex items-start gap-3 p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Info className="h-4 w-4" /></span>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          כשתנועת הוצאה מהבנק מכילה את <b className="text-[var(--text-primary)]">הטקסט לזיהוי</b>, המערכת משייכת לה אוטומטית את הספק והקטגוריה —
          בכל ייבוא עתידי. למשל: טקסט <span dir="rtl" className="font-mono bg-[var(--surface-secondary)] px-1 rounded">קונה</span> → ספק «קונה», קטגוריה «אחזקת מעלית».
          אם כמה כללים מתאימים, הארוך ביותר מנצח; בתיקו — העדיפות הגבוהה.
          <br />שמירת כלל מחילה אותו <b className="text-[var(--text-primary)]">מיד גם על התנועות הקיימות</b> (ללא דריסה של שיוך ידני).
        </p>
      </div>

      {notice && (
        <div className="rounded-[var(--radius)] border border-[var(--success)]/30 bg-[var(--success-light)] text-[var(--success)] px-4 py-2.5 text-[13px] font-medium flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="p-1 rounded hover:bg-[var(--surface)]/50" title="סגור"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Filter card */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
        <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי ספק, טקסט לזיהוי או קטגוריה..." />
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל', count: searched.length },
            { key: 'active', label: 'פעילים', count: searched.filter((r) => r.active !== false).length },
            { key: 'inactive', label: 'כבויים', count: searched.filter((r) => r.active === false).length },
          ]}
          activeTab={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Tags} title="אין כללים עדיין" description="הוסף כלל ראשון כדי לשייך הוצאות בנק אוטומטית" actionLabel="כלל חדש" onAction={openNew} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Tags} title="אין כללים תואמים" description="נסה חיפוש או סינון אחר" />
      ) : (
        <>
          {/* Desktop ledger */}
          <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>ספק</th><th>תיאור מכיל</th><th>קטגוריה</th><th>עדיפות</th><th>סטטוס</th><th></th></tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className={r.active === false ? 'opacity-60' : ''}>
                      <td className="min-w-[160px]">
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-8 rounded-[var(--radius)] bg-[var(--surface-secondary)] flex items-center justify-center text-[15px] shrink-0">{findExpenseCategory(r.category)?.icon || '📋'}</span>
                          <span className="text-[13px] font-semibold">{r.vendor}</span>
                        </div>
                      </td>
                      <td><span dir="rtl" className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)]">{r.match_text}</span></td>
                      <td><CategoryChip category={r.category} /></td>
                      <td className="num-tabular text-[12px] font-semibold">{r.priority ?? 0}</td>
                      <td><StatusChip active={r.active !== false} /></td>
                      <td className="whitespace-nowrap">{rowActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
              מציג <span className="num-tabular">{visible.length}</span> מתוך <span className="num-tabular">{sorted.length}</span> כללים • ממוין לפי עדיפות
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {visible.map((r) => (
              <div key={r.id} className={cn('p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-2', r.active === false && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-8 w-8 rounded-[var(--radius)] bg-[var(--surface-secondary)] flex items-center justify-center text-[15px] shrink-0">{findExpenseCategory(r.category)?.icon || '📋'}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">{r.vendor}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">תיאור מכיל: <span dir="rtl" className="font-mono">{r.match_text}</span></p>
                    </div>
                  </div>
                  <StatusChip active={r.active !== false} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-light)]">
                  <CategoryChip category={r.category} />
                  {rowActions(r)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת כלל' : 'כלל ספק חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <FormField
              label="טקסט לזיהוי (מילה שמופיעה בתיאור התנועה)"
              value={form.match_text}
              onChange={setField('match_text')}
              placeholder="לדוגמה: קונה"
            />
            <FormField
              label="שם הספק"
              value={form.vendor}
              onChange={setField('vendor')}
              placeholder="לדוגמה: קונה בע״מ"
            />
            <FormSelect
              label="קטגוריה"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
              placeholder="בחר קטגוריה"
            />
            <FormField
              label="עדיפות (גבוה יותר = מנצח בתיקו)"
              type="number"
              value={form.priority}
              onChange={setField('priority')}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.active !== false && form.active !== 'false'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--outline-variant)] accent-[var(--primary)]"
              />
              כלל פעיל (כלל כבוי לא מוחל על ייבואים)
            </label>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'שומר…' : 'שמירה'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={async () => { await remove(deleteTarget.id); setDeleteTarget(null) }}
        itemName={`הכלל של «${deleteTarget?.vendor}»`}
      />
    </div>
  )
}

export default VendorRules
