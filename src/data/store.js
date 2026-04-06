import { parseJson } from '@/lib/utils'

const STORAGE_PREFIX = 'vc_'

// ---------------------------------------------------------------------------
// Collection factory
// ---------------------------------------------------------------------------

function createCollection(name) {
  const key = `${STORAGE_PREFIX}${name}`

  function readAll() {
    return parseJson(localStorage.getItem(key), [])
  }

  function writeAll(items) {
    localStorage.setItem(key, JSON.stringify(items))
  }

  return {
    list() {
      return readAll()
    },

    get(id) {
      return readAll().find((item) => item.id === id) ?? null
    },

    create(data) {
      const items = readAll()
      const newItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      }
      items.push(newItem)
      writeAll(items)
      return newItem
    },

    update(id, data) {
      const items = readAll()
      const idx = items.findIndex((item) => item.id === id)
      if (idx === -1) return null
      items[idx] = {
        ...items[idx],
        ...data,
        id, // protect id from being overwritten
        updatedAt: new Date().toISOString(),
      }
      writeAll(items)
      return items[idx]
    },

    remove(id) {
      const items = readAll()
      const filtered = items.filter((item) => item.id !== id)
      if (filtered.length === items.length) return false
      writeAll(filtered)
      return true
    },

    bulkCreate(dataArray) {
      const items = readAll()
      const now = new Date().toISOString()
      const newItems = dataArray.map((data) => ({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...data,
      }))
      writeAll([...items, ...newItems])
      return newItems
    },
  }
}

// ---------------------------------------------------------------------------
// All collections
// ---------------------------------------------------------------------------

export const COLLECTION_NAMES = [
  'buildings',
  'units',
  'residents',
  'payments',
  'bankTransactions',
  'expenses',
  'issues',
  'vendors',
  'compliance',
  'recurringTasks',
  'quotes',
  'announcements',
  'documents',
  'meetingMinutes',
  'buildingAssets',
  'workOrders',
]

export const store = Object.fromEntries(
  COLLECTION_NAMES.map((name) => [name, createCollection(name)])
)

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_KEY = `${STORAGE_PREFIX}_seeded`

