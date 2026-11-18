// Distance between a vendor and a building (great-circle, km).
// Vendors carry geo_lat/geo_lng (+ geo_source: google | address | area);
// buildings carry geo_lat/geo_lng.

const R = 6371
const rad = (d) => (d * Math.PI) / 180

export function distanceKm(a, b) {
  if (!a || !b) return null
  const lat1 = Number(a.lat), lng1 = Number(a.lng), lat2 = Number(b.lat), lng2 = Number(b.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const point = (o) => (o && o.geo_lat != null && o.geo_lng != null ? { lat: o.geo_lat, lng: o.geo_lng } : null)

// Distance from building to vendor, or null when either location is unknown.
export function vendorDistanceKm(vendor, building) {
  return distanceKm(point(vendor), point(building))
}

export function formatKm(km) {
  if (km == null) return null
  if (km < 1) return 'פחות מק"מ'
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ק"מ`
}

// Band used for colouring and ranking.
export function distanceBand(km) {
  if (km == null) return 'unknown'
  if (km <= 7) return 'near'
  if (km <= 20) return 'ok'
  if (km <= 40) return 'far'
  return 'too_far'
}
