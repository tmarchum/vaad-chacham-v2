import { describe, it, expect } from 'vitest'
import { upcomingMaintenance } from './maintenance'

// Build a date N days from now as YYYY-MM-DD.
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

describe('upcomingMaintenance', () => {
  it('includes overdue and soon-due items, excludes far-future', () => {
    const list = upcomingMaintenance({
      assets: [{ name: 'מעלית', next_service: inDays(10) }, { name: 'משאבה', next_service: inDays(400) }],
      compliance: [{ title: 'ביטוח', expiry_date: inDays(-5) }],
      recurringTasks: [{ title: 'בדיקת מעלית', next_due_date: inDays(3), is_required_by_law: true }],
    }, 45)
    const titles = list.map((i) => i.title)
    expect(titles).toContain('אישור פג תוקף: ביטוח')      // overdue
    expect(titles).toContain('בדיקת מעלית')                 // soon + legal
    expect(titles).toContain('טיפול: מעלית')                // 10 days
    expect(titles.some((t) => t.includes('משאבה'))).toBe(false) // 400 days → excluded
  })

  it('sorts overdue first, then soonest', () => {
    const list = upcomingMaintenance({
      assets: [{ name: 'A', next_service: inDays(20) }, { name: 'B', next_service: inDays(-2) }],
    })
    expect(list[0].overdue).toBe(true)
    expect(list[0].title).toContain('B')
  })

  it('flags legal (required-by-law) items', () => {
    const list = upcomingMaintenance({
      recurringTasks: [{ title: 'גז', next_due_date: inDays(5), is_required_by_law: true }],
    })
    expect(list[0].requiredByLaw).toBe(true)
  })
})
