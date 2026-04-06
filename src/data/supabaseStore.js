import { supabase } from '@/lib/supabase'

// camelCase ↔ snake_case field mappings per table
// Most fields map directly (supabase returns snake_case, we keep as-is for now)
// Only remap fields that differ between old localStorage keys and new DB columns

const TABLE_MAP = {
  buildings: 'buildings',
  units: 'units',
  unitResidents: 'unit_residents',
  residents: 'unit_residents',  // alias
  payments: 'payments',
  bankTransactions: 'payments', // deprecated, use payments
  expenses: 'expenses',
  issues: 'issues',
  vendors: 'vendors',
  compliance: 'compliance',
  recurringTasks: 'recurring_tasks',
  buildingAssets: 'building_assets',
  quotes: 'quotes',
  workOrders: 'work_orders',
  announcements: 'announcements',
  documents: 'documents',
  meetingMinutes: 'meeting_minutes',
  profiles: 'profiles',
  buildingMemberships: 'building_memberships',
  unitFieldDefinitions: 'unit_field_definitions',
}

// Normalize a DB row to app format (snake_case → app fields)
// Keep snake_case but also add camelCase aliases for backward compat
function normalizeRow(row) {
  if (!row) return null
  const out = { ...row }
  // Ensure 'id' exists (Supabase UUIDs)
  // Map common snake_case → camelCase for backward compat with existing pages
  if ('building_id' in row)   out.buildingId   = row.building_id
  if ('unit_id' in row)       out.unitId       = row.unit_id
  if ('paid_at' in row)       out.paidAt       = row.paid_at
  if ('created_at' in row)    out.createdAt    = row.created_at
  if ('updated_at' in row)    out.updatedAt    = row.updated_at
  if ('reported_at' in row)   out.reportedAt   = row.reported_at
  if ('resolved_at' in row)   out.resolvedAt   = row.resolved_at
  if ('is_blacklisted' in row) out.is_blacklisted = row.is_blacklisted
  if ('next_due_date' in row)  out.next_due_date = row.next_due_date
  if ('is_required_by_law' in row) out.is_required_by_law = row.is_required_by_law
  if ('expiry_date' in row)    out.expiry_date  = row.expiry_date
  if ('issue_date' in row)     out.issue_date   = row.issue_date
  if ('document_number' in row) out.document_number = row.document_number
  if ('vendor_name' in row)    out.vendor_name  = row.vendor_name
  if ('install_date' in row)   out.installDate  = row.install_date
  if ('warranty_end' in row)   out.warrantyEnd  = row.warranty_end
  if ('last_service' in row)   out.lastService  = row.last_service
  if ('next_service' in row)   out.nextService  = row.next_service
  if ('published_at' in row)   out.publishedAt  = row.published_at
  if ('expires_at' in row)     out.expiresAt    = row.expires_at
  if ('uploaded_at' in row)    out.uploadedAt   = row.uploaded_at
  if ('file_size' in row)      out.fileSize     = row.file_size
  if ('sent_at' in row)        out.sentAt       = row.sent_at
  if ('responded_at' in row)   out.respondedAt  = row.responded_at
  if ('valid_until' in row)    out.validUntil   = row.valid_until
  if ('scheduled_date' in row) out.scheduledDate = row.scheduled_date
  if ('completed_date' in row) out.completedDate = row.completed_date
  if ('estimated_cost' in row) out.estimatedCost = row.estimated_cost
  if ('actual_cost' in row)    out.actualCost   = row.actual_cost
  if ('approved_by' in row)    out.approvedBy   = row.approved_by
  if ('approved_at' in row)    out.approvedAt   = row.approved_at
  if ('resident_feedback' in row) out.residentFeedback = row.resident_feedback
  if ('total_units' in row)    out.totalUnits   = row.total_units
  if ('monthly_fee' in row)    out.monthlyFee   = row.monthly_fee
  if ('board_member' in row)   out.board_member = row.board_member
  if ('house_number' in row)   out.house_number = row.house_number
  if ('parking_spots' in row)  out.parkingSpots = row.parking_spots
  if ('storage_number' in row) out.storageNumber = row.storage_number
  if ('key_numbers' in row)    out.keyNumbers   = row.key_numbers
  if ('parking_gate_phone' in row) out.parkingGatePhone = row.parking_gate_phone
  if ('custom_fields' in row)  out.customFields = row.custom_fields
  if ('first_name' in row)     out.firstName    = row.first_name
  if ('last_name' in row)      out.lastName     = row.last_name
  if ('resident_type' in row)  out.residentType = row.resident_type
  if ('is_primary' in row)     out.isPrimary    = row.is_primary
  if ('owner_first_name' in row) out.ownerFirstName = row.owner_first_name
  if ('owner_last_name' in row)  out.ownerLastName  = row.owner_last_name
  if ('owner_phone' in row)    out.ownerPhone   = row.owner_phone
  if ('owner_email' in row)    out.ownerEmail   = row.owner_email
  if ('move_in_date' in row)   out.moveInDate   = row.move_in_date
  if ('move_out_date' in row)  out.moveOutDate  = row.move_out_date
  if ('year_built' in row)     out.yearBuilt    = row.year_built
  if ('management_company' in row) out.managementCompany = row.management_company
  if ('bank_name' in row)      out.bankName     = row.bank_name
  if ('account_number' in row) out.accountNumber = row.account_number
  if ('board_member_discount' in row) out.boardMemberDiscount = row.board_member_discount
  if ('available_24_7' in row) out.available247  = row.available_24_7
  if ('license_number' in row) out.licenseNumber = row.license_number
  if ('insurance_expiry' in row) out.insuranceExpiry = row.insurance_expiry
  if ('service_area' in row)   out.serviceArea  = row.service_area
  if ('water_pump' in row)     out.water_pump   = row.water_pump
  if ('fire_suppression' in row) out.fire_suppression = row.fire_suppression
  if ('shared_roof' in row)    out.shared_roof  = row.shared_roof
  if ('next_meeting' in row)   out.nextMeeting  = row.next_meeting
  if ('total_units' in row && 'meeting_minutes' in (row._table||{})) out.totalUnits = row.total_units
  return out
}

