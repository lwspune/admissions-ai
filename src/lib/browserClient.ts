'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client, used only to sign in and out.
 *
 * Carries the anon key, which is public by design: every table has RLS and no
 * anon policy, so this client can read nothing on its own. All staff data is
 * fetched server-side through a session-bound client.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
