import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client. Bypasses every RLS policy, so it must never be
// constructed in anything that ships to the browser — `server-only` turns that
// mistake into a build error rather than a breach.

export type Db = SupabaseClient

let cached: Db | null = null

export function serviceClient(): Db {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured')
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
