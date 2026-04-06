import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://stncskqjrmecjckxldvi.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0bmNza3Fqcm1lY2pja3hsZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDExNzcsImV4cCI6MjA5MDExNzE3N30.7HOgnQskv6RblMQvoDaQzXE3kj2KP7lpugSbjYeVG2g'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})
