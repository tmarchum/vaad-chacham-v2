import { describe, it, expect } from 'vitest'
import { calcUnitFee, sanitizePhone, isValidPhone, sortByUnitNumber, parseJson } from './utils'

describe('calcUnitFee', () => {
  it('returns 0 for missing unit or building', () => {
    expect(calcUnitFee(null, {})).toBe(0)
    expect(calcUnitFee({}, null)).toBe(0)
  })

  it('uses a positive unit override over building config', () => {
    const unit = { monthly_fee: 500 }
    const building = { monthly_fee: 300, fee_mode: 'flat' }
    expect(calcUnitFee(unit, building)).toBe(500)
  })

  it('ignores a zero/empty unit override and falls back to flat', () => {
    expect(calcUnitFee({ monthly_fee: 0 }, { monthly_fee: 300 })).toBe(300)
    expect(calcUnitFee({ monthly_fee: '' }, { monthly_fee: 300 })).toBe(300)
  })

  it('applies board-member discount to the override', () => {
    const unit = { monthly_fee: 500, board_member: true }
    const building = { board_member_discount: 10 }
    expect(calcUnitFee(unit, building)).toBe(450)
  })

  it('flat mode uses building.monthly_fee', () => {
    expect(calcUnitFee({}, { fee_mode: 'flat', monthly_fee: 320 })).toBe(320)
  })

  it('by_rooms picks the matching tier, else the closest', () => {
    const building = {
      fee_mode: 'by_rooms',
      fee_tiers: [{ rooms: 3, fee: 300 }, { rooms: 4, fee: 400 }, { rooms: 5, fee: 500 }],
    }
    expect(calcUnitFee({ rooms: 4 }, building)).toBe(400)
    // 6 rooms → closest is the 5-room tier
    expect(calcUnitFee({ rooms: 6 }, building)).toBe(500)
  })

  it('by_sqm matches the area range, else falls back to the largest tier', () => {
    const building = {
      fee_mode: 'by_sqm',
      fee_tiers: [{ min_sqm: 0, max_sqm: 80, fee: 250 }, { min_sqm: 81, max_sqm: 120, fee: 350 }],
    }
    expect(calcUnitFee({ area: 100 }, building)).toBe(350)
    expect(calcUnitFee({ area: 200 }, building)).toBe(350) // above all ranges → largest
  })

  it('tier_label override wins regardless of mode', () => {
    const building = {
      fee_mode: 'by_rooms',
      fee_tiers: [{ label: 'מסחרי', fee: 999, rooms: 3 }, { rooms: 4, fee: 400 }],
    }
    expect(calcUnitFee({ rooms: 4, tier_label: 'מסחרי' }, building)).toBe(999)
  })

  it('applies board-member discount on a tier base', () => {
    const building = { fee_mode: 'flat', monthly_fee: 400, board_member_discount: 25 }
    expect(calcUnitFee({ board_member: true }, building)).toBe(300)
  })
})

describe('sanitizePhone', () => {
  it('keeps digits only and caps at 10', () => {
    expect(sanitizePhone('050-123-4567')).toBe('0501234567')
    expect(sanitizePhone('0501234567890')).toBe('0501234567')
    expect(sanitizePhone('  05a0 12b3 ')).toBe('050123')
  })
  it('handles null/undefined', () => {
    expect(sanitizePhone(null)).toBe('')
    expect(sanitizePhone(undefined)).toBe('')
  })
})

describe('isValidPhone', () => {
  it('accepts exactly 10 digits', () => {
    expect(isValidPhone('0501234567')).toBe(true)
  })
  it('rejects wrong length or non-numeric', () => {
    expect(isValidPhone('050123456')).toBe(false)
    expect(isValidPhone('05012345678')).toBe(false)
    expect(isValidPhone('05012a4567')).toBe(false)
    expect(isValidPhone(null)).toBe(false)
  })
})

describe('sortByUnitNumber', () => {
  it('sorts numerically, not lexically', () => {
    const units = [{ number: '10' }, { number: '2' }, { number: '1' }, { unit_number: '21' }]
    const sorted = [...units].sort(sortByUnitNumber).map(u => u.number || u.unit_number)
    expect(sorted).toEqual(['1', '2', '10', '21'])
  })
})

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('returns fallback on invalid/null', () => {
    expect(parseJson('not json', 'fb')).toBe('fb')
    expect(parseJson(null, 'fb')).toBe('fb')
    expect(parseJson('null', 'fb')).toBe('fb')
  })
})
