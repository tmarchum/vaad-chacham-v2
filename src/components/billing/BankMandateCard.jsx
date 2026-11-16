import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/common/SectionCard'
import { toast, toastError } from '@/lib/toast'
import { Landmark } from 'lucide-react'
import { MANDATE_STATUS, mandateAllowsDebit } from '@/lib/statements'

const field = 'h-[36px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 text-[13px] focus:border-[var(--primary)] focus:outline-none'
const lbl = 'text-[12px] font-semibold text-[var(--text-secondary)] space-y-1'

const digits = (v) => String(v || '').replace(/\D/g, '')
const EMPTY = { holder: '', bank: '', branch: '', account: '', signer: '', signedOn: '' }

// Bank account of the building and its direct-debit authorization (מס"ב).
// The committee fills the account and uploads the signed form; the system
// admin records where the authorization stands at the bank.
export function BankMandateCard({ buildingId, isAdmin, onChange }) {
  const [m, setM] = useState(undefined)
  const [form, setForm] = useState(EMPTY)
  const [adm, setAdm] = useState({ status: 'missing', reference: '', limit: '', notes: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!buildingId) return
    const { data } = await supabase.from('building_bank_mandates').select('*').eq('building_id', buildingId).maybeSingle()
    const d = data || null
    setM(d)
    setForm({
      holder: d?.account_holder || '', bank: d?.bank_code || '', branch: d?.branch_code || '', account: d?.account_number || '',
      signer: d?.signer || '', signedOn: d?.signed_on || '',
    })
    setAdm({ status: d?.status || 'missing', reference: d?.reference || '', limit: d?.debit_limit ?? '', notes: d?.notes || '' })
    setFile(null)
  }, [buildingId])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (form.account && !(form.bank && form.branch)) { toastError('חסרים מספר בנק ומספר סניף'); return }
    setBusy('save')
    let path = null
    if (file) {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
      path = `${buildingId}/mandate-${Date.now()}.${ext || 'pdf'}`
      const { error } = await supabase.storage.from('building-documents').upload(path, file, { contentType: file.type || 'application/pdf' })
      if (error) { setBusy(''); toastError('העלאת הטופס נכשלה'); return }
    }
    const { error } = await supabase.rpc('save_building_bank', {
      p_building: buildingId, p_holder: form.holder, p_bank: form.bank, p_branch: form.branch, p_account: form.account,
      p_signer: form.signer, p_signed_on: form.signedOn || null, p_document: path,
    })
    setBusy('')
    if (error) { toastError('השמירה נכשלה'); return }
    toast('פרטי החשבון נשמרו')
    await load(); onChange?.()
  }

  const saveStatus = async () => {
    setBusy('status')
    const { error } = await supabase.rpc('set_bank_mandate_status', {
      p_building: buildingId, p_status: adm.status, p_reference: adm.reference,
      p_limit: adm.limit === '' ? null : Number(adm.limit), p_notes: adm.notes,
    })
    setBusy('')
    if (error) { toastError(String(error.message).includes('no_account') ? 'אי אפשר לסמן הרשאה פעילה בלי פרטי חשבון מלאים' : 'העדכון נכשל'); return }
    toast('מצב ההרשאה עודכן')
    await load(); onChange?.()
  }

  const openDoc = async () => {
    const { data, error } = await supabase.storage.from('building-documents').createSignedUrl(m.document_path, 120)
    if (error || !data?.signedUrl) { toastError('פתיחת הטופס נכשלה'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (m === undefined) return null
  const status = m?.status || 'missing'
  const ok = mandateAllowsDebit(status)
  const set = (k, v) => setForm({ ...form, [k]: v })

  return (
    <SectionCard icon={Landmark} title="חשבון בנק והרשאה לחיוב"
      subtitle={'החשבון שממנו ועד1 גובה בהוראת קבע (מס"ב). הפרטים גלויים רק לוועד הבניין ולמנהל המערכת'}>
      <div className="p-4 space-y-4">
        <p className={`text-[13px] font-semibold ${ok ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          הרשאה לחיוב: {MANDATE_STATUS[status]}
          {status === 'active' && m?.bank_approved_on && ` · מאז ${new Date(m.bank_approved_on).toLocaleDateString('he-IL')}`}
        </p>

        <div className="grid gap-2 sm:grid-cols-4">
          <label className={`${lbl} sm:col-span-4`}><span>שם בעל החשבון, כפי שרשום בבנק</span>
            <input className={field} value={form.holder} onChange={(e) => set('holder', e.target.value)} />
          </label>
          <label className={lbl}><span>בנק (מספר)</span>
            <input dir="ltr" inputMode="numeric" maxLength={3} className={field} value={form.bank} onChange={(e) => set('bank', digits(e.target.value))} />
          </label>
          <label className={lbl}><span>סניף</span>
            <input dir="ltr" inputMode="numeric" maxLength={4} className={field} value={form.branch} onChange={(e) => set('branch', digits(e.target.value))} />
          </label>
          <label className={`${lbl} sm:col-span-2`}><span>מספר חשבון</span>
            <input dir="ltr" inputMode="numeric" maxLength={13} className={field} value={form.account} onChange={(e) => set('account', digits(e.target.value))} />
          </label>
          <label className={`${lbl} sm:col-span-2`}><span>מי חתם על ההרשאה (שם משפחה ודירה)</span>
            <input className={field} value={form.signer} onChange={(e) => set('signer', e.target.value)} />
          </label>
          <label className={lbl}><span>תאריך חתימה</span>
            <input type="date" className={field} value={form.signedOn} onChange={(e) => set('signedOn', e.target.value)} />
          </label>
          <label className={lbl}><span>טופס חתום (PDF או תמונה)</span>
            <input type="file" accept="application/pdf,image/*" className="block w-full text-[12px]" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={save} disabled={!!busy}>{busy === 'save' ? 'שומר...' : 'שמירה'}</Button>
          {m?.document_path && <button type="button" onClick={openDoc} className="text-[12px] text-[var(--primary)]">צפייה בטופס החתום</button>}
          {status === 'active' && <span className="text-[11px] text-[var(--text-muted)]">שינוי פרטי החשבון יחזיר את ההרשאה ל"ממתין לאישור הבנק".</span>}
        </div>

        {isAdmin && (
          <div className="grid gap-2 sm:grid-cols-4 items-end border-t border-[var(--border-light)] pt-3">
            <label className={`${lbl} sm:col-span-2`}><span>מצב ההרשאה</span>
              <select className={field} value={adm.status} onChange={(e) => setAdm({ ...adm, status: e.target.value })}>
                {Object.entries(MANDATE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className={lbl}><span>אסמכתה בבנק</span>
              <input dir="ltr" className={field} value={adm.reference} onChange={(e) => setAdm({ ...adm, reference: e.target.value })} />
            </label>
            <label className={lbl}><span>תקרה לחיוב (₪)</span>
              <input dir="ltr" type="number" min={0} className={field} value={adm.limit} onChange={(e) => setAdm({ ...adm, limit: e.target.value })} />
            </label>
            <label className={`${lbl} sm:col-span-3`}><span>הערות</span>
              <input className={field} value={adm.notes} onChange={(e) => setAdm({ ...adm, notes: e.target.value })} />
            </label>
            <Button size="sm" variant="outline" onClick={saveStatus} disabled={!!busy}>{busy === 'status' ? 'מעדכן...' : 'עדכון מצב'}</Button>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
