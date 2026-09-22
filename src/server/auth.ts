import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Db } from './supabase'

export const ROLES = ['telecaller', 'counsellor', 'superadmin'] as const
export type Role = (typeof ROLES)[number]

export interface StaffUser {
  id: string
  email: string
  role: Role
}

/**
 * A Supabase client bound to the signed-in staff member.
 *
 * Every staff query goes through this, never the service-role client, so RLS
 * is the thing enforcing access rather than an `if` in a route handler. The
 * service-role client stays reserved for the candidate API, which has no
 * session to act on behalf of.
 */
export async function userClient(): Promise<Db> {
  const store = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) store.set(name, value, options)
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  ) as unknown as Db
}

/**
 * The signed-in staff member, or null.
 *
 * Reads the role from `app_metadata`. `user_metadata` is editable by the
 * signed-in user, so a role read from there would let any telecaller make
 * themselves superadmin by calling updateUser.
 */
export async function currentStaff(): Promise<StaffUser | null> {
  const db = await userClient()

  // getUser() revalidates against the auth server. getSession() reads a cookie
  // the browser could have tampered with, so it is not safe for this decision.
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return null

  const role = data.user.app_metadata?.role
  if (!ROLES.includes(role as Role)) return null

  return { id: data.user.id, email: data.user.email ?? '', role: role as Role }
}

/** For pages and actions that must not run without a staff session. */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await currentStaff()
  if (!staff) throw new Error('Not signed in.')
  return staff
}
