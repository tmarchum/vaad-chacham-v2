import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { Tags, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  findExpenseCategory,
  CATEGORY_BG_COLORS,
} from '@/lib/categories'

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))

const EMPTY_FORM = { match_text: '', vendor: '', category: '', priority: 10, active: true }

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

  const sorted = useMemo(
    () => [...(rules || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.vendor || '').localeCompare(b.vendor || '')),
    [rules],
  )

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
  }

  if (!selectedBuilding) {
    return <EmptyState icon={Tags} title="בחר בניין" description="יש לבחור בניין כדי לנהל כללי ספקים" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Tags}
        title="כללי ספקים"
        subtitle="שיוך אוטומטי של הוצאות מהבנק לספק וקטגוריה לפי מילה בתיאור"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 ml-1" />כלל חדש</Button>}
      />

      <Card>
        <CardContent className="p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
          כשתנועת הוצאה מהבנק מכילה את <b>הטקסט לזיהוי</b>, המערכת משייכת לה אוטומטית את הספק והקטגוריה —
          בכל ייבוא עתידי. למשל: טקסט <span dir="rtl" className="font-mono bg-[var(--bg-subtle)] px-1 rounded">קונה</span> → ספק «קונה», קטגוריה «אחזקת מעלית».
          אם כמה כללים מתאימים, הארוך ביותר מנצח; בתיקו — העדיפות הגבוהה.
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--text-muted)]">טוען…</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Tags} title="אין כללים עדיין" description="הוסף כלל ראשון כדי לשייך הוצאות בנק אוטומטית" />
      ) : (
        <div className="grid gap-2">
          {sorted.map((r) => {
            const cat = findExpenseCategory(r.category)
            const bg = cat ? (CATEGORY_BG_COLORS[cat.color] || '') : ''
            return (
              <Card key={r.id} className={r.active === false ? 'opacity-50' : ''}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="text-xl shrink-0">{cat?.icon || '📋'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.vendor}</span>
                      {cat && (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${bg || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                          {cat.label}
                        </span>
                      )}
                      {r.active === false && <Badge variant="outline">כבוי</Badge>}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      תיאור מכיל: <span dir="rtl" className="font-mono">{r.match_text}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
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
            {error && <p className="text-sm text-red-500">{error}</p>}
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