// Normalize an app data object → DB columns (camelCase → snake_case)
function toDbRow(data) {
  const out = { ...data }
  // Remove app-only computed fields
  delete out.id
  delete out.createdAt
  delete out.updatedAt
  // Map camelCase → snake_case
  const remap = {
    buildingId: 'building_id', unitId: 'unit_id', paidAt: 'paid_at',
    reportedAt: 'reported_at', resolvedAt: 'resolved_at',
    next_due_date: 'next_due_date', is_required_by_law: 'is_required_by_law',
    expiry_date: 'expiry_date', issue_date: 'issue_date',
    document_number: 'document_number', vendor_name: 'vendor_name',
    installDate: 'install_date', warrantyEnd: 'warranty_end',
    lastService: 'last_service', nextService: 'next_service',
    publishedAt: 'published_at', expiresAt: 'expires_at',
    uploadedAt: 'uploaded_at', fileSize: 'file_size',
    sentAt: 'sent_at', respondedAt: 'responded_at', validUntil: 'valid_until',
    scheduledDate: 'scheduled_date', completedDate: 'completed_date',
    estimatedCost: 'estimated_cost', actualCost: 'actual_cost',
    approvedBy: 'approved_by', approvedAt: 'approved_at',
    residentFeedback: 'resident_feedback', totalUnits: 'total_units',
    monthlyFee: 'monthly_fee', board_member: 'board_member',
    house_number: 'house_number', parkingSpots: 'parking_spots',
    storageNumber: 'storage_number', keyNumbers: 'key_numbers',
    parkingGatePhone: 'parking_gate_phone', customFields: 'custom_fields',
    firstName: 'first_name', lastName: 'last_name',
    residentType: 'resident_type', isPrimary: 'is_primary',
    ownerFirstName: 'owner_first_name', ownerLastName: 'owner_last_name',
    ownerPhone: 'owner_phone', ownerEmail: 'owner_email',
    moveInDate: 'move_in_date', moveOutDate: 'move_out_date',
    yearBuilt: 'year_built', managementCompany: 'management_company',
    bankName: 'bank_name', accountNumber: 'account_number',
    boardMemberDiscount: 'board_member_discount', available247: 'available_24_7',
    licenseNumber: 'license_number', insuranceExpiry: 'insurance_expiry',
    serviceArea: 'service_area', nextMeeting: 'next_meeting',
    is_blacklisted: 'is_blacklisted', ownerName: 'owner_name',
  }
  Object.entries(remap).forEach(([camel, snake]) => {
    if (camel in out) {
      if (!(snake in out)) out[snake] = out[camel]
      if (camel !== snake) delete out[camel]
    }
  })
  // Remove any remaining camelCase keys (contain uppercase) — these are
  // app-side aliases added by normalizeRow that don't exist as DB columns.
  // Also remove known app-only computed fields.
  const APP_ONLY = new Set([
    'buildingId', 'unitId', 'paidAt', 'createdAt', 'updatedAt',
    'reportedAt', 'resolvedAt', 'installDate', 'warrantyEnd', 'lastService',
    'nextService', 'publishedAt', 'expiresAt', 'uploadedAt', 'fileSize',
    'sentAt', 'respondedAt', 'validUntil', 'scheduledDate', 'completedDate',
    'estimatedCost', 'actualCost', 'approvedBy', 'approvedAt',
    'residentFeedback', 'totalUnits', 'monthlyFee', 'parkingSpots',
    'storageNumber', 'keyNumbers', 'parkingGatePhone', 'customFields',
    'firstName', 'lastName', 'residentType', 'isPrimary',
    'ownerFirstName', 'ownerLastName', 'ownerPhone', 'ownerEmail',
    'moveInDate', 'moveOutDate', 'yearBuilt', 'managementCompany',
    'bankName', 'accountNumber', 'boardMemberDiscount', 'available247',
    'licenseNumber', 'insuranceExpiry', 'serviceArea', 'nextMeeting', 'ownerName',
    // app runtime fields
    '_key', '_table',
  ])
  Object.keys(out).forEach(k => {
    // Remove if it's a known app-only field OR if it has a capital letter (camelCase leftover)
    if (APP_ONLY.has(k) || /[A-Z]/.test(k) || out[k] === undefined) {
      delete out[k]
    }
  })
  return out
}

