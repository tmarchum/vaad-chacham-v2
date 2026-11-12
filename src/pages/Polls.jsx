import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField'
import { EmptyState } from '@/components/common/EmptyState'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { PollResultBars } from '@/components/common/PollResultBars'
import {
  DEFAULT_OPTIONS, SHOW_RESULTS_LABELS, POLL_DISCLAIMER, isPollClosed, loadPollResults,
} from '@/lib/polls'
import { Vote, Plus, Lock, Info, Trash2, X } from 'lucide-react'

// Committee side of resident polls: create a question, watch the tally, close
// it. Residents answer from the portal, one vote per apartment.

const EMPTY = {
  title: '', description: '', options: [...DEFAULT_OPTIONS],
  owners_only: true, show_results: 'after_vote', closes_at: '',
}

export default function Polls() {
  const { isCommittee, profile } = useAuth()
  const { selectedBuilding } = useBuildingContext()
  const [ready, setReady] = useState(null)
  const [polls, setPolls] = useState([])
  const [results, setResults] = useState({})
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!selectedBuilding?.id) { setPolls([]); setReady(true); return }
    const { data, error } = await supabase.from('polls').select('*')
      .eq('building_id', selectedBuilding.id).order('created_at', { ascending: false })
    if (error) { setReady(false); return }
    setPolls(data || [])
    setResults(await loadPollResults(data || []))
    setReady(true)
  }, [selectedBuilding?.id])

  useEffect(() => { load() }, [load])

  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }))

  const create = async () => {
    const options = form.options.map((o) => o.trim()).filter(Boolean)
    if (!form.title.trim() || options.length < 2) { toastError('נדרשים נושא ולפחות שתי אפשרויות'); return }
    setSaving(true)
    const { error } = await supabase.from('polls').insert({
      building_id: selectedBuilding.id, title: form.title.trim(), description: form.description.trim(),
      options, owners_only: !!form.owners_only, show_results: form.show_results,
      closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
      created_by: profile?.id || null,
    })
    setSaving(false)
    if (error) { toastError('יצירת ההצבעה נכשלה'); return }
    toast('ההצבעה נפתחה לדיירים')
    setFormOpen(false)
    setForm(EMPTY)
    load()
  }

  const closePoll = async (p) => {
    if (!window.confirm(`לסגור את ההצבעה "${p.title}"? לא יהיה אפשר להצביע יותר.`)) return
    const { error } = await supabase.from('polls').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) toastError('סגירת ההצבעה נכשלה'); else { toast('ההצבעה נסגרה'); load() }
  }

  const removePoll = async (p) => {
    if (!window.confirm(`למחוק את ההצבעה "${p.title}" ואת כל הקולות בה? לא ניתן לשחזר.`)) return
    const { error } = await supabase.from('polls').delete().eq('id', p.id)
    if (error) toastError('המחיקה נכשלה'); else { toast('ההצבעה נמחקה'); load() }
  }

  if (!isCommittee) {
    return <EmptyState icon={Vote} title="אזור הוועד" description="ניהול הצבעות זמין לחברי ועד בלבד" />
  }
  if (ready === false) {
    return <EmptyState icon={Vote} title="ההצבעות עוד לא הופעלו" description="יש להריץ את מיגרציה 031 (polls) במסד הנתונים." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הצבעות דיירים</h1>
          <p className="text-[13px] text-[var(--text-secondary)]">שאלה לדיירים, קול אחד לכל דירה{selectedBuilding ? ` · ${selectedBuilding.name}` : ''}</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setFormOpen(true) }} disabled={!selectedBuilding}><Plus className="h-4 w-4" />הצבעה חדשה</Button>
      </div>

      <p className="flex items-start gap-2 p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[12px] text-[var(--text-secondary)]">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-[var(--primary)]" />{POLL_DISCLAIMER}
      </p>

      {ready === null ? null : polls.length === 0 ? (
        <EmptyState icon={Vote} title="אין הצבעות" description="פתחו הצבעה כדי לשאול את הדיירים" actionLabel="הצבעה חדשה" onAction={() => setFormOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {polls.map((p) => {
            const closed = isPollClosed(p)
            return (
              <div key={p.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold">{p.title}</p>
                    {p.description && <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{p.description}</p>}
                  </div>
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    closed ? 'bg-[var(--surface-container)] text-[var(--text-secondary)]' : 'bg-[var(--success-light)] text-[var(--success)]')}>
                    {closed ? 'סגורה' : 'פתוחה'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {p.owners_only ? 'בעלי דירות בלבד' : 'כל הדיירים'} · תוצאות לדיירים: {SHOW_RESULTS_LABELS[p.show_results]}
                  {p.closes_at ? ` · נסגרת ב-${new Date(p.closes_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                </p>
                <PollResultBars poll={p} result={results[p.id]} />
                <div className="flex gap-2 pt-1">
                  {!closed && <Button variant="outline" size="sm" onClick={() => closePoll(p)}><Lock className="h-4 w-4" />סגור הצבעה</Button>}
                  <Button variant="ghost" size="sm" onClick={() => removePoll(p)}><Trash2 className="h-4 w-4" />מחיקה</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>הצבעה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="נושא ההצבעה" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <FormTextarea label="פירוט (לא חובה)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-[var(--text-secondary)]">אפשרויות</p>
              {form.options.map((o, i) => (
                <div key={i} className="flex gap-1.5">
                  <input value={o} onChange={(e) => setOption(i, e.target.value)}
                    className="h-[36px] flex-1 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none" />
                  {form.options.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))} aria-label="הסרת אפשרות">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {form.options.length < 10 && (
                <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, options: [...f.options, ''] }))}><Plus className="h-4 w-4" />אפשרות</Button>
              )}
            </div>
            <FormSelect label="מי מצביע" value={form.owners_only ? 'owners' : 'all'}
              onChange={(e) => setForm({ ...form, owners_only: e.target.value === 'owners' })}
              options={[{ value: 'owners', label: 'בעלי דירות בלבד' }, { value: 'all', label: 'כל הדיירים (כולל שוכרים)' }]} />
            <FormSelect label="מתי הדיירים רואים תוצאות" value={form.show_results}
              onChange={(e) => setForm({ ...form, show_results: e.target.value })}
              options={Object.entries(SHOW_RESULTS_LABELS).map(([value, label]) => ({ value, label }))} />
            <FormField label="סגירה אוטומטית (לא חובה)" type="datetime-local" value={form.closes_at}
              onChange={(e) => setForm({ ...form, closes_at: e.target.value })} />
            <div className="flex gap-2 pt-1">
              <Button onClick={create} disabled={saving}>{saving ? 'פותח...' : 'פתיחת הצבעה'}</Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
