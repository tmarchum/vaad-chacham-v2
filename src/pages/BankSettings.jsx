import { useState, useMemo, useEffect } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Landmark, Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff,
  Play, Settings2, Clock, Calendar, Moon, CheckCircle2, AlertCircle,
} from 'lucide-react'

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
  const { data: accounts, create, update, remove, refresh, isSaving } = useCollection('bankAccounts')
  const { data: allScrapeSettings, create: createSettings, update: updateSettings, refresh: refreshSettings } = useCollection('scrapeSettings')
  const { data: allTx } = useCollection('bankTransactions')

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

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    is_enabled: false,
    frequency: 'daily',
    days_back: 30,
    initial_pull_date: '',
    initial_pull_done: false,
  })

  useEffect(() => {
    if (scrapeSettings) {
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

  const openEdit = (account) => {
    setEditingId(account.id)
    setForm({ bank_type: account.bank_type, label: account.label || '', credentials: account.credentials || {} })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.bank_type) return
    const payload = { building_id: selectedBuilding.id, bank_type: form.bank_type, label: form.label, credentials: form.credentials, is_active: true }
    if (editingId) await update(editingId, payload)
    else await create(payload)
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
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'הגדרות נשמרו', type: 'success' } }))
  }

  const handleInitialPull = async () => {
    if (!settingsForm.initial_pull_date) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'יש לבחור תאריך התחלה', type: 'error' } }))
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
    window.dispatchEvent(new CustomEvent('app-toast', {
      detail: { message: `משיכה ראשונית הוגדרה מ-${settingsForm.initial_pull_date}. הסקרייפר ימשוך תנועות בהרצה הבאה.`, type: 'success' }
    }))
  }

  const handleMarkInitialDone = async () => {
    if (scrapeSettings) {
      await updateSettings(scrapeSettings.id, { initial_pull_done: true, last_run_status: 'initial_complete' })
      refreshSettings()
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'משיכה ראשונית סומנה כהושלמה. תהליך לילי פעיל.', type: 'success' } }))
    }
  }

  const togglePassword = (fieldKey) => setShowPasswords(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))

  const bankFields = BANKS[form.bank_type]?.fields || []

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לנהל חשבונות בנק" />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        iconColor="slate"
        title="חשבונות בנק"
        subtitle="ניהול חשבונות בנק ותזמון משיכת תנועות"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="gap-2">
              <Settings2 className="h-4 w-4" />
              הגדרות
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              הוסף חשבון
            </Button>
          </div>
        }
      />

      {/* Initial Pull / Nightly Status */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Initial Pull Card */}
        <div className={`rounded-xl border bg-white overflow-hidden ${!scrapeSettings?.initial_pull_done ? 'ring-2 ring-blue-500/30' : 'border-[var(--border)]'}`}>
          {/* Gradient header */}
          <div className="bg-gradient-to-l from-blue-500 to-blue-600 px-5 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">משיכה ראשונית</h3>
              <p className="text-xs text-blue-100">משיכת תנועות חד-פעמית מתאריך שנבחר</p>
            </div>
          </div>
          <div className="p-5">
            {scrapeSettings?.initial_pull_done ? (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-emerald-700 font-medium">הושלמה{scrapeSettings.initial_pull_date ? ` (מ-${scrapeSettings.initial_pull_date})` : ''}</span>
                <span className="text-[var(--text-secondary)] mr-auto">{txCount} תנועות נקלטו</span>
              </div>
            ) : (
              <div className="space-y-3">
                <FormField
                  label="תאריך התחלה"
                  type="date"
                  value={settingsForm.initial_pull_date}
                  onChange={(e) => setSettingsForm({ ...settingsForm, initial_pull_date: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleInitialPull} className="gap-1">
                    <Play className="h-3 w-3" />
                    הגדר משיכה ראשונית
                  </Button>
                  {txCount > 0 && (
                    <Button size="sm" variant="outline" onClick={handleMarkInitialDone} className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      סמן כהושלם ({txCount} תנועות)
                    </Button>
                  )}
                </div>
                {scrapeSettings?.last_run_status === 'pending_initial' && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    ממתין להרצה — הסקרייפר ימשוך מ-{scrapeSettings.initial_pull_date}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Nightly Process Card */}
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-l from-indigo-500 to-indigo-600 px-5 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Moon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">תהליך לילי</h3>
              <p className="text-xs text-indigo-100">משיכת תנועות אוטומטית כל לילה</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20">
              <div className={`w-2 h-2 rounded-full ${scrapeSettings?.is_enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              <span className="text-xs font-medium text-white">
                {scrapeSettings?.is_enabled ? 'פעיל' : 'מושבת'}
              </span>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-2.5 text-sm">
              {scrapeSettings?.last_run_at && (
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>הרצה אחרונה: {new Date(scrapeSettings.last_run_at).toLocaleString('he-IL')}</span>
                </div>
              )}
              {scrapeSettings?.last_run_status && !['pending_initial', 'initial_complete'].includes(scrapeSettings.last_run_status) && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${scrapeSettings.last_run_status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className={`text-sm font-medium ${scrapeSettings.last_run_status === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {scrapeSettings.last_run_status === 'success' ? 'הצליח' : scrapeSettings.last_run_status}
                  </span>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1 mt-2"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-3 w-3" />
                {scrapeSettings?.is_enabled ? 'שנה הגדרות' : 'הפעל תהליך לילי'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Account cards */}
      {buildingAccounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="אין חשבונות בנק"
          description="הוסף חשבון בנק כדי למשוך תנועות ולעקוב אחרי תשלומים"
          action={<Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />הוסף חשבון</Button>}
        />
      ) : (
        <div className="space-y-2">
          {buildingAccounts.map((account) => {
            const bankInfo = BANKS[account.bank_type]
            // Assign gradient colors to different bank types for variety
            const bankGradients = {
              hapoalim: 'from-red-500 to-red-600',
              leumi: 'from-blue-500 to-blue-600',
              discount: 'from-emerald-500 to-emerald-600',
              mizrahi: 'from-purple-500 to-purple-600',
              beinleumi: 'from-amber-500 to-amber-600',
              mercantile: 'from-cyan-500 to-cyan-600',
              otsarHahayal: 'from-indigo-500 to-indigo-600',
            }
            const gradient = bankGradients[account.bank_type] || 'from-slate-500 to-slate-600'
            const dotColor = account.is_active ? 'bg-emerald-500' : 'bg-slate-400'
            const statusText = account.is_active ? 'פעיל' : 'מושבת'
            const statusTextColor = account.is_active ? 'text-emerald-700' : 'text-slate-600'

            return (
              <div
                key={account.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all"
              >
                {/* Bank gradient circle */}
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                  <Landmark className="h-5 w-5" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {bankInfo?.name || account.bank_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    {account.label && <span>{account.label}</span>}
                    {account.last_scraped_at && (
                      <span>משיכה אחרונה: {new Date(account.last_scraped_at).toLocaleDateString('he-IL')}</span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 min-w-[60px]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-[12px] font-medium ${statusTextColor}`}>{statusText}</span>
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(account)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(account)}>
                    <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium text-[var(--text-secondary)]">פרטי התחברות</p>
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
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
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
