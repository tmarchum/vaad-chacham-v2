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
import { Settings } from 'lucide-react'

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
  }

  if (loading) {
    return (
      <p className="text-[var(--text-secondary)] py-8 text-center">טוען משתמשים...</p>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="text-right px-4 py-3 font-medium">דוא"ל</th>
                  <th className="text-right px-4 py-3 font-medium">שם</th>
                  <th className="text-right px-4 py-3 font-medium">תפקיד</th>
                  <th className="text-right px-4 py-3 font-medium">בניינים</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {user.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'default'}>
                        {ROLE_LABELS[user.role] ?? user.role ?? '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {buildingsForUser(user.id).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditRole(user)}
                      >
                        ערוך תפקיד
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                      לא נמצאו משתמשים
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
    const value = field === 'required' ? e.target.value : e.target.value
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
      <Card>
        <CardHeader>
          <CardTitle>שדות קיימים</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-[var(--text-secondary)] px-5 py-8 text-center">טוען שדות...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                    <th className="text-right px-4 py-3 font-medium">שם תצוגה</th>
                    <th className="text-right px-4 py-3 font-medium">מפתח</th>
                    <th className="text-right px-4 py-3 font-medium">סוג</th>
                    <th className="text-right px-4 py-3 font-medium">חובה</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr
                      key={field.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <td className="px-4 py-3 text-[var(--text-primary)]">{field.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                        {field.field_key}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
                      </td>
                      <td className="px-4 py-3">
                        {field.required ? (
                          <Badge variant="warning">חובה</Badge>
                        ) : (
                          <span className="text-[var(--text-secondary)]">אופציונלי</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === field.id}
                          onClick={() => handleDelete(field.id)}
                        >
                          {deletingId === field.id ? 'מוחק...' : 'מחק'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {fields.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                        לא הוגדרו שדות מותאמים
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create new field */}
      <Card>
        <CardHeader>
          <CardTitle>הוסף שדה חדש</CardTitle>
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
    setSaving(true)
    await supabase.from('building_memberships').insert({
      building_id: dialogBuilding.id,
      user_id: memberForm.user_id,
      role: memberForm.role,
    })
    setSaving(false)
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

      {buildings.map((building) => {
        const members = membersForBuilding(building.id)
        return (
          <Card key={building.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{building.name}</CardTitle>
                <Button size="sm" onClick={() => openAddMember(building)}>
                  + הוסף חבר ועד
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">לא הוגדרו חברי ועד לבניין זה</p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-[var(--text-primary)]">
                          {m.profile
                            ? [m.profile.first_name, m.profile.last_name].filter(Boolean).join(' ') ||
                              m.profile.email
                            : m.user_id}
                        </span>
                        <Badge variant="info">
                          {MEMBERSHIP_ROLE_LABELS[m.role] ?? m.role}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[var(--danger)] hover:text-[var(--danger)]"
                        onClick={() => handleRemoveMember(m.id)}
                      >
                        הסר
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

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