// Emit visible error toast + log to console
function emitError(operation, tableName, error) {
  const msg = error?.message || String(error)
  console.error(`[store.${tableName}.${operation}]`, error)
  // Map common Postgres/Supabase error codes to Hebrew
  let friendly = `שגיאה בשמירת נתונים: ${msg}`
  if (msg.includes('violates row-level security')) {
    friendly = 'אין הרשאה לבצע פעולה זו (RLS). נסה להתנתק ולהתחבר מחדש.'
  } else if (msg.includes('violates foreign key')) {
    friendly = 'שגיאת קישור נתונים — ייתכן שרשומה מקושרת נמחקה.'
  } else if (msg.includes('violates not-null')) {
    friendly = 'שדה חובה חסר — אנא מלא את כל השדות הנדרשים.'
  } else if (msg.includes('duplicate key') || msg.includes('already exists')) {
    friendly = 'רשומה עם ערך זה כבר קיימת.'
  } else if (msg.includes('JWT') || msg.includes('401') || msg.includes('auth')) {
    friendly = 'פג תוקף ההתחברות — אנא התנתק והתחבר מחדש.'
  }
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: friendly, type: 'error' } }))
}

function emitSuccess(message) {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type: 'success' } }))
}

function createCollection(tableName) {
  const table = TABLE_MAP[tableName] || tableName

  return {
    async list(filters = {}) {
      let q = supabase.from(table).select('*').order('created_at', { ascending: false })
      Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val) })
      const { data, error } = await q
      if (error) { emitError('list', tableName, error); return [] }
      return (data || []).map(normalizeRow)
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
      if (error) { emitError('get', tableName, error); return null }
      return normalizeRow(data)
    },

    async create(itemData) {
      const row = toDbRow(itemData)
      const { data, error } = await supabase.from(table).insert(row).select().single()
      if (error) { emitError('create', tableName, error); return null }
      emitSuccess('נשמר בהצלחה ✓')
      return normalizeRow(data)
    },

    async update(id, itemData) {
      const row = toDbRow(itemData)
      row.updated_at = new Date().toISOString()
      const { data, error } = await supabase.from(table).update(row).eq('id', id).select().single()
      if (error) { emitError('update', tableName, error); return null }
      emitSuccess('עודכן בהצלחה ✓')
      return normalizeRow(data)
    },

    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) { emitError('remove', tableName, error); return false }
      return true
    },

    async bulkCreate(items) {
      if (!items?.length) return []
      const rows = items.map(toDbRow)
      const { data, error } = await supabase.from(table).insert(rows).select()
      if (error) { emitError('bulkCreate', tableName, error); return [] }
      return (data || []).map(normalizeRow)
    },
  }
}

// Create all collections
const supabaseStore = {}
Object.keys(TABLE_MAP).forEach(name => {
  supabaseStore[name] = createCollection(name)
})

export default supabaseStore
export { supabaseStore as store }
