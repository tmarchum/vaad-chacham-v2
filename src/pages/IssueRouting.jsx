import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import { ISSUE_CATEGORIES } from '@/lib/constants'
import { GitBranch, Plus, Pencil, Trash2, Power, Mail, UserCheck, Wrench } from 'lucide-react'

const CATEGORY_OPTIONS = ISSUE_CATEGORIES.map((c) => ({ value: c, label: c }))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY_FORM = {
  category: '',
  assigned_to: '',
  vendor_name: '',
  notify_email: '',
  auto_acknowledge: false,
  active: true,
}

// Automatic routing of resident reports (תקלות/פניות) by category.
// Each rule: category → responsible committee member (מלווה), preferred
// vendor, and an email that gets alerted on every new report. Enforced
// SERVER-side (a BEFORE INSERT trigger on issues + the analyze-issue
// function), so it applies no matter where the report comes from.
function IssueRouting() {
  const { selectedBuilding } = useBuildingContext()
  const scope = { building_id: selectedBuilding?.id }
  const { data: rules, create, update, remove, isSaving, isLoading } =
    useCollection('issueRoutingRules', scope)
  const { data: vendors } = useCollection('vendors')

  // Committee members = primary residents of board_member units — the same
  // source Issues.jsx uses for the accompanier (assigned_to stores their
  // unit_resident id, not a name).
  const [members, setMembers] = useState([])
  useEffect(() => {
    if (!selectedBuilding?.id) { setMembers([]); return }
    supabase.from('unit_residents')
      .select('id, first_name, last_name, units!inner(building_id, board_member)')
      .eq('units.board_member', true)
      .eq('units.building_id', selectedBuilding.id)
      .eq('is_primary', true)
      .not('archived', 'is', true)
      .then(({ data }) => setMembers(data || []))
  }, [selectedBuilding?.id])

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState('')

  const sorted = useMemo(
    () => [...(rules || [])].sort((a, b) => (a.category || '').localeCompare(b.category || '')),
    [rules],
  )
  const usedCategories = useMemo(
    () => new Set(sorted.filter((r) => r.id !== editingId).map((r) => r.category)),
    [sorted, editingId],
  )

  const memberOptions = useMemo(() => [
    { value: '', label: '— ללא —' },
    ...members.map((m) => ({
      value: m.id,
      label: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'חבר ועד',
    })),
  ], [members])
  const memberNameById = useMemo(() => {
    const map = {}
    members.forEach((m) => { map[m.id] = `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'חבר ועד' })
    return map
  }, [members])

  const vendorOptions = useMemo(() => [
    { value: '', label: '— ללא —' },
    ...(vendors || []).map((v) => ({ value: v.name, label: `${v.name}${v.category ? ` (${v.category})` : ''}` })).filter((o) => o.value),
  ], [vendors])

  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setError(''); setFormOpen(true) }
  const openEdit = (r) => {
    setForm({
      category: r.category || '',
      assigned_to: r.assigned_to || '',
      vendor_name: r.vendor_name || '',
      notify_email: r.notify_email || '',
      auto_acknowledge: !!r.auto_acknowledge,
      active: r.active !== false,
    })
    setEditingId(r.id); setError(''); setFormOpen(true)
  }
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    if (!form.category) return setError('יש לבחור קטגוריה')
    if (usedCategories.has(form.category)) return setError('כבר קיים כלל לקטגוריה הזו — ערכו אותו במקום')
    if (!form.assigned_to && !form.vendor_name && !form.notify_email) {
      return setError('כלל צריך לפחות פעולה אחת: מלווה, ספק או מייל לעדכון')
    }
    if (form.notify_email && !EMAIL_RE.test(form.notify_email.trim())) {
      return setError('כתובת המייל אינה תקינה')
    }
    const payload = {
      building_id: selectedBuilding?.id,
      category: form.category,
      assigned_to: form.assigned_to.trim() || null,
      vendor_name: form.vendor_name.trim() || null,
      notify_email: form.notify_email.trim() || null,
      auto_acknowledge: !!form.auto_acknowledge,
      active: !!form.active,
    }
    const res = editingId ? await update(editingId, payload) : await create(payload)
    if (res) setFormOpen(false)
  }

  if (!selectedBuilding) {
    return <EmptyState icon={GitBranch} title="בחר בניין" description="יש לבחור בניין כדי להגדיר ניתוב פניות" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={GitBranch}
        title="ניתוב פניות"
        subtitle="העברה אוטומטית של פניות ותקלות לפי קטגוריה — מלווה, ספק ועדכון במייל"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 ml-1" />כלל ניתוב חדש</Button>}
      />

      <Card>
        <CardContent className="p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
          כשדייר (או הוועד) פותח פנייה בקטגוריה שמוגדר לה כלל, המערכת מבצעת אוטומטית, כבר ברגע הפתיחה:
          משייכת <b>מלווה אחראי</b>, קובעת <b>ספק מועדף</b>, שולחת <b>עדכון במייל</b> לגורם המטפל —
          ואם מסומן, מעבירה את הפנייה ישירות לסטטוס «התקבלה» (דילוג על שלב האישור הידני).
          <br />הניתוב נאכף בצד השרת, כך שהוא חל על כל פנייה — מהפורטל, מהאפליקציה או מהמערכת.
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--text-muted)]">טוען…</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={GitBranch} title="אין כללי ניתוב עדיין" description="הוסיפו כלל ראשון — למשל: כל פניות המעלית יעברו אוטומטית לספק המעליות ולמלווה האחראי" />
      ) : (
        <div className="grid gap-2">
          {sorted.map((r) => (
            <Card key={r.id} className={r.active === false ? 'opacity-50' : ''}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.category}</span>
                    {r.auto_acknowledge && <Badge variant="info">אישור אוטומטי</Badge>}
                    {r.active === false && <Badge variant="outline">כבוי</Badge>}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-3 flex-wrap">
                    {r.assigned_to && <span className="inline-flex items-center gap-1"><UserCheck className="w-3 h-3" />{memberNameById[r.assigned_to] || 'חבר ועד'}</span>}
                    {r.vendor_name && <span className="inline-flex items-center gap-1"><Wrench className="w-3 h-3" />{r.vendor_name}</span>}
                    {r.notify_email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{r.notify_email}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  title={r.active === false ? 'הפעל כלל' : 'כבה כלל'}
                  onClick={() => update(r.id, { active: r.active === false })}
                >
                  <Power className={`w-4 h-4 ${r.active === false ? 'text-stone-400' : 'text-emerald-600'}`} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת כלל ניתוב' : 'כלל ניתוב חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <FormSelect
              label="קטגוריית הפנייה"
              value={form.category}
              onChange={setField('category')}
              options={CATEGORY_OPTIONS}
              placeholder="בחר קטגוריה"
            />
            <FormSelect
              label="מלווה אחראי (ישויך אוטומטית לפנייה)"
              value={form.assigned_to}
              onChange={setField('assigned_to')}
              options={memberOptions}
            />
            <FormSelect
              label="ספק מועדף (ייקבע אוטומטית אם לא נבחר ספק)"
              value={form.vendor_name}
              onChange={setField('vendor_name')}
              options={vendorOptions}
            />
            <FormField
              label="מייל לעדכון על כל פנייה חדשה בקטגוריה"
              type="email"
              value={form.notify_email}
              onChange={setField('notify_email')}
              placeholder="committee@example.com"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.auto_acknowledge}
                onChange={(e) => setForm((f) => ({ ...f, auto_acknowledge: e.target.checked }))}
                className="h-4 w-4 rounded border-stone-300"
              />
              אישור אוטומטי — הפנייה תעבור ישירות לסטטוס «התקבלה»
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-stone-300"
              />
              כלל פעיל
            </label>
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
        itemName={`כלל הניתוב של «${deleteTarget?.category}»`}
      />
    </div>
  )
}

export default IssueRouting
