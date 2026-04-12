import { useState, useMemo, useEffect } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import {
  Landmark, Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff,
  Play, Settings2, Clock, Calendar, Moon, CheckCircle2, AlertCircle,
} from 'lucide-react'

const BANKS = {
  beinleumi:   { name: 'בנק הבינלאומי',    fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  hapoalim:    { name: 'בנק הפועלים',       fields: [{ key: 'userCode', label: 'קוד משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  leumi:       { name: 'בנק לאומי',         fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  discount:    { name: 'בנק דיסקונט',       fields: [{ key: 'id', label: 'מספר זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'num', label: 'מספר קוד' }] },
  mercantile:  { name: 'בנק מרכנתיל',       fields: [{ key: 'id', label: 'מספר זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }, { key: 'num', label: 'מספר קוד' }] },
  mizrahi:     { name: 'בנק מזרחי',         fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  otsarHahayal:{ name: 'אוצר החייל',        fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  union:       { name: 'בנק איגוד',         fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  massad:      { name: 'בנק מסד',           fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
  yahav:       { name: 'בנק יהב',           fields: [{ key: 'username', label: 'שם משתמש' }, { key: 'nationalID', label: 'תעודת זהות' }, { key: 'password', label: 'סיסמה', type: 'password' }] },
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">חשבונות בנק</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">ניהול חשבונות בנק ותזמון משיכת תנועות</p>
        </div>
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
      </div>

      {/* Initial Pull / Nightly Status */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Initial Pull Card */}
        <Card className={!scrapeSettings?.initial_pull_done ? 'ring-2 ring-blue-500/30' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">משיכה ראשונית</h3>
                <p className="text-xs text-[var(--text-secondary)]">משיכת תנועות חד-פעמית מתאריך שנבחר</p>
              </div>
            </div>

            {scrapeSettings?.initial_pull_done ? (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>הושלמה{scrapeSettings.initial_pull_date ? ` (מ-${scrapeSettings.initial_pull_date})` : ''}</span>
                <span className="text-[var(--text-secondary)] mr-auto">{txCount} תנועות נקלטו</span>
              </div>
            ) : (
              <div className="space-y-3">
                <FormField
                  label="תאריך התחלה"
                  type="date"
                  value={settingsForm.initial_pull_date}
                  onChange={(v) => setSettingsForm({ ...settingsForm, initial_pull_date: v })}
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
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    ממתין להרצה — הסקרייפר ימשוך מ-{scrapeSettings.initial_pull_date}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nightly Process Card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Moon className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">תהליך לילי</h3>
                <p className="text-xs text-[var(--text-secondary)]">משיכת תנועות אוטומטית כל לילה</p>
              </div>
              <Badge variant={scrapeSettings?.is_enabled ? 'success' : 'secondary'}>
                {scrapeSettings?.is_enabled ? 'פעיל' : 'מושבת'}
              </Badge>
            </div>

            <div className="space-y-2 text-sm">
              {scrapeSettings?.last_run_at && (
                <p className="text-[var(--text-secondary)] flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  הרצה אחרונה: {new Date(scrapeSettings.last_run_at).toLocaleString('he-IL')}
                </p>
              )}
              {scrapeSettings?.last_run_status && !['pending_initial', 'initial_complete'].includes(scrapeSettings.last_run_status) && (
                <p className="text-[var(--text-secondary)] flex items-center gap-2">
                  {scrapeSettings.last_run_status === 'success'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    : <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  }
                  סטטוס: {scrapeSettings.last_run_status === 'success' ? 'הצליח' : scrapeSettings.last_run_status}
                </p>
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
          </CardContent>
        </Card>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildingAccounts.map((account) => {
            const bankInfo = BANKS[account.bank_type]
            return (
              <Card key={account.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Landmark className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{bankInfo?.name || account.bank_type}</h3>
                        {account.label && <p className="text-xs text-[var(--text-secondary)]">{account.label}</p>}
                      </div>
                    </div>
                    <Badge variant={account.is_active ? 'success' : 'secondary'}>
                      {account.is_active ? 'פעיל' : 'מושבת'}
                    </Badge>
                  </div>
                  {account.last_scraped_at && (
                    <p className="text-xs text-[var(--text-secondary)] mb-3">
                      משיכה אחרונה: {new Date(account.last_scraped_at).toLocaleDateString('he-IL')}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(account)} className="gap-1">
                      <Pencil className="h-3 w-3" /> ערוך
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500 gap-1" onClick={() => setDeleteTarget(account)}>
                      <Trash2 className="h-3 w-3" /> מחק
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Account Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת חשבון בנק' : 'הוספת חשבון בנק'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FormSelect label="בנק" value={form.bank_type} onChange={(v) => setForm({ ...form, bank_type: v, credentials: {} })} options={BANK_OPTIONS} placeholder="בחר בנק..." />
            <FormField label="תיאור (אופציונלי)" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="למשל: חשבון ועד ראשי" />
            {bankFields.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium text-[var(--text-secondary)]">פרטי התחברות</p>
                {bankFields.map((field) => (
                  <div key={field.key} className="relative">
                    <FormField
                      label={field.label}
                      value={form.credentials[field.key] || ''}
                      onChange={(v) => setForm({ ...form, credentials: { ...form.credentials, [field.key]: v } })}
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
        <DialogContent className="max-w-md">
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
              onChange={(v) => setSettingsForm({ ...settingsForm, frequency: v })}
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
              onChange={(v) => setSettingsForm({ ...settingsForm, days_back: Number(v) || 7 })}
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
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת חשבון בנק"
        description={`למחוק את החשבון "${BANKS[deleteTarget?.bank_type]?.name || ''}"? התנועות יישארו אך לא יקושרו לחשבון זה.`}
      />
    </div>
  )
}
