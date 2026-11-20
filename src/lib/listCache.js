// Screen-to-screen memory for useCollection: the last rows each list returned,
// keyed by collection + filters. Kept in memory only (never on disk) and
// cleared whenever the signed-in user goes away, so one user never sees
// another's rows.
const cache = new Map()
const MAX = 120

export function listCacheGet(key) { return cache.get(key) }
export function listCacheHas(key) { return cache.has(key) }
export function listCachePut(key, rows) {
  cache.delete(key)
  cache.set(key, rows)
  if (cache.size > MAX) cache.delete(cache.keys().next().value)
}
export function clearListCache() { cache.clear() }
