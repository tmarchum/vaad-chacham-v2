import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with clsx + tailwind-merge
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Israeli Shekel currency
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a date string or Date object in Hebrew locale
 */
export function formatDate(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const defaults = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  return new Intl.DateTimeFormat('he-IL', { ...defaults, ...options }).format(d)
}

/**
 * Calculate the monthly fee for a unit based on building fee mode:
 *   'flat'     → building.monthly_fee (or monthlyFee)
 *   'by_rooms' → find tier where tier.rooms === unit.rooms
 *   'by_sqm'   → find tier where unit.area is between min_sqm and max_sqm
 *
 * If the unit has its own monthly_fee set (> 0), that always takes priority.
 * Returns a number (0 if nothing found).
 */
export function calcUnitFee(unit, building) {
  if (!unit || !building) return 0

  // Unit override — only if explicitly set to a positive value
  const unitFee = unit.monthly_fee ?? unit.monthlyFee
  if (unitFee !== null && unitFee !== undefined && unitFee !== '' && Number(unitFee) > 0) {
    const fee = Number(unitFee)
    // Apply board-member discount if applicable
    if (unit.board_member && building.board_member_discount) {
      return fee * (1 - Number(building.board_member_discount) / 100)
    }
    return fee
  }

  const mode = building.fee_mode || 'flat'
  const tiers = Array.isArray(building.fee_tiers) ? building.fee_tiers : []
  let base = 0

  // tier_label override — check custom label first regardless of mode
  const tierLabel = unit.custom_fields?.tier_label || unit.tier_label
  if (tierLabel && tiers.length > 0) {
    const labeledTier = tiers.find(t => t.label && t.label === tierLabel)
    if (labeledTier) {
      base = Number(labeledTier.fee)
      if (unit.board_member && building.board_member_discount) {
        return base * (1 - Number(building.board_member_discount) / 100)
      }
      return base
    }
  }

  if (mode === 'by_rooms' && tiers.length > 0) {
    const rooms = Number(unit.rooms)
    const tier = tiers.find(t => Number(t.rooms) === rooms)
    // If no exact match, pick the closest tier
    if (tier) {
      base = Number(tier.fee)
    } else {
      // find closest
      const sorted = [...tiers].sort((a, b) => Math.abs(Number(a.rooms) - rooms) - Math.abs(Number(b.rooms) - rooms))
      base = Number(sorted[0]?.fee ?? 0)
    }
  } else if (mode === 'by_sqm' && tiers.length > 0) {
    const area = Number(unit.area)
    const tier = tiers.find(t => area >= Number(t.min_sqm) && area <= Number(t.max_sqm))
    if (tier) {
      base = Number(tier.fee)
    } else {
      // fallback: last tier (largest)
      const sorted = [...tiers].sort((a, b) => Number(b.min_sqm) - Number(a.min_sqm))
      base = Number(sorted[0]?.fee ?? 0)
    }
  } else {
    // flat
    base = Number(building.monthly_fee ?? building.monthlyFee ?? 0)
  }

  if (unit.board_member && building.board_member_discount) {
    return base * (1 - Number(building.board_member_discount) / 100)
  }
  return base
}

/**
 * Safely parse JSON, returning fallback on failure
 */
export function parseJson(str, fallback = null) {
  if (str == null) return fallback
  try {
    const parsed = JSON.parse(str)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}
