import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabGroup } from '@/components/ui/tabs'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { FormField, FormSelect } from '@/components/common/FormField'
import { ISSUE_CATEGORIES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { GitBranch, Plus, Pencil, Trash2, Power, Mail, UserCheck, Wrench, Info, Zap, LayoutGrid } from 'lucide-react'

const CATEGORY_OPTIONS = ISSUE_CATEGORIES.map((c) => ({ value: c, label: c }))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY_FORM = {
  category: '',
  assigned_to: '',
  vendor_name: '',
  notify_email: '',
  auto_acknowledge: false,
  send_to_vendor: false,
  active: true,
}

const ICON_BTN = 'p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]'
const Dash = () => <span className="text-[var(--text-muted)]">—</span>

function StatusChip({ active }) {
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-light)] text-[var(--success)]">פעיל</span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--text-secondary)]">כבוי</span>
  )
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
  const [statusFilter, setStatusFilter] = useState('all')

  const sorted = useMemo(
    () => [...(rules || [])].sort((a, b) => (a.category || '').localeCompare(b.category || '')),
    [rules],
  )
  const usedCategories = useMemo(
    () => new Set(sorted.filter((r) => r.id !== editingId).map((r) => r.category)),
    [sorted, editingId],
  )

  const visible = useMemo(() => {
    if (statusFilter === 'active') return sorted.filter((r) => r.active !== false)
    if (statusFilter === 'inactive') return sorted.filter((r) => r.active === false)
    return sorted
  }, [sorted, statusFilter])

  const kpi = useMemo(() => {
    const active = sorted.filter((r) => r.active !== false)
    return {
      total: sorted.length,
      active: active.length,
      covered: new Set(active.map((r) => r.category).filter(Boolean)).size,
      withVendor: active.filter((r) => r.vendor_name).length,
      withMember: active.filter((r) => r.assigned_to).length,
      autoAck: active.filter((r) => r.auto_acknowledge).length,
      withEmail: active.filter((r) => r.notify_email).length,
    }
  }, [sorted])

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
      send_to_vendor: !!r.send_to_vendor,
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
      send_to_vendor: !!form.send_to_vendor && !!form.vendor_name,
      active: !!form.active,
    }
    const res = editingId ? await update(editingId, payload) : await create(payload)
    if (res) setFormOpen(false)
  }

  if (!selectedBuilding) {
    return <EmptyState icon={GitBranch} title="בחר בניין" description="יש לבחור בניין כדי להגדיר ניתוב פניות" />
  }

  const rowActions = (r) => (
    <div className="flex gap-0.5">
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

  const autoAckChip = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--primary-dark)] whitespace-nowrap"><Zap className="h-3 w-3" />אישור אוטומטי</span>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">ניתוב פניות</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">העברה אוטומטית של פניות ותקלות לפי קטגוריה — מלווה, ספק ועדכון במייל • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openNew}><Plus className="h-4 w-4" />כלל ניתוב חדש</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="קטגוריות מנותבות" icon={LayoutGrid} color="blue" value={String(kpi.covered)}
          note={`מתוך ${CATEGORY_OPTIONS.length}`}
          progress={CATEGORY_OPTIONS.length ? Math.round((kpi.covered / CATEGORY_OPTIONS.length) * 100) : 0} />
        <StatCard label="כללים פעילים" icon={GitBranch} color="emerald" value={String(kpi.active)}
          sub={kpi.total - kpi.active ? `${kpi.total - kpi.active} כבויים` : 'כל הכללים פעילים'} />
        <StatCard label="עם ספק מועדף" icon={Wrench} color="purple" value={String(kpi.withVendor)}
          sub={`${kpi.withMember} עם מלווה • ${kpi.withEmail} עם עדכון מייל`} />
        <StatCard label="אישור אוטומטי" icon={Zap} color="amber" value={String(kpi.autoAck)}
          sub="פניות שעוברות ישירות ל«התקבלה»" />
      </div>

      {/* How it works */}
      <div className="flex items-start gap-3 p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Info className="h-4 w-4" /></span>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          כשדייר (או הוועד) פותח פנייה בקטגוריה שמוגדר לה כלל, המערכת מבצעת אוטומטית, כבר ברגע הפתיחה:
          משייכת <b className="text-[var(--text-primary)]">מלווה אחראי</b>, קובעת <b className="text-[var(--text-primary)]">ספק מועדף</b>, שולחת <b className="text-[var(--text-primary)]">עדכון במייל</b> לגורם המטפל —
          ואם מסומן, מעבירה את הפנייה ישירות לסטטוס «התקבלה» (דילוג על שלב האישור הידני).
          <br />הניתוב נאכף בצד השרת, כך שהוא חל על כל פנייה — מהפורטל, מהאפליקציה או מהמערכת.
        </p>
      </div>

      {/* Filter card */}
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <TabGroup
          tabs={[
            { key: 'all', label: 'הכל', count: sorted.length },
            { key: 'active', label: 'פעילים', count: kpi.active },
            { key: 'inactive', label: 'כבויים', count: kpi.total - kpi.active },
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
        <EmptyState icon={GitBranch} title="אין כללי ניתוב עדיין" description="הוסיפו כלל ראשון — למשל: כל פניות המעלית יעברו אוטומטית לספק המעליות ולמלווה האחראי" actionLabel="כלל ניתוב חדש" onAction={openNew} />
      ) : visible.length === 0 ? (
        <EmptyState icon={GitBranch} title="אין כללים בסטטוס זה" description="בחר סינון אחר" />
      ) : (
        <>
          {/* Desktop ledger */}
          <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>קטגוריה</th><th>מלווה אחראי</th><th>ספק מועדף</th><th>עדכון במייל</th><th>אישור</th><th>סטטוס</th><th></th></tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className={r.active === false ? 'opacity-60' : ''}>
                      <td className="min-w-[140px]">
                        <div className="flex items-center gap-2.5">
                          <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><GitBranch className="h-4 w-4" /></span>
                          <span className="text-[13px] font-semibold">{r.category}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[12px]">
                        {r.assigned_to ? <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-[var(--text-muted)]" />{memberNameById[r.assigned_to] || 'חבר ועד'}</span> : <Dash />}
                      </td>
                      <td className="whitespace-nowrap text-[12px]">
                        {r.vendor_name ? <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5 text-[var(--text-muted)]" />{r.vendor_name}</span> : <Dash />}
                      </td>
                      <td className="text-[12px]">
                        {r.notify_email ? <span className="inline-flex items-center gap-1" dir="ltr"><Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />{r.notify_email}</span> : <Dash />}
                      </td>
                      <td>{r.auto_acknowledge ? autoAckChip : <span className="text-[11px] text-[var(--text-muted)]">ידני</span>}</td>
                      <td><StatusChip active={r.active !== false} /></td>
                      <td className="whitespace-nowrap">{rowActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
              מציג <span className="num-tabular">{visible.length}</span> מתוך <span className="num-tabular">{sorted.length}</span> כללי ניתוב
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {visible.map((r) => (
              <div key={r.id} className={cn('p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-2', r.active === false && 'opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><GitBranch className="h-4 w-4" /></span>
                    <span className="text-[13px] font-semibold truncate">{r.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.auto_acknowledge && autoAckChip}
                    <StatusChip active={r.active !== false} />
                  </div>
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] flex items-center gap-3 flex-wrap">
                  {r.assigned_to && <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" />{memberNameById[r.assigned_to] || 'חבר ועד'}</span>}
                  {r.vendor_name && <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" />{r.vendor_name}</span>}
                  {r.notify_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.notify_email}</span>}
                </div>
                <div className="flex justify-end pt-2 border-t border-[var(--border-light)]">{rowActions(r)}</div>
              </div>
            ))}
          </div>
        </>
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
                className="h-4 w-4 rounded border-[var(--outline-variant)] accent-[var(--primary)]"
              />
              אישור אוטומטי — הפנייה תעבור ישירות לסטטוס «התקבלה»
            </label>
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${form.vendor_name ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] opacity-60'}`}>
              <input
                type="checkbox"
                disabled={!form.vendor_name}
                checked={!!form.send_to_vendor && !!form.vendor_name}
                onChange={(e) => setForm((f) => ({ ...f, send_to_vendor: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--outline-variant)] accent-[var(--primary)]"
              />
              ספק קבוע — כשהוועד מאשר, התקלה נשלחת אליו אוטומטית בערוץ הקשר שלו — מייל, וואטסאפ או טלפון (ללא ניקוב)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--outline-variant)] accent-[var(--primary)]"
              />
              כלל פעיל
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
        itemName={`כלל הניתוב של «${deleteTarget?.category}»`}
      />
    </div>
  )
}

export default IssueRouting
