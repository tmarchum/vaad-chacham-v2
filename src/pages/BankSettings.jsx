import { useState, useMemo, useEffect } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { FormField, FormSelect } from '@/components/common/FormField'
import { toast, toastError } from '@/lib/toast'
import {
  Landmark, Plus, Pencil, Trash2, Eye, EyeOff,
  Play, Settings2, Clock, Calendar, Moon, CheckCircle2, AlertCircle,
  FileSpreadsheet, ArrowLeftRight, CalendarCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const BANKS = {
  // בנקים
  beinleumi:   { name: 'בנק הבינלאומי (פאגי)',  fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  hapoalim:    { name: 'בנק הפועלים',           fields: [{ key: 'userCode', label: 'קוד משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  leumi:       { name: 'בנק לאומי',             fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  discount:    { name: 'בנק דיסקונט',           fields: [{ key: 'id', label: 'מספר זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'num', label: 'מספר קוד' }] },
  mercantile:  { name: 'בנק מרכנתיל',           fields: [{ key: 'id', label: 'מספר זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'num', label: 'מספר קוד' }] },
  mizrahi:     { name: 'בנק מזרחי טפחות',       fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  otsarHahayal:{ name: 'אוצר החייל',            fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  union:       { name: 'בנק איגוד',             fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  massad:      { name: 'בנק מסד',               fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  yahav:       { name: 'בנק יהב',               fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'nationalID', label: 'תעודת זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  pagi:        { name: 'פאגי (הבינלאומי הראשון)', fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  oneZero:     { name: 'OneZero (וואן זירו)',     fields: [{ key: 'email', label: 'אימייל' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'otpLongTermToken', label: 'OTP Token' }] },
  pepper:      { name: 'פפפר (בנק לאומי)',       fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  behatsdaa:   { name: 'בהצדעה',                 fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'birthday', label: 'תאריך לידה' }] },
  // כרטיסי אשראי
  visaCal:     { name: 'ויזה כאל',               fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  max:         { name: 'מקס',                    fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  isracard:    { name: 'ישראכרט',                fields: [{ key: 'id', label: 'מספר זהות' }, { key: 'card6Digits', label: '6 ספרות אחרונות' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  amex:        { name: 'אמריקן אקספרס',          fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'card6Digits', label: '6 ספרות אחרונות' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
}

const BANK_OPTIONS = Object.entries(BANKS).map(([value, { name }]) => ({ value, label: name }))

const EMPTY_FORM = { bank_type: '', label: '', credentials: {} }

export default function BankSettings() {
  const { selectedBuilding } = useBuildingContext()
  // Building-scoped SERVER-SIDE; unselected building yields [].
  const scope = { building_id: selectedBuilding?.id }
  const { data: accounts, create, update, remove, refresh, isSaving, isLoading } = useCollection('bankAccounts', scope)
  const { data: allScrapeSettings, create: createSettings, update: updateSettings, refresh: refreshSettings } = useCollection('scrapeSettings', scope)
  const { data: allTx } = useCollection('bankTransactions', scope)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showPasswords, setShowPasswords] = useState({})
  const [settingsOpen, setSettingsOpen] = useState(false)

  const buildingAccounts = useMemo(() =>
    accounts.filter(a => a.building_id === selectedBuilding?.id),
    [accounts, selectedBuilding]
  )

  const scrapeSettings = useMemo(() =>
    allScrapeSettings.find(s => s.building_id === selectedBuilding?.id),
    [allScrapeSettings, selectedBuilding]
  )

  const txCount = useMemo(() =>
    allTx.filter(t => t.building_id === selectedBuilding?.id).length,
    [allTx, selectedBuilding]
  )

  // Latest imported transaction + number of distinct months covered (from already-loaded rows)
  const feedStats = useMemo(() => {
    const rows = allTx.filter(t => t.building_id === selectedBuilding?.id)
    let latest = null
    const months = new Set()
    rows.forEach(t => {
      if (t.transaction_date && (!latest || t.transaction_date > latest)) latest = t.transaction_date
      if (t.month) months.add(t.month)
    })
    return { latest, months: months.size }
  }, [allTx, selectedBuilding])

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    is_enabled: false,
    frequency: 'daily',
    days_back: 30,
    initial_pull_date: '',
    initial_pull_done: false,
  })

  // Mirror the stored settings into the editable form once they load.
  useEffect(() => {
    if (scrapeSettings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettingsForm({
        is_enabled: scrapeSettings.is_enabled ?? false,
        frequency: scrapeSettings.frequency || 'daily',
        days_back: scrapeSettings.days_back || 30,
        initial_pull_date: scrapeSettings.initial_pull_date || '',
        initial_pull_done: scrapeSettings.initial_pull_done ?? false,
      })
    }
  }, [scrapeSettings])

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }

  // Write-only credentials: stored values are never loaded back into the form
  // (the UI already promises this — the code used to echo them anyway).
  const openEdit = (account) => {
    setEditingId(account.id)
    setForm({ bank_type: account.bank_type, label: account.label || '', credentials: {} })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.bank_type) return
    const payload = { building_id: selectedBuilding.id, bank_type: form.bank_type, label: form.label, is_active: true }
    const filled = Object.fromEntries(
      Object.entries(form.credentials).filter(([, v]) => String(v || '').trim() !== '')
    )
    if (editingId) {
      // Per-field: an empty input keeps the stored value, a filled one replaces it.
      if (Object.keys(filled).length > 0) {
        const existing = accounts.find(a => a.id === editingId)?.credentials || {}
        payload.credentials = { ...existing, ...filled }
      }
      await update(editingId, payload)
    } else {
      payload.credentials = filled
      await create(payload)
    }
    setFormOpen(false)
    refresh()
  }

  const handleDelete = async () => {
    if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(null); refresh() }
  }

  const handleSaveSettings = async () => {
    const payload = { building_id: selectedBuilding.id, ...settingsForm }
    if (scrapeSettings) await updateSettings(scrapeSettings.id, payload)
    else await createSettings(payload)
    setSettingsOpen(false)
    refreshSettings()
    toast('הגדרות נשמרו')
  }

  const handleInitialPull = async () => {
    if (!settingsForm.initial_pull_date) {
      toastError('יש לבחור תאריך התחלה')
      return
    }
    // Save settings with the initial pull date
    const payload = {
      building_id: selectedBuilding.id,
      ...settingsForm,
      initial_pull_done: false,
      last_run_status: 'pending_initial',
    }
    if (scrapeSettings) await updateSettings(scrapeSettings.id, payload)
    else await createSettings(payload)
    refreshSettings()
    toast(`משיכה ראשונית הוגדרה מ-${settingsForm.initial_pull_date}. הסקרייפר ימשוך תנועות בהרצה הבאה.`)
  }

  const handleMarkInitialDone = async () => {
    if (scrapeSettings) {
      await updateSettings(scrapeSettings.id, { initial_pull_done: true, last_run_status: 'initial_complete' })
      refreshSettings()
      toast('משיכה ראשונית סומנה כהושלמה. תהליך לילי פעיל.')
    }
  }

  const togglePassword = (fieldKey) => setShowPasswords(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))

  const bankFields = BANKS[form.bank_type]?.fields || []

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">חשבונות בנק</h1>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
        </div>
      </div>
    </div>
  )

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לנהל חשבונות בנק" />
  }

  const activeAccounts = buildingAccounts.filter(a => a.is_active).length
  const iconBtn = 'p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors'
  const accountActions = (account) => (
    <div className="flex gap-0.5 justify-end">
      <button className={iconBtn} onClick={() => openEdit(account)} title="עריכה"><Pencil className="h-3.5 w-3.5" /></button>
      <button className={`${iconBtn} hover:!text-[var(--danger)] hover:!bg-[var(--danger-light)]`} onClick={() => setDeleteTarget(account)} title="מחיקה"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">חשבונות בנק</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">ניהול חשבונות הבנק של הבניין ומקור קליטת התנועות • {selectedBuilding.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/bank-transactions" className="h-[38px] px-3.5 rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)] text-[13px] font-semibold inline-flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />תנועות בנק
          </Link>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            הגדרות משיכה
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            הוסף חשבון
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="חשבונות מוגדרים" icon={Landmark} color="blue"
          value={String(buildingAccounts.length)}
          sub={buildingAccounts.length ? `${activeAccounts} פעילים` : 'טרם הוגדר חשבון'} />
        <StatCard label="תנועות שנקלטו" icon={ArrowLeftRight} color="emerald"
          value={String(txCount)}
          sub={feedStats.months ? `על פני ${feedStats.months} חודשים` : 'טרם נקלטו תנועות'} />
        <StatCard label="תנועה אחרונה בקובץ" icon={CalendarCheck} color="slate"
          value={feedStats.latest ? new Date(feedStats.latest).toLocaleDateString('he-IL') : '—'}
          sub="תאריך התנועה המאוחרת ביותר שנקלטה" />
        <StatCard label="מקור הנתונים" icon={FileSpreadsheet} color="purple"
          value="ייבוא חודשי"
          valueClassName="!text-[20px] sm:!text-[22px]"
          sub="קובץ תנועות מהבנק (XLS) דרך תיקיית Drive" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Accounts */}
        <div className="xl:col-span-8 space-y-6 min-w-0">
          <SectionCard icon={Landmark} title="חשבונות הבניין" subtitle="פרטי ההתחברות נשמרים מוצפנים ואינם מוצגים לאחר השמירה"
            actions={<Button size="sm" variant="outline" onClick={openNew}><Plus className="h-3.5 w-3.5" />חשבון חדש</Button>}
            bodyClassName="p-0"
            footer={buildingAccounts.length ? `${buildingAccounts.length} חשבונות` : null}>
            {buildingAccounts.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="אין חשבונות בנק"
                description="הוסף את חשבון הבנק של הבניין כדי לשייך אליו את התנועות"
                actionLabel="הוסף חשבון"
                onAction={openNew}
              />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>בנק</th><th>תיאור</th><th>עדכון אחרון</th><th>סטטוס</th><th></th></tr>
                    </thead>
                    <tbody>
                      {buildingAccounts.map(account => (
                        <tr key={account.id}>
                          <td className="whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)]"><Landmark className="h-4 w-4" /></span>
                              <span className="text-[13px] font-semibold">{BANKS[account.bank_type]?.name || account.bank_type}</span>
                            </span>
                          </td>
                          <td className="text-[12px]">{account.label || <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap text-[12px] num-tabular">{account.last_scraped_at ? new Date(account.last_scraped_at).toLocaleDateString('he-IL') : <span className="text-[var(--text-muted)]">—</span>}</td>
                          <td className="whitespace-nowrap">{account.is_active ? <Badge variant="success">פעיל</Badge> : <Badge variant="neutral">מושבת</Badge>}</td>
                          <td className="whitespace-nowrap">{accountActions(account)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-[var(--border-light)]">
                  {buildingAccounts.map(account => (
                    <div key={account.id} className="p-4 flex items-center gap-3">
                      <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Landmark className="h-4 w-4" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate">{BANKS[account.bank_type]?.name || account.bank_type}</p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {account.label}{account.label && account.last_scraped_at ? ' • ' : ''}
                          {account.last_scraped_at && <span className="num-tabular">עדכון: {new Date(account.last_scraped_at).toLocaleDateString('he-IL')}</span>}
                        </p>
                      </div>
                      {account.is_active ? <Badge variant="success">פעיל</Badge> : <Badge variant="neutral">מושבת</Badge>}
                      {accountActions(account)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          {/* Legacy direct-pull settings (kept for existing data; the live feed is the monthly import) */}
          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard icon={Calendar} title="משיכה ראשונית" subtitle="הגדרת תאריך התחלה למשיכה ישירה מהבנק"
              tone={!scrapeSettings?.initial_pull_done ? 'primary' : undefined}
              bodyClassName="p-4">
              {scrapeSettings?.initial_pull_done ? (
                <div className="flex items-center gap-2 text-[13px] flex-wrap">
                  <Badge variant="success"><CheckCircle2 className="h-3 w-3" />הושלמה</Badge>
                  {scrapeSettings.initial_pull_date && <span className="text-[var(--text-secondary)] num-tabular">מ-{scrapeSettings.initial_pull_date}</span>}
                  <span className="text-[var(--text-secondary)] mr-auto num-tabular">{txCount} תנועות נקלטו</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <FormField
                    label="תאריך התחלה"
                    type="date"
                    value={settingsForm.initial_pull_date}
                    onChange={(e) => setSettingsForm({ ...settingsForm, initial_pull_date: e.target.value })}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={handleInitialPull}>
                      <Play className="h-3 w-3" />
                      הגדר משיכה ראשונית
                    </Button>
                    {txCount > 0 && (
                      <Button size="sm" variant="outline" onClick={handleMarkInitialDone}>
                        <CheckCircle2 className="h-3 w-3" />
                        סמן כהושלם ({txCount} תנועות)
                      </Button>
                    )}
                  </div>
                  {scrapeSettings?.last_run_status === 'pending_initial' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-xs text-[var(--warning)]">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      ממתין להרצה — הסקרייפר ימשוך מ-{scrapeSettings.initial_pull_date}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Moon} title="תהליך לילי" subtitle="משיכה ישירה תקופתית מהבנק"
              actions={scrapeSettings?.is_enabled ? <Badge variant="success">פעיל</Badge> : <Badge variant="neutral">מושבת</Badge>}
              bodyClassName="p-4">
              <div className="space-y-2.5 text-[13px]">
                {scrapeSettings?.last_run_at && (
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className="num-tabular">הרצה אחרונה: {new Date(scrapeSettings.last_run_at).toLocaleString('he-IL')}</span>
                  </div>
                )}
                {scrapeSettings?.last_run_status && !['pending_initial', 'initial_complete'].includes(scrapeSettings.last_run_status) && (
                  <div>
                    {scrapeSettings.last_run_status === 'success'
                      ? <Badge variant="success">הצליח</Badge>
                      : <Badge variant="danger">{scrapeSettings.last_run_status}</Badge>}
                  </div>
                )}
                {!scrapeSettings?.last_run_at && !scrapeSettings?.last_run_status && (
                  <p className="text-[12px] text-[var(--text-muted)]">לא בוצעו הרצות.</p>
                )}
                <Button size="sm" variant="outline" className="mt-1" onClick={() => setSettingsOpen(true)}>
                  <Settings2 className="h-3 w-3" />
                  {scrapeSettings?.is_enabled ? 'שנה הגדרות' : 'הגדרות תהליך לילי'}
                </Button>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Feed source side panel */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-6">
          <SectionCard icon={FileSpreadsheet} title="איך נקלטות התנועות" subtitle="ייבוא חודשי מקובץ הבנק" bodyClassName="p-4 space-y-3 text-[12px] text-[var(--text-secondary)]">
            <ol className="space-y-2.5">
              {[
                'מורידים מאתר הבנק את קובץ התנועות החודשי (XLS).',
                'שומרים את הקובץ בתיקיית ה-Drive של הבניין.',
                'התנועות נקלטות למערכת ומשויכות לחודש המתאים.',
                'במסך תנועות בנק משייכים זיכויים לדירות ומסווגים חיובים.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-[var(--surface-container)] text-[var(--primary-dark)] text-[11px] font-bold flex items-center justify-center shrink-0 num-tabular">{i + 1}</span>
                  <span className="leading-5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-2 p-2.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-[var(--warning)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>משיכה ישירה מאתר הבנק אינה פעילה כרגע — מקור הנתונים הוא הקובץ החודשי. הגדרות המשיכה הישירה נשמרו לצורך תיעוד בלבד.</span>
            </div>
            <Link to="/bank-transactions" className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">לשיוך ולסיווג התנועות</span>
              <ArrowLeftRight className="h-4 w-4 text-[var(--primary)]" />
            </Link>
          </SectionCard>
        </aside>
      </div>

      {/* Add/Edit Account Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת חשבון בנק' : 'הוספת חשבון בנק'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FormSelect label="בנק" value={form.bank_type} onChange={(e) => setForm({ ...form, bank_type: e.target.value, credentials: {} })} options={BANK_OPTIONS} placeholder="בחר בנק..." />
            <FormField label="תיאור (אופציונלי)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="למשל: חשבון ועד ראשי" />
            {bankFields.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4 space-y-3">
                <p className="text-sm font-medium text-[var(--text-secondary)]">פרטי התחברות</p>
                {editingId && (
                  <p className="text-xs text-[var(--text-muted)] -mt-1">
                    מטעמי אבטחה הסיסמה אינה מוצגת. השאר ריק כדי לשמור את הסיסמה הקיימת, או מלא כדי להחליף.
                  </p>
                )}
                {bankFields.map((field) => (
                  <div key={field.key} className="relative">
                    <FormField
                      label={field.label}
                      value={form.credentials[field.key] || ''}
                      onChange={(e) => setForm({ ...form, credentials: { ...form.credentials, [field.key]: e.target.value } })}
                      type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                    />
                    {field.type === 'password' && (
                      <button type="button" onClick={() => togglePassword(field.key)} className="absolute left-3 top-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
              <Button onClick={handleSave} disabled={isSaving || !form.bank_type}>{isSaving ? 'שומר...' : 'שמור'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>הגדרות תהליך לילי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-2 p-2.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-xs text-[var(--warning)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>משיכה ישירה מהבנק אינה פעילה כרגע; התנועות נקלטות מהקובץ החודשי.</span>
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] transition-colors">
              <input type="checkbox" checked={settingsForm.is_enabled} onChange={(e) => setSettingsForm({ ...settingsForm, is_enabled: e.target.checked })} className="rounded w-5 h-5" />
              <div>
                <p className="text-sm font-medium">הפעל משיכת תנועות לילית</p>
                <p className="text-xs text-[var(--text-secondary)]">הסקרייפר ירוץ כל לילה בשעה 02:00 וימשוך תנועות חדשות</p>
              </div>
            </label>

            <FormSelect
              label="תדירות"
              value={settingsForm.frequency}
              onChange={(e) => setSettingsForm({ ...settingsForm, frequency: e.target.value })}
              options={[
                { value: 'daily', label: 'יומי — כל לילה' },
                { value: 'weekly', label: 'שבועי — כל מוצאי שבת' },
                { value: 'manual', label: 'ידני בלבד' },
              ]}
            />

            <FormField
              label="ימים אחורה לבדיקה"
              type="number"
              value={settingsForm.days_back}
              onChange={(e) => setSettingsForm({ ...settingsForm, days_back: Number(e.target.value) || 7 })}
            />
            <p className="text-xs text-[var(--text-secondary)] -mt-2">
              בכל הרצה, כמה ימים אחורה לחפש תנועות חדשות (ברירת מחדל: 7 לתהליך לילי)
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>ביטול</Button>
              <Button onClick={handleSaveSettings}>שמור</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={`חשבון "${BANKS[deleteTarget?.bank_type]?.name || ''}"`}
      />
    </div>
  )
}
