// _shared/mod.ts — helpers shared by all Edge Functions.
// One place for CORS, JSON responses, the service-role client, and caller
// identification, so every function enforces auth the same way.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export type Caller =
  | { kind: 'service' }
  | { kind: 'user'; uid: string; role: string; building_id: string | null; unit_id: string | null }
  | null

// Identify the caller from the Authorization header:
//  - the service-role key itself → internal machine-to-machine call
//  - a user JWT → resolve the profile (role, building, unit)
//  - anything else (anon key included) → null
export async function identifyCaller(req: Request, svc: SupabaseClient): Promise<Caller> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return null
  if (timingSafeEqual(bearer, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')) return { kind: 'service' }

  const { data: userData } = await svc.auth.getUser(bearer)
  const uid = userData?.user?.id
  if (!uid) return null
  const { data: prof } = await svc
    .from('profiles')
    .select('role, building_id, unit_id')
    .eq('id', uid)
    .maybeSingle()
  return {
    kind: 'user',
    uid,
    role: prof?.role || '',
    building_id: prof?.building_id ?? null,
    unit_id: prof?.unit_id ?? null,
  }
}

export const isPrivileged = (c: Caller) =>
  c?.kind === 'service' || (c?.kind === 'user' && ['admin', 'committee'].includes(c.role))

// Constant-time secret comparison — a plain !== leaks the match length through
// timing. Use for every shared-secret / webhook-token check.
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  // Compare same-length buffers; fold the length difference into the result
  // instead of returning early.
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}
