import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SectionCard } from '@/components/common/SectionCard'
import { cn } from '@/lib/utils'
import { MessagesSquare } from 'lucide-react'

// Live log of every vendor conversation: one row per vendor, newest activity
// first. A row is flagged when the vendor wrote last (waiting for us).
const fmtTime = (d) => {
  const t = new Date(d)
  const sameDay = t.toDateString() === new Date().toDateString()
  return sameDay
    ? t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : t.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

export function VendorInbox({ vendors, onOpen }) {
  const [rows, setRows] = useState([])
  const [live, setLive] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    const { data } = await supabase.from('notification_log')
      .select('vendor_id, created_at, channel, body, subject, status')
      .not('vendor_id', 'is', null).in('channel', ['whatsapp', 'whatsapp_in'])
      .order('created_at', { ascending: false }).limit(2000)
    setRows(data || [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('vendor-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_log' }, (p) => {
        if (p.new?.vendor_id || p.old?.vendor_id) load()
      })
      .subscribe((st) => setLive(st === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const byId = useMemo(() => Object.fromEntries((vendors || []).map((v) => [v.id, v])), [vendors])
  const threads = useMemo(() => {
    const map = new Map()
    for (const r of rows) { // rows are newest-first
      const t = map.get(r.vendor_id) || { vendorId: r.vendor_id, last: r, count: 0, inbound: 0 }
      t.count++
      if (r.channel === 'whatsapp_in') t.inbound++
      map.set(r.vendor_id, t)
    }
    return [...map.values()].map((t) => ({ ...t, waiting: t.last.channel === 'whatsapp_in' }))
  }, [rows])
  const shown = threads.filter((t) => (filter === 'waiting' ? t.waiting : filter === 'replied' ? t.inbound > 0 : true))
  const waitingCount = threads.filter((t) => t.waiting).length

  return (
    <SectionCard icon={MessagesSquare} title="שיחות עם ספקים"
      subtitle="תיעוד מלא של כל הודעה שיצאה לספק וכל תשובה שלו, מתעדכן בזמן אמת"
      actions={<span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <span className={cn('h-2 w-2 rounded-full', live ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--text-muted)]')} />
        {live ? 'חי' : 'מתחבר...'}
      </span>}>
      <div className="p-4 space-y-3">
        <div className="flex gap-1.5 text-[12px]">
          {[['all', `הכל (${threads.length})`], ['waiting', `ממתינים לתשובה שלנו (${waitingCount})`], ['replied', 'ספקים שענו']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn('px-2.5 py-1 rounded-[var(--radius)] border', filter === k ? 'border-[var(--primary)] text-[var(--primary)] font-semibold' : 'border-[var(--border)] text-[var(--text-secondary)]')}>
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">אין שיחות להצגה.</p>
        ) : (
          <div className="divide-y divide-[var(--border-light)] rounded-[var(--radius)] border border-[var(--border)]">
            {shown.map((t) => {
              const v = byId[t.vendorId]
              return (
                <button key={t.vendorId} onClick={() => v && onOpen(v)} disabled={!v}
                  className="w-full text-right flex items-start gap-3 p-2.5 hover:bg-[var(--surface-secondary)] transition-colors">
                  <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', t.waiting ? 'bg-[var(--warning)]' : 'bg-transparent')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">{v?.name || 'ספק שנמחק'}
                      <span className="font-normal text-[var(--text-muted)]"> · {v?.category || ''}</span></p>
                    <p className="text-[12px] text-[var(--text-secondary)] truncate">
                      {t.last.channel === 'whatsapp_in' ? '↩ ' : 'ועד1: '}{t.last.body || t.last.subject}
                    </p>
                  </div>
                  <div className="shrink-0 text-left text-[11px] text-[var(--text-muted)] space-y-0.5">
                    <p>{fmtTime(t.last.created_at)}</p>
                    <p className="num-tabular">{t.count} הודעות</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
