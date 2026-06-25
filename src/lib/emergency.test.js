import { describe, it, expect } from 'vitest'
import { isEmergency, emergencyVendorFor } from './emergency'

const onCall = { id: 'a', name: 'מעליות 24/7', category: 'מעליות', rating: 4, available_24_7: true }
const dayOnly = { id: 'b', name: 'מעליות יום', category: 'מעליות', rating: 5 }

describe('isEmergency', () => {
  it('true for urgent/high, false otherwise', () => {
    expect(isEmergency({ priority: 'urgent' })).toBe(true)
    expect(isEmergency({ priority: 'high' })).toBe(true)
    expect(isEmergency({ priority: 'low' })).toBe(false)
  })
})

describe('emergencyVendorFor', () => {
  it('prefers a 24/7 vendor over a higher-rated day-only one', () => {
    const v = emergencyVendorFor({ category: 'מעלית', priority: 'urgent' }, [dayOnly, onCall])
    expect(v.id).toBe('a')
  })
  it('falls back to the top match when none are 24/7', () => {
    const v = emergencyVendorFor({ category: 'מעלית', priority: 'urgent' }, [dayOnly])
    expect(v.id).toBe('b')
  })
  it('returns null when no vendor fits the trade', () => {
    expect(emergencyVendorFor({ category: 'מעלית' }, [{ id: 'g', category: 'גינון', rating: 5 }])).toBe(null)
  })
})
