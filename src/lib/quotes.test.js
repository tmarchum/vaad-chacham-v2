import { describe, it, expect } from 'vitest'
import { analyzeQuotes } from './quotes'

const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
const past = '2020-01-01'

describe('analyzeQuotes', () => {
  it('recommends the lowest valid quote and computes spread', () => {
    const r = analyzeQuotes([
      { id: '1', amount: 1000, vendor_id: 'a' },
      { id: '2', amount: 1500, vendor_id: 'b' },
      { id: '3', amount: 1200, vendor_id: 'c' },
    ])
    expect(r.recommended.id).toBe('1')
    expect(r.count).toBe(3)
    expect(r.spreadPct).toBe(50) // (1500-1000)/1000
  })

  it('ignores rejected and expired quotes', () => {
    const r = analyzeQuotes([
      { id: '1', amount: 1000, status: 'rejected' },
      { id: '2', amount: 1500, valid_until: past },
      { id: '3', amount: 1200, valid_until: future },
    ])
    expect(r.count).toBe(1)
    expect(r.recommended.id).toBe('3')
  })

  it('flags when fewer than the required minimum quotes', () => {
    const r = analyzeQuotes([{ id: '1', amount: 1000 }], { requireMin: 3 })
    expect(r.needsMore).toBe(true)
    expect(r.missing).toBe(2)
  })

  it('flags outliers >30% above median', () => {
    const r = analyzeQuotes([
      { id: '1', amount: 1000 }, { id: '2', amount: 1000 }, { id: '3', amount: 2000 },
    ])
    expect(r.outliers.map((q) => q.id)).toContain('3')
  })

  it('handles no quotes', () => {
    const r = analyzeQuotes([], { requireMin: 3 })
    expect(r.count).toBe(0)
    expect(r.needsMore).toBe(true)
  })
})
