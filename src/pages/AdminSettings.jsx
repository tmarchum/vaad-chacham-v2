import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { TabGroup } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { FormField, FormSelect, FormBool } from '@/components/common/FormField'
import { Settings, Users, Database, Building, Shield, Key } from 'lucide-react'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS = {
  admin: 'מנהל',
  committee: 'ועד',
  resident: 'דייר',
}

const ROLE_BADGE_VARIANT = {
  admin: 'danger',
  committee: 'info',
  resident: 'default',
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'טקסט' },
  { value: 'number', label: 'מספר' },
  { value: 'boolean', label: 'כן/לא' },
  { value: 'date', label: 'תאריך' },
]

const FIELD_TYPE_LABELS = {
  text: 'טקסט',
  number: 'מספר',
  boolean: 'כן/לא',
  date: 'תאריך',
}

const MEMBERSHIP_ROLE_OPTIONS = [
  { value: 'committee_chair', label: 'יו"ר ועד' },
  { value: 'committee', label: 'חבר ועד' },
  { value: 'manager', label: 'מנהל בניין' },
]

const MEMBERSHIP_ROLE_LABELS = {
  committee_chair: 'יו"ר ועד',
  committee: 'חבר ועד',
  manager: 'מנהל בניין',
}

// ---------------------------------------------------------------------------
// Tab 1 — Users
// ---------------------------------------------------------------------------