function seedIfNeeded() {
  if (localStorage.getItem(SEED_KEY)) return

  // Buildings
  const buildings = store.buildings.bulkCreate([
    {
      name: 'בניין הזית',
      address: 'רחוב הזית 12, תל אביב',
      totalUnits: 4,
      monthlyFee: 450,
      balance: 3200,
    },
    {
      name: 'בניין התמר',
      address: 'רחוב התמר 8, תל אביב',
      totalUnits: 4,
      monthlyFee: 500,
      balance: 1800,
    },
  ])

  const b1 = buildings[0].id
  const b2 = buildings[1].id

  // Units — 4 per building
  const units = store.units.bulkCreate([
    { buildingId: b1, number: '1', floor: 0, rooms: 3, area: 75, ownerName: 'דוד כהן', phone: '050-1234567', email: 'david@example.com' },
    { buildingId: b1, number: '2', floor: 1, rooms: 4, area: 90, ownerName: 'שרה לוי', phone: '052-2345678', email: 'sara@example.com' },
    { buildingId: b1, number: '3', floor: 1, rooms: 4, area: 90, ownerName: 'יוסי אברהם', phone: '054-3456789', email: 'yossi@example.com' },
    { buildingId: b1, number: '4', floor: 2, rooms: 5, area: 110, ownerName: 'רחל מזרחי', phone: '053-4567890', email: 'rachel@example.com' },
    { buildingId: b2, number: '1', floor: 0, rooms: 3, area: 70, ownerName: 'משה ישראלי', phone: '050-5678901', email: 'moshe@example.com' },
    { buildingId: b2, number: '2', floor: 1, rooms: 4, area: 85, ownerName: 'מיכל גולן', phone: '052-6789012', email: 'michal@example.com' },
    { buildingId: b2, number: '3', floor: 1, rooms: 4, area: 85, ownerName: 'אבי פרץ', phone: '054-7890123', email: 'avi@example.com' },
    { buildingId: b2, number: '4', floor: 2, rooms: 5, area: 105, ownerName: 'נועה ברק', phone: '053-8901234', email: 'noa@example.com' },
  ])

  // Issues
  store.issues.bulkCreate([
    {
      buildingId: b1,
      title: 'נזילה בחדר מדרגות',
      description: 'נזילת מים מהגג לחדר המדרגות בקומה 2',
      status: 'open',
      priority: 'high',
      reportedBy: units[0].id,
      reportedAt: '2026-03-15T10:00:00.000Z',
    },
    {
      buildingId: b1,
      title: 'תאורה לא עובדת בחניון',
      description: 'שתי נורות בחניון התת-קרקעי לא דולקות',
      status: 'in_progress',
      priority: 'medium',
      reportedBy: units[1].id,
      reportedAt: '2026-03-20T08:30:00.000Z',
    },
    {
      buildingId: b2,
      title: 'דלת כניסה לא נסגרת',
      description: 'מנגנון הסגירה האוטומטית של דלת הכניסה הראשית לא תקין',
      status: 'open',
      priority: 'high',
      reportedBy: units[4].id,
      reportedAt: '2026-03-25T14:00:00.000Z',
    },
  ])

  // Vendors
  store.vendors.bulkCreate([
    {
      name: 'שירותי אינסטלציה מהירים',
      category: 'אינסטלציה',
      phone: '03-9876543',
      email: 'plumber@example.com',
      notes: 'זמין 24/7 לחירום',
    },
    {
      name: 'חברת החשמל של יוסי',
      category: 'חשמל',
      phone: '03-1122334',
      email: 'electric@example.com',
      notes: 'חשמלאי מוסמך, מחירים סבירים',
    },
  ])

  // Payments
  store.payments.bulkCreate([
    { buildingId: b1, unitId: units[0].id, amount: 450, month: '2026-03', status: 'paid', paidAt: '2026-03-01T09:00:00.000Z', method: 'העברה בנקאית' },
    { buildingId: b1, unitId: units[1].id, amount: 450, month: '2026-03', status: 'paid', paidAt: '2026-03-05T11:00:00.000Z', method: 'אשראי' },
    { buildingId: b1, unitId: units[2].id, amount: 450, month: '2026-03', status: 'pending', paidAt: null, method: null },
    { buildingId: b1, unitId: units[3].id, amount: 450, month: '2026-02', status: 'overdue', paidAt: null, method: null },
    { buildingId: b2, unitId: units[4].id, amount: 500, month: '2026-03', status: 'paid', paidAt: '2026-03-02T10:00:00.000Z', method: 'העברה בנקאית' },
    { buildingId: b2, unitId: units[5].id, amount: 500, month: '2026-03', status: 'paid', paidAt: '2026-03-03T14:30:00.000Z', method: 'אשראי' },
  ])

  // Building Assets
  store.buildingAssets.bulkCreate([
    { buildingId: b1, name: 'מעלית נוסעים', category: 'מעלית', manufacturer: 'שינדלר', model: 'S300', installDate: '2015-06-01', warrantyEnd: '2025-06-01', lastService: '2026-02-15', nextService: '2026-05-15', status: 'active', notes: 'תחזוקה רבעונית' },
    { buildingId: b1, name: 'משאבת מים ראשית', category: 'אינסטלציה', manufacturer: 'גרונדפוס', model: 'CM5', installDate: '2018-03-10', warrantyEnd: '2023-03-10', lastService: '2026-01-20', nextService: '2026-07-20', status: 'active', notes: '' },
    { buildingId: b1, name: 'לוח חשמל ראשי', category: 'חשמל', manufacturer: 'חגר', model: 'LP-400', installDate: '2010-01-01', warrantyEnd: '2020-01-01', lastService: '2025-12-01', nextService: '2026-12-01', status: 'active', notes: 'בדיקה שנתית' },
    { buildingId: b1, name: 'מערכת כיבוי אש', category: 'בטיחות', manufacturer: 'מבטחים', model: 'FS-200', installDate: '2016-09-15', warrantyEnd: '2026-09-15', lastService: '2026-01-10', nextService: '2026-07-10', status: 'active', notes: 'בדיקה חצי-שנתית' },
    { buildingId: b2, name: 'מעלית נוסעים', category: 'מעלית', manufacturer: 'אוטיס', model: 'Gen2', installDate: '2012-04-01', warrantyEnd: '2022-04-01', lastService: '2026-03-01', nextService: '2026-06-01', status: 'active', notes: '' },
    { buildingId: b2, name: 'מערכת אינטרקום', category: 'חשמל', manufacturer: 'ויזיט', model: 'V100', installDate: '2020-01-15', warrantyEnd: '2025-01-15', lastService: '2025-08-01', nextService: '2026-08-01', status: 'active', notes: '' },
    { buildingId: b2, name: 'דוד שמש משותף', category: 'אינסטלציה', manufacturer: 'כרומגן', model: 'SL-300', installDate: '2019-05-20', warrantyEnd: '2029-05-20', lastService: '2026-02-01', nextService: '2026-08-01', status: 'active', notes: 'ניקוי שנתי' },
  ])

  // Quotes
  const vendors = store.vendors.list()
  const issues = store.issues.list()
  store.quotes.bulkCreate([
    { issueId: issues[0]?.id, vendorId: vendors[0]?.id, buildingId: b1, description: 'תיקון נזילה בחדר מדרגות - כולל חומרים', amount: 1200, status: 'pending', sentAt: '2026-03-16T09:00:00.000Z', respondedAt: null, validUntil: '2026-04-16', notes: '' },
    { issueId: issues[0]?.id, vendorId: vendors[1]?.id, buildingId: b1, description: 'בדיקה ותיקון נזילה', amount: 950, status: 'accepted', sentAt: '2026-03-16T09:00:00.000Z', respondedAt: '2026-03-17T14:00:00.000Z', validUntil: '2026-04-16', notes: 'כולל אחריות לחודש' },
    { issueId: issues[2]?.id, vendorId: vendors[0]?.id, buildingId: b2, description: 'החלפת מנגנון סגירה אוטומטית לדלת כניסה', amount: 800, status: 'pending', sentAt: '2026-03-26T10:00:00.000Z', respondedAt: null, validUntil: '2026-04-26', notes: '' },
  ])

  // Announcements
  store.announcements.bulkCreate([
    { buildingId: b1, title: 'עבודות תחזוקה בלובי', content: 'ביום רביעי 2.4 יתבצעו עבודות צביעה בלובי הבניין. נא להימנע ממגע עם הקירות.', type: 'maintenance', priority: 'normal', publishedAt: '2026-03-28T08:00:00.000Z', expiresAt: '2026-04-03', author: 'ועד הבית' },
    { buildingId: b1, title: 'אסיפת דיירים שנתית', content: 'אסיפת דיירים שנתית תתקיים ביום חמישי 10.4 בשעה 20:00 בלובי הבניין. נוכחות חובה.', type: 'meeting', priority: 'high', publishedAt: '2026-03-25T10:00:00.000Z', expiresAt: '2026-04-10', author: 'ועד הבית' },
    { buildingId: b2, title: 'הפסקת מים', content: 'ביום ראשון 30.3 בשעות 08:00-12:00 תתבצע הפסקת מים לצורך תיקון צנרת. נא להיערך בהתאם.', type: 'urgent', priority: 'urgent', publishedAt: '2026-03-28T15:00:00.000Z', expiresAt: '2026-03-30', author: 'ועד הבית' },
  ])

  // Documents
  store.documents.bulkCreate([
    { buildingId: b1, title: 'פוליסת ביטוח בניין 2026', type: 'insurance', category: 'ביטוח', uploadedAt: '2026-01-15T10:00:00.000Z', expiresAt: '2027-01-15', notes: 'ביטוח מקיף - הפניקס', fileSize: '2.4MB' },
    { buildingId: b1, title: 'פרוטוקול אסיפת דיירים 2025', type: 'protocol', category: 'פרוטוקולים', uploadedAt: '2025-12-20T14:00:00.000Z', expiresAt: null, notes: '', fileSize: '1.1MB' },
    { buildingId: b1, title: 'תקנון הבניין', type: 'bylaws', category: 'תקנון', uploadedAt: '2020-06-01T08:00:00.000Z', expiresAt: null, notes: 'תקנון מוסכם - עודכן 2020', fileSize: '850KB' },
    { buildingId: b2, title: 'אישור בדיקת מעלית 2026', type: 'inspection', category: 'בדיקות', uploadedAt: '2026-03-01T09:00:00.000Z', expiresAt: '2027-03-01', notes: 'בדיקת מכון התקנים', fileSize: '500KB' },
    { buildingId: b2, title: 'הסכם ניהול - חברת ניהול', type: 'contract', category: 'חוזים', uploadedAt: '2025-07-01T10:00:00.000Z', expiresAt: '2026-07-01', notes: '', fileSize: '3.2MB' },
  ])

  // Meeting Minutes
  store.meetingMinutes.bulkCreate([
    { buildingId: b1, title: 'אסיפת דיירים שנתית 2025', date: '2025-12-15T19:00:00.000Z', attendees: 6, totalUnits: 4, type: 'annual', summary: 'אושר תקציב 2026, נבחר ועד חדש, דיון בנושא שיפוץ חדר מדרגות', decisions: 'אישור תקציב 2026: 21,600 ש"ח\nשיפוץ חדר מדרגות: אושר בתקציב 8,000 ש"ח\nהרכב ועד: דוד כהן (יו"ר), שרה לוי (גזברית)', nextMeeting: '2026-04-10', author: 'שרה לוי' },
    { buildingId: b1, title: 'ישיבת ועד - תחזוקה שוטפת', date: '2026-02-20T20:00:00.000Z', attendees: 3, totalUnits: 4, type: 'committee', summary: 'דיון בנזילה בחדר מדרגות, סקירת הצעות מחיר מספקים', decisions: 'קבלת הצעת מחיר של חברת החשמל של יוסי\nתיקון צפוי לסוף מרץ', nextMeeting: null, author: 'דוד כהן' },
  ])

  // Work Orders
  store.workOrders.bulkCreate([
    { buildingId: b1, issueId: issues[0]?.id, vendorId: vendors[1]?.id, quoteId: null, title: 'תיקון נזילה - חדר מדרגות קומה 2', description: 'נזילת מים מהגג לחדר המדרגות', status: 'scheduled', priority: 'high', scheduledDate: '2026-04-02T09:00:00.000Z', completedDate: null, estimatedCost: 950, actualCost: null, approvedBy: 'דוד כהן', approvedAt: '2026-03-18T10:00:00.000Z', notes: 'ספק אישר הגעה', rating: null, residentFeedback: null },
    { buildingId: b1, issueId: issues[1]?.id, vendorId: vendors[1]?.id, quoteId: null, title: 'החלפת תאורה בחניון', description: 'החלפת שתי נורות LED בחניון', status: 'in_progress', priority: 'medium', scheduledDate: '2026-03-28T14:00:00.000Z', completedDate: null, estimatedCost: 350, actualCost: null, approvedBy: 'דוד כהן', approvedAt: '2026-03-22T08:00:00.000Z', notes: '', rating: null, residentFeedback: null },
  ])

  localStorage.setItem(SEED_KEY, 'true')
}

// Run seed on import
seedIfNeeded()

export default store
