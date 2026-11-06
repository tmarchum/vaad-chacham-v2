import { describe, it, expect } from 'vitest'
import { isIsraelWinterTime, isMotzashSlotOpen } from './israelTime'

describe('isIsraelWinterTime', () => {
  it('counts deep winter and deep summer', () => {
    expect(isIsraelWinterTime('2026-01-15')).toBe(true)
    expect(isIsraelWinterTime('2026-12-19')).toBe(true)
    expect(isIsraelWinterTime('2026-07-04')).toBe(false)
  })

  // 2026: last Sunday of March is the 29th, so summer time starts Friday 27/3.
  it('switches to summer time on the Friday before the last Sunday of March', () => {
    expect(isIsraelWinterTime('2026-03-26')).toBe(true)
    expect(isIsraelWinterTime('2026-03-27')).toBe(false)
    expect(isIsraelWinterTime('2026-03-28')).toBe(false)
  })

  // 2026: last Sunday of October is the 25th.
  it('switches back to winter time on the last Sunday of October', () => {
    expect(isIsraelWinterTime('2026-10-24')).toBe(false)
    expect(isIsraelWinterTime('2026-10-25')).toBe(true)
    expect(isIsraelWinterTime('2026-10-26')).toBe(true)
  })

  // 2027: last Sunday of March is the 28th (summer from Friday 26/3), last
  // Sunday of October is the 31st — a year whose boundaries fall elsewhere.
  it('recomputes the boundaries every year', () => {
    expect(isIsraelWinterTime('2027-03-25')).toBe(true)
    expect(isIsraelWinterTime('2027-03-26')).toBe(false)
    expect(isIsraelWinterTime('2027-10-30')).toBe(false)
    expect(isIsraelWinterTime('2027-10-31')).toBe(true)
  })

  it('takes a Date as well as a string, and refuses junk', () => {
    expect(isIsraelWinterTime(new Date(2026, 11, 19))).toBe(true)
    expect(isIsraelWinterTime(new Date(2026, 6, 4))).toBe(false)
    expect(isIsraelWinterTime('')).toBe(false)
    expect(isIsraelWinterTime(null)).toBe(false)
  })
})

describe('isMotzashSlotOpen', () => {
  it('opens on a winter Saturday', () => {
    expect(isMotzashSlotOpen('2026-11-07')).toBe(true)   // Saturday
    expect(isMotzashSlotOpen('2026-12-19')).toBe(true)   // Saturday
  })

  it('stays shut on a summer Saturday — Shabbat ends after 20:00', () => {
    expect(isMotzashSlotOpen('2026-07-04')).toBe(false)  // Saturday
    expect(isMotzashSlotOpen('2026-05-30')).toBe(false)  // Saturday
  })

  it('stays shut on every other day of the week', () => {
    expect(isMotzashSlotOpen('2026-11-06')).toBe(false)  // Friday
    expect(isMotzashSlotOpen('2026-11-08')).toBe(false)  // Sunday
    expect(isMotzashSlotOpen('2026-12-16')).toBe(false)  // Wednesday
  })
})
