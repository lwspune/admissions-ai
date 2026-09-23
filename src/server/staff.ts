import 'server-only'
import { serviceClient } from './supabase'
import type { StaffUser } from './auth'
import { validateNewStaff, validateName, checkChangeTarget, isRole, type Role } from '@/lib/staff'

// Staff account management.
//
// This is a deliberate exception to "staff paths use the session client". A
// login can only be created, re-roled or deleted through the auth admin API,
// which needs the service-role key — RLS never sees these calls. So the rule
// lives here instead: every export takes the actor, and refuses unless they
// are a superadmin. The actor MUST come from `currentStaff()`, which reads the
// role via getUser() from the auth server, never from anything the browser
// sends. `staff.itest.ts` is what keeps the refusals from going inert.
//
// Known gap, shared with `npm run staff:*`: the database reads the role from
// the JWT, so a demoted or removed account keeps its old database access until
// its access token expires (Supabase default: one hour). Pages check the live
// account through currentStaff() and change immediately.

export interface StaffAccount {
  id: string
  /** Null for an account created before names were recorded. */
  name: string | null
  email: string
  /** Null for an account created outside this app with no role set. */
  role: Role | null
  lastSignInAt: string | null
}

export type StaffResult = { ok: true } | { ok: false; error: string }

const FORBIDDEN: Extract<StaffResult, { ok: false }> = { ok: false, error: 'Only a superadmin can manage staff.' }

// The admin API pages at 1000 per request. The institute has a handful of
// staff; paging is deferred until a second page is plausible.
const PER_PAGE = 1000

function isSuperadmin(actor: StaffUser) {
  return actor.role === 'superadmin'
}

function failed(action: string, error: unknown): StaffResult {
  console.error(`staff: ${action} failed:`, error)
  return { ok: false, error: 'The change could not be saved. Try again.' }
}

export async function listStaff(actor: StaffUser): Promise<StaffAccount[]> {
  if (!isSuperadmin(actor)) throw new Error(FORBIDDEN.error)

  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: PER_PAGE })
  if (error) {
    console.error('staff: list failed:', error)
    throw new Error('Could not load staff accounts.')
  }

  return data.users
    .map((u) => ({
      id: u.id,
      name: typeof u.app_metadata?.name === 'string' ? u.app_metadata.name : null,
      email: u.email ?? '',
      role: isRole(u.app_metadata?.role) ? u.app_metadata.role : null,
      lastSignInAt: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
}

export async function addStaff(
  actor: StaffUser,
  input: { name: string; email: string; password: string; role: string },
): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN

  const checked = validateNewStaff(input)
  if (!checked.ok) return checked

  const { name, email, password, role } = checked.value
  const { error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal staff; the superadmin hands over the password
    // The name sits beside the role in app_metadata, not in user_metadata:
    // the latter is editable by its owner, and a name that labels who issued a
    // test is only worth anything if staff cannot rewrite their own.
    app_metadata: { role, name },
  })

  if (error?.code === 'email_exists') {
    return { ok: false, error: 'An account with this email already exists.' }
  }
  if (error) return failed('add', error)
  return { ok: true }
}

export async function changeStaffRole(
  actor: StaffUser,
  targetId: string,
  role: string,
): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN
  if (!isRole(role)) return { ok: false, error: 'Choose a role.' }

  const target = checkChangeTarget(actor.id, targetId)
  if (!target.ok) return target

  // app_metadata is merged, not replaced, so this touches only `role`.
  const { error } = await serviceClient().auth.admin.updateUserById(targetId, {
    app_metadata: { role },
  })
  if (error) return failed('role change', error)
  return { ok: true }
}

/**
 * Unlike a role change, renaming your own account is allowed: a name grants
 * nothing, and the self-rule exists to keep a superadmin in existence.
 */
export async function renameStaff(
  actor: StaffUser,
  targetId: string,
  name: string,
): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN

  const checked = validateName(name)
  if (!checked.ok) return checked

  const { error } = await serviceClient().auth.admin.updateUserById(targetId, {
    app_metadata: { name: checked.value },
  })
  if (error) return failed('rename', error)
  return { ok: true }
}

export async function removeStaff(actor: StaffUser, targetId: string): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN

  const target = checkChangeTarget(actor.id, targetId)
  if (!target.ok) return target

  const { error } = await serviceClient().auth.admin.deleteUser(targetId)
  if (error) return failed('remove', error)
  return { ok: true }
}
