// _shared/push.ts — FCM HTTP v1 push sender.
//
// Reads the Firebase service account from the FCM_SERVICE_ACCOUNT secret
// (the full JSON, as downloaded from Firebase console → Project settings →
// Service accounts → Generate new private key). Degrades gracefully: when the
// secret is missing, every send returns { skipped: true } and nothing breaks.
//
// Tokens live in public.push_tokens (user_id, token, platform) — written by
// the Android app on login (src/lib/push.js). Tokens FCM reports as dead
// (UNREGISTERED / 404) are deleted so the table stays clean.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

let cached: { token: string; exp: number } | null = null

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function getServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    if (sa.project_id && sa.client_email && sa.private_key) return sa
  } catch { /* fallthrough */ }
  console.warn('FCM_SERVICE_ACCOUNT is set but not a valid service-account JSON')
  return null
}

// Mint (and cache) an OAuth2 access token for the firebase.messaging scope.
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp > now + 60) return cached.token

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput),
  ))
  const jwt = `${signingInput}.${b64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  })
  if (!res.ok) throw new Error(`FCM oauth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) }
  return cached.token
}

export type PushMessage = {
  title: string
  body: string
  data?: Record<string, string>
}

type SendOutcome = { sent: number; failed: number; skipped?: boolean }

// Send one push to one FCM token. Returns 'ok' | 'dead' | 'error'.
async function sendToToken(sa: ServiceAccount, accessToken: string, token: string, msg: PushMessage): Promise<'ok' | 'dead' | 'error'> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data || {},
          android: { priority: 'HIGH', notification: { default_sound: true } },
        },
      }),
    },
  )
  if (res.ok) return 'ok'
  const text = await res.text()
  // 404/UNREGISTERED = token no longer valid (app uninstalled / token rotated).
  if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) return 'dead'
  console.warn('FCM send error', res.status, text.slice(0, 300))
  return 'error'
}

/** Push to every registered device of the given users. Never throws. */
export async function sendPushToUsers(svc: SupabaseClient, userIds: string[], msg: PushMessage): Promise<SendOutcome> {
  try {
    const sa = getServiceAccount()
    if (!sa || userIds.length === 0) return { sent: 0, failed: 0, skipped: true }

    const { data: rows, error } = await svc
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)
    if (error || !rows?.length) return { sent: 0, failed: 0, skipped: !rows?.length }

    const accessToken = await getAccessToken(sa)
    let sent = 0, failed = 0
    const dead: string[] = []
    for (const r of rows) {
      const out = await sendToToken(sa, accessToken, r.token, msg)
      if (out === 'ok') sent++
      else if (out === 'dead') dead.push(r.token)
      else failed++
    }
    if (dead.length) {
      await svc.from('push_tokens').delete().in('token', dead)
    }
    return { sent, failed }
  } catch (e) {
    console.warn('sendPushToUsers failed:', e instanceof Error ? e.message : e)
    return { sent: 0, failed: 1 }
  }
}

/** Push to one user. */
export function sendPushToUser(svc: SupabaseClient, userId: string | null | undefined, msg: PushMessage): Promise<SendOutcome> {
  if (!userId) return Promise.resolve({ sent: 0, failed: 0, skipped: true })
  return sendPushToUsers(svc, [userId], msg)
}
