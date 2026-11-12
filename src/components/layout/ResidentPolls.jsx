import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { POLL_DISCLAIMER, isPollClosed, loadPollResults, pollErrorMessage } from '@/lib/polls'
import { PollResultBars } from '@/components/common/PollResultBars'
import { Vote, Check } from 'lucide-react'

// Resident side of polls: open questions first, one tap to answer, and the
// answer can be changed while the poll is open. Renders nothing at all when
// the building has no polls (or the polls migration is not applied yet), so
// the portal does not grow an empty section.
export default function ResidentPolls({ buildingId }) {
  const [polls, setPolls] = useState([])
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!buildingId) return
    const { data, error: e } = await supabase.from('polls').select('*')
      .eq('building_id', buildingId).order('created_at', { ascending: false }).limit(10)
    if (e) { setPolls([]); return }
    // Open polls always; closed ones only for 30 days, as a record of the result.
    const recent = (data || []).filter((p) => !isPollClosed(p)
      || new Date(p.closes_at || p.updated_at || p.created_at) > new Date(Date.now() - 30 * 864e5))
    setPolls(recent)
    setResults(await loadPollResults(recent))
  }, [buildingId])

  useEffect(() => { load() }, [load])

  const vote = async (poll, option) => {
    setBusy(poll.id)
    setError('')
    const { error: e } = await supabase.rpc('cast_poll_vote', { p_poll: poll.id, p_option: option })
    setBusy(null)
    if (e) { setError(pollErrorMessage(e)); return }
    const { data } = await supabase.rpc('poll_results', { p_poll: poll.id })
    setResults((r) => ({ ...r, [poll.id]: data }))
  }

  if (!polls.length) return null

  return (
    <div id="portal-polls" className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Vote className="h-5 w-5 text-[var(--primary)]" />
        <h2 className="text-[17px] font-bold">הצבעות בבניין</h2>
      </div>
      {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
      {polls.map((p) => {
        const r = results[p.id]
        const closed = isPollClosed(p) || r?.closed
        return (
          <div key={p.id} className="rounded-[var(--radius)] border border-[var(--border-light)] p-3 space-y-3">
            <div>
              <p className="text-[15px] font-bold">{p.title}</p>
              {p.description && <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{p.description}</p>}
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                {closed ? 'ההצבעה נסגרה' : p.closes_at ? `פתוחה עד ${new Date(p.closes_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}` : 'פתוחה'}
                {p.owners_only ? ' · לבעלי דירות' : ''}
              </p>
            </div>
            {!closed && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(p.options || []).map((label, i) => {
                  const mine = r?.my_option === i
                  return (
                    <button key={i} type="button" disabled={busy === p.id} onClick={() => vote(p, i)}
                      className={`flex items-center justify-center gap-1.5 rounded-[var(--radius)] border py-2.5 text-[14px] font-semibold transition-colors ${
                        mine ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--outline-variant)] hover:bg-[var(--surface-secondary)]'}`}>
                      {mine && <Check className="h-4 w-4" />}{label}
                    </button>
                  )
                })}
              </div>
            )}
            {r?.my_option != null && !closed && <p className="text-[11px] text-[var(--text-muted)]">אפשר לשנות את הבחירה כל עוד ההצבעה פתוחה</p>}
            {(r?.visible || closed) && <PollResultBars poll={p} result={r} compact />}
          </div>
        )
      })}
      <p className="text-[11px] text-[var(--text-muted)] leading-5">{POLL_DISCLAIMER}</p>
    </div>
  )
}