function UsersTab() {
  const [users, setUsers] = useState([])
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRoleUser, setEditRoleUser] = useState(null) // { id, email, role }
  const [newRole, setNewRole] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  const { buildings } = useBuildingContext()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: profilesData }, { data: membershipsData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('building_memberships').select('*, buildings(name)'),
    ])
    setUsers(profilesData ?? [])
    setMemberships(membershipsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const buildingsForUser = (userId) =>
    memberships
      .filter((m) => m.user_id === userId)
      .map((m) => m.buildings?.name ?? m.building_id)

  const openEditRole = (user) => {
    setEditRoleUser(user)
    setNewRole(user.role ?? 'resident')
  }

  const handleSaveRole = async () => {
    if (!editRoleUser) return
    setSavingRole(true)
    await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', editRoleUser.id)
    setSavingRole(false)
    setEditRoleUser(null)
    fetchData()
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'התפקיד עודכן בהצלחה', type: 'success' } }))
  }

  if (loading) {
    return (
      <p className="text-[var(--text-secondary)] py-8 text-center">טוען משתמשים...</p>
    )
  }

  const ROLE_GRADIENTS = {
    admin: 'from-red-500 to-rose-600',
    committee: 'from-blue-500 to-indigo-600',
    resident: 'from-slate-400 to-slate-500',
  }

  return (
    <div className="space-y-4">
      {users.length === 0 && (
        <p className="px-4 py-8 text-center text-[var(--text-secondary)]">לא נמצאו משתמשים</p>
      )}

      <div className="space-y-2">
        {users.map((user) => {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
          const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('') || '?'
          const gradient = ROLE_GRADIENTS[user.role] || ROLE_GRADIENTS.resident
          const userBuildings = buildingsForUser(user.id).join(', ')

          return (
            <div
              key={user.id}
              className="group flex items-center gap-4 p-4 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all border-[var(--border)]"
            >
              {/* Avatar circle */}
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                {initials}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                    {fullName}
                  </span>
                  <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'default'}>
                    {ROLE_LABELS[user.role] ?? user.role ?? '—'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)] truncate">{user.email ?? '—'}</span>
                  {userBuildings && (
                    <span className="text-xs text-[var(--text-muted)]">
                      <Building className="h-3 w-3 inline ml-0.5" />
                      {userBuildings}
                    </span>
                  )}
                </div>
              </div>

              {/* Action (hover reveal) */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditRole(user)}
                >
                  ערוך תפקיד
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editRoleUser} onOpenChange={(open) => !open && setEditRoleUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ערוך תפקיד משתמש</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {editRoleUser?.email}
          </p>
          <FormSelect
            label="תפקיד"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            options={[
              { value: 'admin', label: 'מנהל' },
              { value: 'committee', label: 'ועד' },
              { value: 'resident', label: 'דייר' },
            ]}
          />
          <div className="flex gap-2 mt-6 justify-end">
            <Button variant="outline" onClick={() => setEditRoleUser(null)}>
              ביטול
            </Button>
            <Button onClick={handleSaveRole} disabled={savingRole}>
              {savingRole ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Custom Fields
// ---------------------------------------------------------------------------

const EMPTY_FIELD_FORM = {
  name: '',
  field_key: '',
  field_type: 'text',
  required: false,
}

function CustomFieldsTab() {
  const { data: fields, isLoading, create, remove } = useCollection('unitFieldDefinitions')
  const [form, setForm] = useState(EMPTY_FIELD_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const handleNameChange = (e) => {
    const name = e.target.value
    // Auto-generate field_key from name: lowercase, replace spaces with underscores,
    // strip non-alphanumeric/underscore characters
    const key = name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '')
    setForm((prev) => ({ ...prev, name, field_key: key }))
  }

  const handleChange = (field) => (e) => {
    const value = field === 'required' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleRequiredChange = (e) => {
    setForm((prev) => ({ ...prev, required: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.field_key.trim()) return
    setSaving(true)
    try {
      await create({
        name: form.name.trim(),
        field_key: form.field_key.trim(),
        field_type: form.field_type,
        required: form.required === true || form.required === 'true',
      })
      setForm(EMPTY_FIELD_FORM)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await remove(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing fields */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm">
              <Database size={16} className="text-white" />
            </div>
            שדות קיימים
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-[var(--text-secondary)] px-5 py-8 text-center">טוען שדות...</p>
          ) : fields.length === 0 ? (
            <p className="px-4 py-8 text-center text-[var(--text-secondary)]">לא הוגדרו שדות מותאמים</p>
          ) : (
            <div className="space-y-2">
              {fields.map((field) => {
                const TYPE_GRADIENTS = {
                  text: 'from-blue-500 to-blue-600',
                  number: 'from-emerald-500 to-emerald-600',
                  boolean: 'from-amber-500 to-amber-600',
                  date: 'from-purple-500 to-purple-600',
                }
                const TYPE_ICONS = { text: 'T', number: '#', boolean: '?', date: 'D' }
                const gradient = TYPE_GRADIENTS[field.field_type] || TYPE_GRADIENTS.text

                return (
                  <div
                    key={field.id}
                    className="group flex items-center gap-4 p-4 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all border-[var(--border)]"
                  >
                    {/* Type icon circle */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                      {TYPE_ICONS[field.field_type] || 'T'}
                    </div>

                    {/* Field info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">{field.name}</span>
                        {field.required && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                            <span className="text-[11px] font-medium text-amber-700">חובה</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-[var(--text-muted)]">{field.field_key}</span>
                        <span className="text-xs text-[var(--text-muted)]">{FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}</span>
                      </div>
                    </div>

                    {/* Delete action (hover reveal) */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === field.id}
                        onClick={() => handleDelete(field.id)}
                      >
                        {deletingId === field.id ? 'מוחק...' : 'מחק'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create new field */}
      <Card className="overflow-hidden border border-[var(--border)]">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
              <Key size={16} className="text-white" />
            </div>
            הוסף שדה חדש
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} dir="rtl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="שם תצוגה *"
                value={form.name}
                onChange={handleNameChange}
                placeholder="לדוגמה: קומה"
                required
              />
              <FormField
                label='מפתח שדה *'
                value={form.field_key}
                onChange={(e) => setForm((prev) => ({ ...prev, field_key: e.target.value }))}
                placeholder="floor"
                required
                dir="ltr"
              />
              <FormSelect
                label="סוג שדה"
                value={form.field_type}
                onChange={handleChange('field_type')}
                options={FIELD_TYPE_OPTIONS}
              />
              <FormBool
                label="חובה"
                value={form.required}
                onChange={handleRequiredChange}
              />
            </div>
            <div className="mt-4 flex justify-start">
              <Button type="submit" disabled={saving || !form.name.trim() || !form.field_key.trim()}>
                {saving ? 'שומר...' : 'הוסף שדה'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 — Buildings & Committees
// ---------------------------------------------------------------------------

const EMPTY_MEMBERSHIP_FORM = {
  user_id: '',
  role: 'committee',
}

function BuildingsCommitteesTab() {
  const { buildings } = useBuildingContext()
  const [users, setUsers] = useState([])
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogBuilding, setDialogBuilding] = useState(null) // building object
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBERSHIP_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // null or member object

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: profilesData }, { data: membershipsData }] = await Promise.all([
      supabase.from('profiles').select('id, email, first_name, last_name, role').order('created_at'),
      supabase.from('building_memberships').select('*'),
    ])
    setUsers(profilesData ?? [])
    setMemberships(membershipsData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const membersForBuilding = (buildingId) =>
    memberships
      .filter((m) => m.building_id === buildingId)
      .map((m) => ({
        ...m,
        profile: users.find((u) => u.id === m.user_id),
      }))

  const openAddMember = (building) => {
    setDialogBuilding(building)
    setMemberForm(EMPTY_MEMBERSHIP_FORM)
  }

  const handleAddMember = async () => {
    if (!memberForm.user_id || !dialogBuilding) return

    // Duplicate check
    const alreadyMember = memberships.some(
      (m) => m.building_id === dialogBuilding.id && m.user_id === memberForm.user_id
    )
    if (alreadyMember) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'המשתמש כבר חבר בועד', type: 'error' } }))
      return
    }

    setSaving(true)
    const { error } = await supabase.from('building_memberships').insert({
      building_id: dialogBuilding.id,
      user_id: memberForm.user_id,
      role: memberForm.role,
    })
    setSaving(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'שגיאה בהוספת חבר ועד', type: 'error' } }))
      return
    }
    setDialogBuilding(null)
    fetchData()
  }

  const handleRemoveMember = async (membershipId) => {
    await supabase.from('building_memberships').delete().eq('id', membershipId)
    fetchData()
  }

  const userOptions = users.map((u) => ({
    value: u.id,
    label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || u.id,
  }))

  if (loading) {
    return (
      <p className="text-[var(--text-secondary)] py-8 text-center">טוען נתונים...</p>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {buildings.length === 0 && (
        <p className="text-[var(--text-secondary)] py-8 text-center">לא נמצאו בניינים</p>
      )}

      {buildings.map((building, bIdx) => {
        const members = membersForBuilding(building.id)
        const BUILDING_GRADIENTS = [
          'from-blue-500 to-indigo-600',
          'from-emerald-500 to-teal-600',
          'from-purple-500 to-violet-600',
          'from-amber-500 to-orange-600',
          'from-cyan-500 to-blue-600',
        ]
        const buildingGradient = BUILDING_GRADIENTS[bIdx % BUILDING_GRADIENTS.length]

        return (
          <Card key={building.id} className="overflow-hidden border border-[var(--border)]">
            <div className={`h-1 bg-gradient-to-r ${buildingGradient}`} />
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${buildingGradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                    <Building size={18} className="text-white" />
                  </div>
                  {building.name}
                </CardTitle>
                <Button size="sm" onClick={() => openAddMember(building)}>
                  + הוסף חבר ועד
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">לא הוגדרו חברי ועד לבניין זה</p>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => {
                    const memberName = m.profile
                      ? [m.profile.first_name, m.profile.last_name].filter(Boolean).join(' ') || m.profile.email
                      : m.user_id
                    const initials = m.profile
                      ? [m.profile.first_name?.[0], m.profile.last_name?.[0]].filter(Boolean).join('') || '?'
                      : '?'
                    const MEMBER_ROLE_GRADIENTS = {
                      committee_chair: 'from-amber-500 to-orange-600',
                      committee: 'from-blue-500 to-indigo-600',
                      manager: 'from-emerald-500 to-teal-600',
                    }
                    const memberGradient = MEMBER_ROLE_GRADIENTS[m.role] || 'from-slate-400 to-slate-500'

                    return (
                      <div
                        key={m.id}
                        className="group flex items-center gap-3 p-3 rounded-xl border bg-white hover:shadow-md hover:border-blue-200 transition-all border-[var(--border)]"
                      >
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${memberGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {memberName}
                          </span>
                        </div>
                        <Badge variant="info">
                          {MEMBERSHIP_ROLE_LABELS[m.role] ?? m.role}
                        </Badge>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[var(--danger)] hover:text-[var(--danger)]"
                            onClick={() => setConfirmRemove(m)}
                          >
                            הסר
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Remove member confirmation */}
      <DeleteConfirm
        open={!!confirmRemove}
        onOpenChange={() => setConfirmRemove(null)}
        onConfirm={async () => {
          await handleRemoveMember(confirmRemove.id)
          setConfirmRemove(null)
        }}
        itemName={`${confirmRemove?.profile ? [confirmRemove.profile.first_name, confirmRemove.profile.last_name].filter(Boolean).join(' ') || 'חבר ועד' : 'חבר ועד'} מהועד`}
      />

      {/* Add member dialog */}
      <Dialog open={!!dialogBuilding} onOpenChange={(open) => !open && setDialogBuilding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוסף חבר ועד — {dialogBuilding?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2" dir="rtl">
            <FormSelect
              label="בחר משתמש"
              value={memberForm.user_id}
              onChange={(e) => setMemberForm((prev) => ({ ...prev, user_id: e.target.value }))}
              options={[{ value: '', label: 'בחר...' }, ...userOptions]}
            />
            <FormSelect
              label="תפקיד בבניין"
              value={memberForm.role}
              onChange={(e) => setMemberForm((prev) => ({ ...prev, role: e.target.value }))}
              options={MEMBERSHIP_ROLE_OPTIONS}
            />
          </div>
          <div className="flex gap-2 mt-6 justify-end">
            <Button variant="outline" onClick={() => setDialogBuilding(null)}>
              ביטול
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={saving || !memberForm.user_id}
            >
              {saving ? 'שומר...' : 'הוסף'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'users', label: 'משתמשים' },
  { key: 'fields', label: 'שדות מותאמים' },
  { key: 'buildings', label: 'בניינים ועדים' },
]

export default function AdminSettings() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('users')

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--text-secondary)]">אין לך הרשאה לצפות בדף זה</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6" dir="rtl">
      <PageHeader icon={Settings} iconColor="slate" title="הגדרות מערכת" subtitle="ניהול משתמשים, שדות מותאמים ובניינים" />

      <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="pt-2">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'fields' && <CustomFieldsTab />}
        {activeTab === 'buildings' && <BuildingsCommitteesTab />}
      </div>
    </div>
  )
}
