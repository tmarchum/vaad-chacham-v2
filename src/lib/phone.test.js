import { describe, it, expect } from 'vitest'
import { isWhatsappable, waNumber, waLink, telHref } from './phone'

describe('phone helpers', () => {
  it('accepts Israeli mobile and landline numbers', () => {
    expect(isWhatsappable('054-4302855')).toBe(true)
    expect(waNumber('054-4302855')).toBe('972544302855')
    expect(isWhatsappable('03-9128800')).toBe(true)
    expect(waNumber('03-9128800')).toBe('97239128800')
  })

  it('rejects star/short codes and toll lines', () => {
    expect(isWhatsappable('*3626')).toBe(false)
    expect(isWhatsappable('1-800-351122')).toBe(false)
    expect(isWhatsappable('1-700-505755')).toBe(false)
    expect(waNumber('*3060')).toBe(null)
  })

  it('waLink builds wa.me only for valid numbers', () => {
    expect(waLink('050-1234567', 'שלום')).toContain('https://wa.me/972501234567?text=')
    expect(waLink('*3060', 'x')).toBe(null)
  })

  it('telHref keeps * and digits for dialing', () => {
    expect(telHref('*3626')).toBe('tel:*3626')
    expect(telHref('1-800-351122')).toBe('tel:1800351122')
    expect(telHref('')).toBe(null)
  })
})
