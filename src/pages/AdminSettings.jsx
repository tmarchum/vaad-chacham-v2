import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCollection, useBuildingContext } from '@/hooks/useStore'
import { TabGroup } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionCard } from '@/components/common/SectionCard'
import { SearchBar } from '@/components/common/SearchBar'
import { FormField, FormSelect, FormBool } from '@/components/common/FormField'
import { Users, Database, Building, Key, MessageCircle, ShieldAlert, Plus, Trash2, UserCog, CheckCircle2, AlertTriangle } from 'lucide-react'
import { resetWhatsappEnabledCache } from '@/lib/whatsapp'
import { DeleteConfirm } from '@/components/common/DeleteConfirm'
import { toast, toastError } from '@/lib/toast'

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
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

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
    toast('התפקיד עודכן בהצלחה')
  }

  if (loading) {
    return (
      <SectionCard icon={Users} title="משתמשים והרשאות">
        <p className="text-[var(--text-secondary)] py-8 text-center text-[13px]">טוען משתמשים...</p>
      </SectionCard>
    )
  }

  const q = search.trim().toLowerCase()
  const shown = users.filter((u) => {
    if (roleFilter !== 'all' && (u.role ?? 'resident') !== roleFilter) return false
    if (!q) return true
    return [u.first_name, u.last_name, u.email].some((v) => v && v.toLowerCase().includes(q))
  })
  const roleCount = (r) => users.filter((u) => (u.role ?? 'resident') === r).length

  return (
    <div className="space-y-4">
      <SectionCard
        icon={Users}
        title="משתמשים והרשאות"
        subtitle={`${users.length} משתמשים רשומים • ${roleCount('admin')} מנהלים • ${roleCount('committee')} ועד`}
        footer={`מציג ${shown.length} מתוך ${users.length}`}
      >
        <div className="p-3 sm:p-4 border-b border-[var(--border)] flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 min-w-0">
            <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי שם או אימייל..." />
          </div>
          <TabGroup
            tabs={[
              { key: 'all', label: 'הכל', count: users.length },
              { key: 'admin', label: 'מנהלים', count: roleCount('admin') },
              { key: 'committee', label: 'ועד', count: roleCount('committee') },
              { key: 'resident', label: 'דיירים', count: roleCount('resident') },
            ]}
            activeTab={roleFilter}
            onChange={setRoleFilter}
          />
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--text-secondary)]">לא נמצאו משתמשים</p>
        ) : (
          <>
            {/* Desktop ledger */}
            <div className="hidden md:block overflow-x-auto">
              <table className="ds-table">
                <thead>
                  <tr><th>משתמש</th><th>אימייל</th><th>תפקיד</th><th>בניינים</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map((user) => {
                    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
                    const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('') || '?'
                    const userBuildings = buildingsForUser(user.id).join(', ')
                    return (
                      <tr key={user.id}>
                        <td className="min-w-[160px]">
                          <div className="flex items-center gap-2.5">
                            <span className="h-8 w-8 rounded-full bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[12px] font-bold shrink-0">{initials}</span>
                            <span className="text-[13px] font-semibold truncate">{fullName}</span>
                          </div>
                        </td>
                        <td className="text-[12px] text-[var(--text-secondary)]">{user.email ?? '—'}</td>
                        <td className="whitespace-nowrap">
                          <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'default'}>{ROLE_LABELS[user.role] ?? user.role ?? '—'}</Badge>
                        </td>
                        <td className="text-[12px] text-[var(--text-secondary)]">{userBuildings || <span className="text-[var(--text-muted)]">—</span>}</td>
                        <td className="whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => openEditRole(user)}><UserCog className="h-3.5 w-3.5" />ערוך תפקיד</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--border-light)]">
              {shown.map((user) => {
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
                const userBuildings = buildingsForUser(user.id).join(', ')
                return (
                  <div key={user.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">{fullName}</span>
                        <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'default'}>{ROLE_LABELS[user.role] ?? user.role ?? '—'}</Badge>
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)] truncate">{user.email ?? '—'}</p>
                      {userBuildings && <p className="text-[12px] text-[var(--text-muted)] flex items-center gap-1"><Building className="h-3 w-3" />{userBuildings}</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEditRole(user)}>ערוך תפקיד</Button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </SectionCard>

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
      <SectionCard
        icon={Database}
        title="שדות קיימים"
        subtitle="שדות נוספים שמופיעים בכרטיס כל דירה"
        footer={!isLoading && fields.length ? `${fields.length} שדות מוגדרים` : null}
      >
        {isLoading ? (
          <p className="text-[var(--text-secondary)] px-5 py-8 text-center text-[13px]">טוען שדות...</p>
        ) : fields.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--text-secondary)]">לא הוגדרו שדות מותאמים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr><th>שם תצוגה</th><th>מפתח</th><th>סוג</th><th>חובה</th><th></th></tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id}>
                    <td className="text-[13px] font-semibold">{field.name}</td>
                    <td><span className="font-mono text-[12px] text-[var(--text-secondary)]" dir="ltr">{field.field_key}</span></td>
                    <td className="whitespace-nowrap"><Badge variant="neutral">{FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}</Badge></td>
                    <td className="whitespace-nowrap">{field.required ? <Badge variant="warning">חובה</Badge> : <span className="text-[12px] text-[var(--text-muted)]">רשות</span>}</td>
                    <td className="whitespace-nowrap">
                      <button
                        disabled={deletingId === field.id}
                        onClick={() => handleDelete(field.id)}
                        title="מחק שדה"
                        className="px-2 py-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] disabled:opacity-50 inline-flex items-center gap-1 text-[12px] font-semibold"
                      >
                        <Trash2 className="h-3.5 w-3.5" />{deletingId === field.id ? 'מוחק...' : 'מחק'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Create new field */}
      <SectionCard icon={Key} title="הוסף שדה חדש" subtitle="מפתח השדה נוצר אוטומטית משם התצוגה וניתן לעריכה" bodyClassName="p-4">
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
          <div className="mt-4 pt-4 border-t border-[var(--border-light)] flex justify-start">
            <Button type="submit" disabled={saving || !form.name.trim() || !form.field_key.trim()}>
              <Plus className="h-4 w-4" />
              {saving ? 'שומר...' : 'הוסף שדה'}
            </Button>
          </div>
        </form>
      </SectionCard>
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
      toastError('המשתמש כבר חבר בועד')
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
      toastError('שגיאה בהוספת חבר ועד')
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
      <SectionCard icon={Building} title="בניינים וועדים">
        <p className="text-[var(--text-secondary)] py-8 text-center text-[13px]">טוען נתונים...</p>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {buildings.length === 0 && (
        <SectionCard icon={Building} title="בניינים וועדים">
          <p className="text-[var(--text-secondary)] py-8 text-center text-[13px]">לא נמצאו בניינים</p>
        </SectionCard>
      )}

      {buildings.map((building) => {
        const members = membersForBuilding(building.id)
        const hasChair = members.some((m) => m.role === 'committee_chair')

        return (
          <SectionCard
            key={building.id}
            icon={Building}
            title={building.name}
            subtitle={members.length ? `${members.length} חברי ועד${hasChair ? '' : ' • לא הוגדר יו"ר'}` : 'לא הוגדרו חברי ועד'}
            actions={<Button size="sm" onClick={() => openAddMember(building)}><Plus className="h-3.5 w-3.5" />הוסף חבר ועד</Button>}
          >
            {members.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-[var(--text-secondary)]">לא הוגדרו חברי ועד לבניין זה</p>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {members.map((m) => {
                  const memberName = m.profile
                    ? [m.profile.first_name, m.profile.last_name].filter(Boolean).join(' ') || m.profile.email
                    : m.user_id
                  const initials = m.profile
                    ? [m.profile.first_name?.[0], m.profile.last_name?.[0]].filter(Boolean).join('') || '?'
                    : '?'

                  return (
                    <div key={m.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors">
                      <span className="h-8 w-8 rounded-full bg-[var(--surface-secondary)] text-[var(--primary)] flex items-center justify-center text-[12px] font-bold shrink-0">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate block">{memberName}</span>
                        {m.profile?.email && memberName !== m.profile.email && <span className="text-[11px] text-[var(--text-muted)] truncate block">{m.profile.email}</span>}
                      </div>
                      <Badge variant={m.role === 'committee_chair' ? 'warning' : 'info'}>
                        {MEMBERSHIP_ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                      <div className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
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
          </SectionCard>
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
// Tab 4 — WhatsApp (GreenAPI) integration
// ---------------------------------------------------------------------------

function WhatsappTab() {
  const [form, setForm] = useState({
    id_instance: '', api_url: '', sender_number: '', sender_label: '', enabled: false, api_token: '',
  })
  const [meta, setMeta] = useState({ status: null, last_checked_at: null, has_token: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('messaging_integrations').select('*').eq('provider', 'greenapi').maybeSingle()
    if (data) {
      setForm((p) => ({
        ...p,
        id_instance: data.id_instance || '',
        api_url: data.api_url || '',
        sender_number: data.sender_number || '',
        sender_label: data.sender_label || '',
        enabled: !!data.enabled,
        api_token: '',
      }))
      setMeta({ status: data.status, last_checked_at: data.last_checked_at, has_token: !!data.has_token })
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const set = (f) => (e) =>
    setForm((p) => ({ ...p, [f]: e?.target?.value !== undefined ? e.target.value : e }))

  const save = async () => {
    if (!form.id_instance.trim()) {
      toastError('יש להזין idInstance')
      return
    }
    setSaving(true)
    const { api_token, ...config } = form
    // Saved through the Edge Function (service role) so the token write never
    // depends on browser-side RLS.
    const { data, error } = await supabase.functions.invoke('green-whatsapp', {
      body: { action: 'save', config, api_token },
    })
    setSaving(false)
    if (error || !data?.ok) {
      toastError('שגיאה בשמירה: ' + (error?.message || data?.error || 'unknown'))
      return
    }
    setForm((p) => ({ ...p, api_token: '' }))
    resetWhatsappEnabledCache() // so an enabled/disabled change takes effect without a refresh
    toast(data.has_token ? 'נשמר. טוקן מאוחסן ✓' : 'נשמר (ללא טוקן — יש להזין טוקן)', data.has_token ? 'success' : 'error')
    load()
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    const { data, error } = await supabase.functions.invoke('green-whatsapp', { body: { action: 'status' } })
    setTesting(false)
    if (error) { setTestResult({ ok: false, text: error.message }); return }
    if (data?.error) { setTestResult({ ok: false, text: data.error === 'not_configured' ? 'יש לשמור idInstance + טוקן תחילה' : data.error }); load(); return }
    const authorized = data?.state === 'authorized'
    setTestResult({ ok: authorized, text: authorized ? 'מחובר ומאומת ✓' : `מצב: ${data?.state || 'לא ידוע'}` })
    load()
  }

  // One-time: point GreenAPI's incoming webhook here, so vendor replies
  // ("מאשר"/"מסרב") update membership_status automatically.
  const [settingUpReplies, setSettingUpReplies] = useState(false)
  const setupReplies = async () => {
    setSettingUpReplies(true); setTestResult(null)
    const { data, error } = await supabase.functions.invoke('green-whatsapp', { body: { action: 'setup-replies' } })
    setSettingUpReplies(false)
    if (error || data?.error) { setTestResult({ ok: false, text: error?.message || data?.error }); return }
    setTestResult({ ok: !!data?.ok, text: data?.ok ? 'מענה אוטומטי הופעל ✓ — תשובות "מאשר"/"מסרב" מספקים יעודכנו במערכת מעצמן' : 'GreenAPI סירב לעדכון ההגדרות' })
  }

  if (loading) return (
    <SectionCard icon={MessageCircle} title="חיבור וואטסאפ (GreenAPI)">
      <p className="text-[var(--text-secondary)] py-8 text-center text-[13px]">טוען הגדרות...</p>
    </SectionCard>
  )

  const statusTiles = [
    { label: 'חיבור', ok: form.enabled, value: form.enabled ? 'פעיל' : 'כבוי' },
    { label: 'טוקן', ok: meta.has_token, value: meta.has_token ? 'מאוחסן' : 'לא הוזן' },
    { label: 'סטטוס אחרון', ok: meta.status === 'authorized', value: meta.status || 'לא נבדק', sub: meta.last_checked_at ? new Date(meta.last_checked_at).toLocaleString('he-IL') : null },
  ]

  return (
    <div className="space-y-6" dir="rtl">
      {/* Connection status strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statusTiles.map((k) => (
          <div key={k.label} className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] flex items-center gap-3">
            <span className={`p-1.5 rounded-[var(--radius)] shrink-0 ${k.ok ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}`}>
              {k.ok ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <AlertTriangle className="h-[18px] w-[18px]" />}
            </span>
            <div className="min-w-0">
              <span className="block text-[12px] text-[var(--text-secondary)]">{k.label}</span>
              <span className="block text-[15px] font-bold text-[var(--text-primary)]" dir="auto">{k.value}</span>
              {k.sub && <span className="block text-[11px] text-[var(--text-muted)] num-tabular">{k.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <SectionCard
        icon={MessageCircle}
        title="חיבור וואטסאפ (GreenAPI)"
        subtitle="פרטי האינסטנס מקונסולת GreenAPI"
        bodyClassName="p-4 space-y-4"
      >
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          הזן את פרטי האינסטנס מקונסולת GreenAPI (idInstance, ApiTokenInstance, ובמידת הצורך apiUrl).
          הטוקן נשמר מוצפן בצד השרת ואינו מוצג חזרה — בעריכה השאר ריק כדי לא לשנותו.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="idInstance" value={form.id_instance} onChange={set('id_instance')} placeholder="1101234567" dir="ltr" />
          <FormField label="ApiTokenInstance (סודי)" type="password" value={form.api_token} onChange={set('api_token')} placeholder={meta.has_token ? 'מאוחסן — השאר ריק לשמירה' : 'הזן את הטוקן (חובה)'} dir="ltr" />
          <FormField label="apiUrl (רשות)" value={form.api_url} onChange={set('api_url')} placeholder="https://api.green-api.com" dir="ltr" />
          <FormField label="מספר השולח (וואטסאפ)" value={form.sender_number} onChange={set('sender_number')} placeholder="0501234567" dir="ltr" />
          <FormField label="תווית השולח" value={form.sender_label} onChange={set('sender_label')} placeholder="ועד הבית" />
          <FormBool label="חיבור פעיל (אפשר שליחה מהמערכת)" value={form.enabled} onChange={set('enabled')} />
        </div>

        {/* Status row */}
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[var(--text-secondary)]">טוקן:</span>
          <Badge variant={meta.has_token ? 'success' : 'danger'}>{meta.has_token ? 'מאוחסן' : 'לא הוזן'}</Badge>
          <span className="text-[var(--text-secondary)] mr-2">סטטוס אחרון:</span>
          {meta.status
            ? <Badge variant={meta.status === 'authorized' ? 'success' : 'warning'}>{meta.status}</Badge>
            : <span className="text-[var(--text-muted)]">לא נבדק</span>}
          {meta.last_checked_at && <span className="text-[var(--text-muted)] num-tabular">· {new Date(meta.last_checked_at).toLocaleString('he-IL')}</span>}
        </div>

        {testResult && (
          <div className={`rounded-[var(--radius)] p-3 text-[13px] ${testResult.ok ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}`}>
            {testResult.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--border-light)]">
          <Button onClick={save} disabled={saving}>{saving ? 'שומר...' : 'שמור הגדרות'}</Button>
          <Button variant="outline" onClick={test} disabled={testing}>{testing ? 'בודק...' : 'בדוק חיבור'}</Button>
          <Button variant="outline" onClick={setupReplies} disabled={settingUpReplies}>
            {settingUpReplies ? 'מגדיר...' : '🔁 הפעל מענה אוטומטי מספקים'}
          </Button>
        </div>
      </SectionCard>

      <div className="rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-light)] p-4 text-[12px] text-[var(--warning)] leading-relaxed flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span>ערוץ זה מיועד לפנייה לספקים (יזום ע"י הוועד). הודעות לדיירים — ובמיוחד דרישות תשלום/גבייה — יישארו יזומות-ידנית ולא יישלחו אוטומטית דרכו.</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'users', label: 'משתמשים', icon: Users, desc: 'תפקידים והרשאות גישה' },
  { key: 'fields', label: 'שדות מותאמים', icon: Database, desc: 'שדות נוספים לכרטיס דירה' },
  { key: 'buildings', label: 'בניינים ועדים', icon: Building, desc: 'חברי ועד לכל בניין' },
  { key: 'whatsapp', label: 'וואטסאפ', icon: MessageCircle, desc: 'חיבור GreenAPI לפניות לספקים' },
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

  const current = TABS.find((t) => t.key === activeTab) || TABS[0]

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הגדרות מערכת</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">ניהול משתמשים, שדות מותאמים, ועדי בניינים וחיבור וואטסאפ</p>
        </div>
      </div>

      {/* Mobile / tablet section switcher */}
      <div className="xl:hidden space-y-2">
        <TabGroup tabs={TABS.map(({ key, label, icon }) => ({ key, label, icon }))} activeTab={activeTab} onChange={setActiveTab} />
        <p className="text-[12px] text-[var(--text-muted)]">{current.desc}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Section nav */}
        <nav className="hidden xl:block xl:col-span-3 xl:sticky xl:top-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-2 space-y-0.5" aria-label="אזורי הגדרות">
          {TABS.map((t) => {
            const active = t.key === activeTab
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] text-right transition-colors ${active ? 'bg-[var(--surface-container)] text-[var(--primary-dark)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                <span className={`p-1.5 rounded-[var(--radius)] shrink-0 text-[var(--primary)] ${active ? 'bg-[var(--surface)]' : 'bg-[var(--surface-secondary)]'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] ${active ? 'font-bold' : 'font-semibold'}`}>{t.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)] truncate">{t.desc}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* Section content */}
        <div className="xl:col-span-9 space-y-4 min-w-0">
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'fields' && <CustomFieldsTab />}
          {activeTab === 'buildings' && <BuildingsCommitteesTab />}
          {activeTab === 'whatsapp' && <WhatsappTab />}
        </div>
      </div>
    </div>
  )
}
