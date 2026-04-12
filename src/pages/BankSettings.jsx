import { useState, useMemo } from 'react'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField, FormSelect } from '@/components/common/FormField'
import { Landmark, Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff } from 'lucide-react'

// Supported banks with their credential fields
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

const EMPTY_FORM = {
  bank_type: '',
  label: '',
  credentials: {},
}

export default function BankSettings() {
  const { selectedBuilding } = useBuildingContext()
  const { data: accounts, create, update, remove, refresh, isSaving } = useCollection('bankAccounts')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showPasswords, setShowPasswords] = useState({})

  const buildingAccounts = useMemo(() =>
    accounts.filter(a => a.building_id === selectedBuilding?.id),
    [accounts, selectedBuilding]
  )

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (account) => {
    setEditingId(account.id)
    setForm({
      bank_type: account.bank_type,
      label: account.label || '',
      credentials: account.credentials || {},
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.bank_type) return

    const payload = {
      building_id: selectedBuilding.id,
      bank_type: form.bank_type,
      label: form.label,
      credentials: form.credentials,
      is_active: true,
    }

    if (editingId) {
      await update(editingId, payload)
    } else {
      await create(payload)
    }
    setFormOpen(false)
    refresh()
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
      setDeleteTarget(null)
      refresh()
    }
  }

  const togglePassword = (fieldKey) => {
    setShowPasswords(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
  }

  const bankFields = BANKS[form.bank_type]?.fields || []

  if (!selectedBuilding) {
    return <EmptyState icon={Landmark} title="בחר בניין" description="יש לבחור בניין כדי לנהל חשבונות בנק" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">חשבונות בנק</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            ניהול חשבונות בנק למשיכת תנועות אוטומטית
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          הוסף חשבון
        </Button>
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
              <Card key={account.id} className="relative">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Landmark className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{bankInfo?.name || account.bank_type}</h3>
                        {account.label && (
                          <p className="text-xs text-[var(--text-secondary)]">{account.label}</p>
                        )}
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
                      <Pencil className="h-3 w-3" />
                      ערוך
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500 gap-1" onClick={() => setDeleteTarget(account)}>
                      <Trash2 className="h-3 w-3" />
                      מחק
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'עריכת חשבון בנק' : 'הוספת חשבון בנק'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <FormSelect
              label="בנק"
              value={form.bank_type}
              onChange={(v) => setForm({ ...form, bank_type: v, credentials: {} })}
              options={BANK_OPTIONS}
              placeholder="בחר בנק..."
            />

            <FormField
              label="תיאור (אופציונלי)"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
              placeholder="למשל: חשבון ועד ראשי"
            />

            {bankFields.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium text-[var(--text-secondary)]">פרטי התחברות</p>
                {bankFields.map((field) => (
                  <div key={field.key} className="relative">
                    <FormField
                      label={field.label}
                      value={form.credentials[field.key] || ''}
                      onChange={(v) => setForm({
                        ...form,
                        credentials: { ...form.credentials, [field.key]: v }
                      })}
                      type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => togglePassword(field.key)}
                        className="absolute left-3 top-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
              <Button onClick={handleSave} disabled={isSaving || !form.bank_type}>
                {isSaving ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת חשבון בנק"
        description={`למחוק את החשבון "${BANKS[deleteTarget?.bank_type]?.name || ''}"? כל התנועות המקושרות יישארו אך לא יקושרו יותר לחשבון זה.`}
      />
    </div>
  )
}
