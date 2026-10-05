// ---------------------------------------------------------------------------
// Client for the vaad-agent Supabase Edge Function
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'

const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/vaad-agent`

/**
 * Call the AI agent Edge Function. Requires a signed-in committee/admin
 * session — the function rejects anon-key calls.
 * @param {string} agentType - 'collection' | 'vendor' | 'budget' | 'compliance'
 * @param {string} buildingName - Name of the selected building
 * @param {object} contextData - Agent-specific data payload
 * @returns {Promise<object>} - Parsed result from Claude
 */
export async function callVaadAgent(agentType, buildingName, contextData) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('נדרשת התחברות מחדש')

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ agentType, buildingName, contextData }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.result
}
