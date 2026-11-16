import { describe, it, expect } from 'vitest'
import { distanceKm, vendorDistanceKm, formatKm, distanceBand } from './geo'

describe('geo', () => {
  it('Petah Tikva → Tel Aviv is ~10–14 km', () => {
    const d = distanceKm({ lat: 32.0695, lng: 34.9067 }, { lat: 32.0853, lng: 34.7818 })
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(14)
  })
  it('returns null when a location is missing', () => {
    expect(vendorDistanceKm({ geo_lat: null }, { geo_lat: 32, geo_lng: 34 })).toBeNull()
    expect(formatKm(null)).toBeNull()
  })
  it('bands', () => {
    expect(distanceBand(3)).toBe('near')
    expect(distanceBand(15)).toBe('ok')
    expect(distanceBand(30)).toBe('far')
    expect(distanceBand(80)).toBe('too_far')
    expect(distanceBand(null)).toBe('unknown')
  })
})
