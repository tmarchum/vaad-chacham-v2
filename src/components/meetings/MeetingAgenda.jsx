import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Check, Clock, ArrowLeftRight } from 'lucide-react'

// The agenda of one committee meeting: a list of items, each with what was
// decided and how the vote fell. It RECORDS a vote the committee held in the
// room — it is not online resident voting (see migration 029).

const STATUS = {
  pending:  { label: 'על סדר היום', icon: Clock,          cls: 'bg-[var(--surface-container)] text-[var(--text-secondary)]' },
  decided:  { label: 'הוחלט',        icon: Check,          cls: 'bg-[var(--success-light)] text-[var(--success)]' },
  deferred: { label: 'נדחה לישיבה הבאה', icon: ArrowLeftRight, cls: 'bg-[var(--warning-light,#fef3c7)] text-[var(--warning,#b45309)]' },
}

const num = (v) => Math.max(0, parseInt(v, 10) || 0)

export function MeetingAgenda({ meetingId, editable = true }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('meeting_agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('position')
    if (error) {
      // Table not there yet (migration 029 not applied): stay quiet.
      setMissing(true)
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }, [meetingId])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e?.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const position = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0
    const { data, error } = await supabase
      .from('meeting_agenda_items')
      .insert({ meeting_id: meetingId, title, position })
      .select()
      .single()
    if (error) { toast('לא נשמר: ' + error.message, 'error'); return }
    setItems((prev) => [...prev, data])
    setNewTitle('')
    setOpenId(data.id)
  }

  // Local edit; saved on blur / button so typing does not hit the DB per key.
  const patchLocal = (id, patch) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const save = async (item, patch = {}) => {
    const next = { ...item, ...patch }
    patchLocal(item.id, patch)
    const { error } = await supabase
      .from('meeting_agenda_items')
      .update({
        title: next.title,
        status: next.status,
        decision: next.decision,
        votes_for: num(next.votes_for),
        votes_against: num(next.votes_against),
        votes_abstain: num(next.votes_abstain),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    if (error) toast('לא נשמר: ' + error.message, 'error')
  }

  const remove = async (item) => {
    const { error } = await supabase.from('meeting_agenda_items').delete().eq('id', item.id)
    if (error) { toast('לא נמחק: ' + error.message, 'error'); return }
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  if (loading || missing) return null

  const decided = items.filter((i) => i.status === 'decided').length

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-light)] bg-[var(--surface-secondary)]/60">
        <p className="text-[12px] font-semibold">סדר יום</p>
        {items.length > 0 && (
          <span className="text-[11px] text-[var(--text-muted)] num-tabular">{decided}/{items.length} הוחלטו</span>
        )}
      </div>

      {items.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">עוד אין נושאים. הוסיפו את הנושא הראשון לדיון.</p>
      )}

      <ol className="divide-y divide-[var(--border-light)]">
        {items.map((it, idx) => {
          const st = STATUS[it.status] || STATUS.pending
          const Icon = st.icon
          const open = openId === it.id
          const total = num(it.votes_for) + num(it.votes_against) + num(it.votes_abstain)
          return (
            <li key={it.id} className="px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : it.id)}
                className="w-full flex items-start gap-2 text-start"
              >
                <span className="text-[12px] text-[var(--text-muted)] num-tabular pt-0.5">{idx + 1}.</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold">{it.title}</span>
                  {it.decision && !open && (
                    <span className="block text-[12px] text-[var(--text-secondary)] line-clamp-1">{it.decision}</span>
                  )}
                </span>
                <span className={cn('shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', st.cls)}>
                  <Icon className="h-3 w-3" />{st.label}
                </span>
              </button>
              {total > 0 && !open && (
                <p className="ms-5 mt-1 text-[11px] text-[var(--text-muted)] num-tabular">
                  בעד {num(it.votes_for)} · נגד {num(it.votes_against)} · נמנעו {num(it.votes_abstain)}
                </p>
              )}

              {open && editable && (
                <div className="ms-5 mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(STATUS).map(([key, s]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => save(it, { status: key })}
                        className={cn('px-2.5 py-1 rounded-full text-[12px] border',
                          it.status === key ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)]')}
                      >{s.label}</button>
                    ))}
                  </div>
                  <textarea
                    className="w-full rounded-[var(--radius-sm,8px)] border border-[var(--border)] bg-[var(--surface)] p-2 text-[13px]"
                    rows={2}
                    placeholder="מה הוחלט"
                    value={it.decision || ''}
                    onChange={(e) => patchLocal(it.id, { decision: e.target.value })}
                    onBlur={() => save(it)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {[['votes_for', 'בעד'], ['votes_against', 'נגד'], ['votes_abstain', 'נמנעו']].map(([f, label]) => (
                      <label key={f} className="text-[11px] text-[var(--text-muted)]">
                        {label}
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          className="mt-0.5 w-full rounded-[var(--radius-sm,8px)] border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[13px] text-[var(--text-primary)] num-tabular"
                          value={it[f] ?? 0}
                          onChange={(e) => patchLocal(it.id, { [f]: e.target.value })}
                          onBlur={() => save(it)}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(it)}>
                      <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />הסרת נושא
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {editable && (
        <form onSubmit={add} className="flex gap-2 p-2 border-t border-[var(--border-light)]">
          <input
            className="flex-1 min-w-0 rounded-[var(--radius-sm,8px)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px]"
            placeholder="נושא חדש לסדר היום"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!newTitle.trim()}><Plus className="h-4 w-4" />הוספה</Button>
        </form>
      )}
    </div>
  )
}
