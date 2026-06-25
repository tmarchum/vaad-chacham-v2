import { describe, it, expect } from 'vitest'
import { rankVendorsForIssue, scoreVendorForIssue } from './vendorMatch'

const elevatorPro = { id: 'a', name: 'מעליות כהן', category: 'מעליות', rating: 5, available_24_7: true, license_number: 'L1' }
const gardener = { id: 'b', name: 'גינון ירוק', category: 'גינון', rating: 4 }
const plumber = { id: 'c', name: 'שרברב דוד', category: 'אינסטלציה', rating: 3, license_number: 'L2' }
const blacklisted = { id: 'd', name: 'גרוע', category: 'מעליות', rating: 1, is_blacklisted: true }

describe('rankVendorsForIssue', () => {
  it('matches issue category to vendor via synonyms (מעלית↔מעליות) and ranks it first', () => {
    const issue = { category: 'מעלית', priority: 'urgent' }
    const ranked = rankVendorsForIssue(issue, [gardener, elevatorPro, plumber])
    expect(ranked[0].vendor.id).toBe('a')
    expect(ranked[0].reasons).toContain('התמחות מתאימה')
    expect(ranked[0].reasons).toContain('זמין 24/7')
  })

  it('excludes blacklisted vendors entirely', () => {
    const issue = { category: 'מעלית', priority: 'high' }
    const ranked = rankVendorsForIssue(issue, [blacklisted, elevatorPro])
    expect(ranked.map((r) => r.vendor.id)).not.toContain('d')
  })

  it('drops vendors with no category relation (score 0)', () => {
    const issue = { category: 'מעלית' }
    const ranked = rankVendorsForIssue(issue, [gardener])
    expect(ranked).toHaveLength(0)
  })

  it('matches plumbing synonyms (אינסטלציה ↔ נזילת מים title)', () => {
    const issue = { category: '', title: 'נזילת מים בלובי', priority: 'high' }
    const ranked = rankVendorsForIssue(issue, [plumber, gardener])
    expect(ranked[0].vendor.id).toBe('c')
  })
})

describe('scoreVendorForIssue warnings', () => {
  it('warns and penalizes expired insurance', () => {
    const v = { name: 'x', category: 'מעליות', rating: 5, insurance_expiry: '2020-01-01' }
    const r = scoreVendorForIssue({ category: 'מעלית' }, v)
    expect(r.warnings).toContain('ביטוח פג תוקף')
  })
  it('warns when urgent but not 24/7', () => {
    const r = scoreVendorForIssue({ category: 'גינון', priority: 'urgent' }, gardener, { urgent: true })
    expect(r.warnings).toContain('לא מסומן כזמין 24/7')
  })
})
