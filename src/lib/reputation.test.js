import { describe, it, expect } from 'vitest'
import { vendorReputation } from './reputation'

const v = { id: 'v1', rating: 3 }
const jobs = (ratings) => ratings.map((r, i) => ({ id: `w${i}`, vendor_id: 'v1', rating: r }))

describe('vendorReputation', () => {
  it('averages rated jobs over the stored rating', () => {
    const r = vendorReputation(v, jobs([4, 5, 3]))
    expect(r.avg).toBe(4)
    expect(r.jobCount).toBe(3)
  })

  it('falls back to the stored rating when no rated jobs', () => {
    expect(vendorReputation(v, []).avg).toBe(3)
    expect(vendorReputation(v, []).jobCount).toBe(0)
  })

  it('suggests blacklist after 3+ jobs averaging < 2', () => {
    const r = vendorReputation(v, jobs([1, 2, 1]))
    expect(r.flag).toBe('blacklist')
  })

  it('flags watch after 2+ jobs averaging < 3', () => {
    expect(vendorReputation(v, jobs([2, 3])).flag).toBe('watch')
  })

  it('marks a top vendor at 4.5+ over 3+ jobs', () => {
    expect(vendorReputation(v, jobs([5, 5, 4])).flag).toBe('top')
  })

  it('ignores other vendors jobs', () => {
    const r = vendorReputation(v, [{ vendor_id: 'other', rating: 1 }, { vendor_id: 'v1', rating: 5 }])
    expect(r.jobCount).toBe(1)
    expect(r.avg).toBe(5)
  })
})
