import { describe, it, expect } from 'vitest'
import { requiredApproval, approvalThresholds } from './approval'

describe('requiredApproval (defaults 500/2000)', () => {
  it('auto below autoMax', () => {
    expect(requiredApproval(300).level).toBe('auto')
    expect(requiredApproval(500).needsApproval).toBe(false)
  })
  it('single approval in the middle band', () => {
    expect(requiredApproval(501).level).toBe('single')
    expect(requiredApproval(2000).level).toBe('single')
    expect(requiredApproval(1500).needsApproval).toBe(true)
  })
  it('board vote above singleMax', () => {
    expect(requiredApproval(2001).level).toBe('board')
    expect(requiredApproval(9000).needsApproval).toBe(true)
  })
})

describe('approvalThresholds from building', () => {
  it('reads overrides, falls back to defaults', () => {
    expect(approvalThresholds({ approval_auto_max: 1000 }).autoMax).toBe(1000)
    expect(approvalThresholds({}).singleMax).toBe(2000)
  })
  it('custom thresholds change the bands', () => {
    const t = approvalThresholds({ approval_auto_max: 1000, approval_single_max: 5000 })
    expect(requiredApproval(900, t).level).toBe('auto')
    expect(requiredApproval(3000, t).level).toBe('single')
  })
})
