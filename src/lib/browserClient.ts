'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client, used to sign in and out and to upload files
 * straight to storage (sheet photos, resumes), past the server's body limit;
 * the storage policies decide what it may write.
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
