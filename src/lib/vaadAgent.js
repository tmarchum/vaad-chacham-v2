// ---------------------------------------------------------------------------
// Client for the vaad-agent Supabase Edge Function
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'

const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0bmNza3Fqcm1lY2pja3hsZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MDI2ODUsImV4cCI6MjA2MDM3ODY4NX0.r6WdHFcGknPGsRkmqNqiEJTnbL3D7qQjLLTSOzNPrIA'
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/vaad-agent`

/**
 * Call the AI agent Edge Function.
 * @param {string} agentType - 'collection' | 'vendor' | 'budget' | 'compliance'
 * @param {string} buildingName - Name of the selected building
 * @param {object} contextData - Agent-specific data payload
 * @returns {Promise<object>} - Parsed result from Claude
 */
export async function callVaadAgent(agentType, buildingName, contextData) {
  // Get the current session token for authenticated Edge Function call
  const { data: { session } } = await supabase.auth.getSession()
  const authToken = session?.access_token || SUPABASE_ANON_KEY

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'apikey': SUPABASE_ANON_KEY,
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
