import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast, toastError } from '@/lib/toast'
import { ImagePlus, Link2, Trash2, StickyNote } from 'lucide-react'
import { issueBriefLink } from '@/lib/issueBrief'

// Committee: add notes and photos to an issue so a vendor can price it without
// a visit. Everything here appears on the vendor's job page (issueBriefLink).
export function IssueVendorDetails({ issue }) {
  const [items, setItems] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const buildingId = issue.building_id || issue.buildingId

  const load = useCallback(async () => {
    const { data } = await supabase.from('issue_attachments').select('*').eq('issue_id', issue.id).order('created_at')
    setItems(data || [])
  }, [issue.id])
  useEffect(() => { load() }, [load])

  const addNote = async () => {
    if (!note.trim()) return
    setBusy(true)
    const { error } = await supabase.from('issue_attachments').insert({ issue_id: issue.id, building_id: buildingId, kind: 'note', body: note.trim() })
    setBusy(false)
    if (error) { toastError('השמירה נכשלה'); return }
    setNote('')
    load()
  }

  const addPhotos = async (files) => {
    if (!files?.length) return
    setBusy(true)
    let ok = 0
    for (const f of Array.from(files).slice(0, 12)) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${buildingId}/${issue.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('issue-photos').upload(path, f, { contentType: f.type || 'image/jpeg' })
      if (error) continue
      const url = supabase.storage.from('issue-photos').getPublicUrl(path).data.publicUrl
      const { error: e2 } = await supabase.from('issue_attachments').insert({ issue_id: issue.id, building_id: buildingId, kind: 'photo', url })
      if (!e2) ok++
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    if (ok) toast(`נוספו ${ok} תמונות`); else toastError('העלאת התמונות נכשלה')
    load()
  }

  const remove = async (id) => {
    await supabase.from('issue_attachments').delete().eq('id', id)
    load()
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(issueBriefLink(issue)); toast('הקישור לספק הועתק') } catch { toastError('ההעתקה נכשלה') }
  }

  const photos = items.filter((i) => i.kind === 'photo')
  const notes = items.filter((i) => i.kind === 'note')

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">פרטים ותמונות לספק</p>
        {issue.brief_token && <Button size="sm" variant="ghost" onClick={copyLink}><Link2 className="h-3.5 w-3.5" />קישור לספק</Button>}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">כל מה שמוסיפים כאן מופיע בדף העבודה שהספק מקבל בבקשת הצעת מחיר: מידות, דגם, גישה, שעות נוחות — וכמה שיותר תמונות.</p>

      {notes.map((n) => (
        <div key={n.id} className="flex items-start gap-2 text-[13px]">
          <StickyNote className="h-3.5 w-3.5 mt-0.5 text-[var(--text-muted)] shrink-0" />
          <p className="flex-1 whitespace-pre-wrap">{n.body}</p>
          <button onClick={() => remove(n.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)]"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="למשל: הנזילה מעל דלת הכניסה, גובה 3 מטר, צריך סולם. גישה דרך חדר האשפה."
          className="flex-1 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--primary)] focus:outline-none" />
        <Button size="sm" onClick={addNote} disabled={busy || !note.trim()}>הוספה</Button>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square">
              <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" className="h-full w-full object-cover rounded-md border border-[var(--border)]" /></a>
              <button onClick={() => remove(p.id)} className="absolute top-1 left-1 rounded bg-black/60 p-0.5 text-white"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        <ImagePlus className="h-4 w-4" />{busy ? 'מעלה...' : 'הוספת תמונות'}
      </Button>
    </div>
  )
}
