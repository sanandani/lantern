import { createClient } from '@supabase/supabase-js'

// Service-role client for the two Azure Functions only. Bypasses RLS --
// never import this from the React app. See supabase/migrations for why
// intake_documents/recommendations have no client insert/update policy.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key)
}
