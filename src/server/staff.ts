import 'server-only'
import { serviceClient } from './supabase'
import type { StaffUser } from './auth'
import { validateNewStaff, validateName, checkChangeTarget, isRole, type Role } from '@/lib/staff'
import { isUuid } from '@/lib/leads'
import { withOrg, type Org } from '@/lib/orgs'

// Staff account management.
//
// This is a deliberate exception to "staff paths use the session client". A
// login can only be created, re-roled or deleted through the auth admin API,
// which needs the service-role key — RLS never sees these calls. So the rule
// lives here instead: every export takes the actor, and refuses unless they
// are a superadmin — except `listAssignees`, which a counsellor may also call
// and which returns names only. The actor MUST come from `currentStaff()`, which reads the
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
  /** Null for an account with no org, which sees nothing (migration 0030). */
  orgId: string | null
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

const NO_ORG: Extract<StaffResult, { ok: false }> = { ok: false, error: 'Choose an org.' }

/** Every org, for labels and to check a chosen one exists. Service role, like the rest of this file. */
async function allOrgs(): Promise<Org[]> {
  const { data, error } = await serviceClient().from('organizations').select('id, name').order('name')
  if (error) throw new Error(`could not read orgs: ${error.message}`)
  return data as Org[]
}

async function orgExists(id: unknown): Promise<boolean> {
  return isUuid(id) && (await allOrgs()).some((o) => o.id === id)
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
      orgId: typeof u.app_metadata?.org_id === 'string' ? u.app_metadata.org_id : null,
      lastSignInAt: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
}

export interface Assignee {
  id: string
  /** The name, or the email for an account created before names were recorded. */
  label: string
}

/**
 * Telecallers a lead can be assigned to.
 *
 * The one read here a counsellor may make: counsellors assign leads, and the
 * only list of who the telecallers are is the auth admin API. It returns ids
 * and names and nothing else. Assignment itself is enforced in the database
 * (the `leads_guard` trigger, migration 0012); this only fills the dropdown.
 * A counsellor sees their own org's telecallers; superadmin sees every org's,
 * each labelled with its org, and the trigger refuses one from outside the
 * lead's org (migration 0030).
 */
export async function listAssignees(actor: StaffUser): Promise<Assignee[]> {
  if (actor.role !== 'counsellor' && actor.role !== 'superadmin') {
    throw new Error('Only a counsellor or superadmin can assign leads.')
  }

  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: PER_PAGE })
  if (error) {
    console.error('staff: assignee list failed:', error)
    throw new Error('Could not load the telecallers.')
  }

  const orgs = actor.role === 'superadmin' ? await allOrgs() : []
  return data.users
    .filter((u) => u.app_metadata?.role === 'telecaller')
    .filter((u) => actor.role === 'superadmin' || (actor.orgId !== null && u.app_metadata?.org_id === actor.orgId))
    .map((u) => ({
      id: u.id,
      label: withOrg(
        typeof u.app_metadata?.name === 'string' ? u.app_metadata.name : (u.email ?? u.id),
        typeof u.app_metadata?.org_id === 'string' ? u.app_metadata.org_id : null,
        orgs,
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Account id → name, for the "by …" on /hiring. A teacher sees every applicant
 * in their org, so they get the names of their org's accounts (every role, so
 * an adder since re-roled keeps their name); superadmin gets every org's.
 * Names only, like listAssignees.
 */
export async function listApplicantAdders(actor: StaffUser): Promise<Record<string, string>> {
  if (actor.role !== 'teacher' && actor.role !== 'superadmin') {
    throw new Error('Only a teacher or superadmin sees who added an applicant.')
  }

  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: PER_PAGE })
  if (error) {
    console.error('staff: applicant adders failed:', error)
    throw new Error('Could not load the names.')
  }

  return Object.fromEntries(
    data.users
      .filter((u) => actor.role === 'superadmin' || (actor.orgId !== null && u.app_metadata?.org_id === actor.orgId))
      .map((u) => [u.id, typeof u.app_metadata?.name === 'string' ? u.app_metadata.name : (u.email ?? u.id)]),
  )
}

export async function addStaff(
  actor: StaffUser,
  input: { name: string; email: string; password: string; role: string; orgId?: string | null },
): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN

  const checked = validateNewStaff(input)
  if (!checked.ok) return checked
  const orgId = input.orgId ?? actor.orgId
  if (!(await orgExists(orgId))) return NO_ORG

  const { name, email, password, role } = checked.value
  const { error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal staff; the superadmin hands over the password
    // The name sits beside the role in app_metadata, not in user_metadata:
    // the latter is editable by its owner, and a name that labels who issued a
    // test is only worth anything if staff cannot rewrite their own.
    app_metadata: { role, name, org_id: orgId },
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
 * Moves an account to another org. Refused while a telecaller still has leads
 * assigned outside the new org: they could no longer see them, and nobody
 * would notice the leads had gone quiet (the owner's call, 2026-10-28). Like
 * a role change, the database follows when the account's token refreshes.
 */
export async function changeStaffOrg(actor: StaffUser, targetId: string, orgId: string): Promise<StaffResult> {
  if (!isSuperadmin(actor)) return FORBIDDEN
  if (!(await orgExists(orgId))) return NO_ORG

  const target = checkChangeTarget(actor.id, targetId)
  if (!target.ok) return target

  const { count, error: countError } = await serviceClient()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', targetId)
    .neq('org_id', orgId)
  if (countError) return failed('org change', countError)
  if (count) {
    return {
      ok: false,
      error: `Reassign their ${count} lead${count === 1 ? '' : 's'} first: a telecaller in another org cannot see them.`,
    }
  }

  const { error } = await serviceClient().auth.admin.updateUserById(targetId, { app_metadata: { org_id: orgId } })
  if (error) return failed('org change', error)
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
