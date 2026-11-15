// vendor-sourcing — admin only.
//
//   { action: 'search', category, area, minRating?, minReviews? }
//     → Google Places (New) text search, up to 60 results. Each result says
//       whether it has an Israeli mobile, passes the thresholds, and is
//       already in the pool (by place id or by phone).
//   { action: 'enrich', limit? }
//     → attaches Google rating/reviews to existing vendors (phone must match).
//   { action: 'add', candidates: [...] , category }
//     → inserts the chosen ones as pending vendors (source 'google').
//
// The key lives in the GOOGLE_PLACES_API_KEY function secret. Nothing here
// contacts a vendor: invites go out from the Vendors page, and a vendor joins
// the pool only by answering "מאשר".

import { corsHeaders, json, serviceClient } from '../_shared/mod.ts'

const FIELDS = [
  'places.id', 'places.displayName', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.rating', 'places.userRatingCount', 'places.formattedAddress', 'places.googleMapsUri',
  'places.businessStatus', 'nextPageToken',
].join(',')

const digits = (s: string) => String(s || '').replace(/\D/g, '')
// Normalise to 05XXXXXXXX; null when not an Israeli mobile.
function israeliMobile(national?: string, intl?: string): string | null {
  let d = digits(intl || '') || digits(national || '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return /^05\d{8}$/.test(d) ? d : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const svc = serviceClient()
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData } = await svc.auth.getUser(jwt)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'unauthorized' }, 401)
    const { data: prof } = await svc.from('profiles').select('role').eq('id', uid).single()
    if (prof?.role !== 'admin') return json({ error: 'forbidden' }, 403)

    const body = await req.json().catch(() => ({}))

    if (body.action === 'search') {
      const key = Deno.env.get('GOOGLE_PLACES_API_KEY')
      if (!key) return json({ error: 'no_key' }, 400)
      const category = String(body.category || '').trim()
      const area = String(body.area || '').trim()
      if (!category) return json({ error: 'no_category' }, 400)
      const minRating = Number(body.minRating ?? 4.5)
      const minReviews = Number(body.minReviews ?? 15)

      const places: any[] = []
      let pageToken: string | undefined
      for (let page = 0; page < 3; page++) {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
          body: JSON.stringify({
            textQuery: `${category} ${area}`.trim(), languageCode: 'he', regionCode: 'IL', pageSize: 20,
            ...(pageToken ? { pageToken } : {}),
          }),
          signal: AbortSignal.timeout(20000),
        })
        const data = await res.json()
        if (!res.ok) return json({ error: 'google', detail: data?.error?.message || res.status }, 502)
        places.push(...(data.places || []))
        pageToken = data.nextPageToken
        if (!pageToken) break
      }

      const { data: existing } = await svc.from('vendors').select('google_place_id, phone')
      const knownIds = new Set((existing || []).map((v: any) => v.google_place_id).filter(Boolean))
      const knownPhones = new Set((existing || []).map((v: any) => digits(v.phone).slice(-9)).filter((p: string) => p.length === 9))

      const results = places
        .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
        .map((p) => {
          const mobile = israeliMobile(p.nationalPhoneNumber, p.internationalPhoneNumber)
          const rating = Number(p.rating || 0)
          const reviews = Number(p.userRatingCount || 0)
          const exists = knownIds.has(p.id) || (!!mobile && knownPhones.has(mobile.slice(-9)))
          const reasons: string[] = []
          if (!mobile) reasons.push('אין נייד')
          if (rating < minRating) reasons.push(`דירוג ${rating || '—'}`)
          if (reviews < minReviews) reasons.push(`${reviews} ביקורות`)
          if (exists) reasons.push('כבר במאגר')
          return {
            place_id: p.id, name: p.displayName?.text || '', phone: mobile,
            landline: mobile ? null : (p.nationalPhoneNumber || null),
            rating, reviews, address: p.formattedAddress || '', maps_url: p.googleMapsUri || '',
            exists, qualifies: reasons.length === 0, reasons,
          }
        })
        .sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.rating - a.rating || b.reviews - a.reviews)

      return json({ results })
    }

    if (body.action === 'add') {
      const category = String(body.category || '').trim()
      const list = Array.isArray(body.candidates) ? body.candidates : []
      const rows = list
        .filter((c: any) => c?.place_id && israeliMobile(c.phone))
        .map((c: any) => ({
          name: String(c.name || '').slice(0, 200), category, phone: israeliMobile(c.phone),
          rating: Number(c.rating) || 0, review_count: Number(c.reviews) || 0,
          address: String(c.address || ''), service_area: String(body.area || ''),
          google_place_id: c.place_id, maps_url: String(c.maps_url || ''),
          source: 'google', membership_status: 'pending', contact_channel: 'whatsapp',
        }))
      if (rows.length === 0) return json({ added: 0 })
      const { data, error } = await svc.from('vendors')
        .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true }).select('id')
      if (error) return json({ error: error.message }, 400)
      return json({ added: data?.length || 0 })
    }

    // Look up existing vendors on Google by name + area and attach rating,
    // review count and maps link — only when Google's phone matches ours, so
    // a same-named business elsewhere is never attached by mistake.
    if (body.action === 'enrich') {
      const key = Deno.env.get('GOOGLE_PLACES_API_KEY')
      if (!key) return json({ error: 'no_key' }, 400)
      const limit = Math.min(Number(body.limit) || 40, 60)
      const { data: vendors } = await svc.from('vendors')
        .select('id, name, phone, service_area').is('google_place_id', null).order('created_at').limit(limit)
      let matched = 0
      const unmatched: string[] = []
      for (const v of vendors || []) {
        const want = digits(v.phone).slice(-9)
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
          body: JSON.stringify({ textQuery: `${v.name} ${v.service_area || ''}`.trim(), languageCode: 'he', regionCode: 'IL', pageSize: 5 }),
          signal: AbortSignal.timeout(20000),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return json({ error: 'google', detail: data?.error?.message || res.status, matched }, 502)
        const hit = (data.places || []).find((p: any) =>
          [p.nationalPhoneNumber, p.internationalPhoneNumber].some((x: string) => x && digits(x).slice(-9) === want))
        if (hit) {
          const { error } = await svc.from('vendors').update({
            google_place_id: hit.id, rating: Number(hit.rating || 0), review_count: Number(hit.userRatingCount || 0),
            maps_url: hit.googleMapsUri || null,
          }).eq('id', v.id)
          if (!error) matched++
        } else unmatched.push(v.name)
      }
      const { count: left } = await svc.from('vendors').select('id', { count: 'exact', head: true }).is('google_place_id', null)
      return json({ checked: (vendors || []).length, matched, unmatched, left })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
