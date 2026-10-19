// Rules for staff accounts, kept pure so they test without an auth server.
// The superadmin gate itself lives in src/server/staff.ts, beside the admin
// API calls it protects.

export const ROLES = ['telecaller', 'counsellor', 'superadmin', 'teacher'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  telecaller: 'Telecaller',
  counsellor: 'Counsellor',
  superadmin: 'Superadmin',
  teacher: 'Teacher',
}

// Who may do what, as allow-lists. Checks once read "not a telecaller", which
// would have waved through the teacher role (2026-10-19) and any role after it;
// these name who is let in. The database refuses the same people underneath
// (is_staff, can_hire, the triggers) — these keep the pages honest.

/** Telecallers, counsellors and superadmin: the admissions side. Mirrors is_staff(). */
export function isAdmissionsStaff(role: unknown): boolean {
  return role === 'telecaller' || role === 'counsellor' || role === 'superadmin'
}

/** Counsellors and superadmin: assign, import, paper tests, scanning. */
export function canManageLeads(role: unknown): boolean {
  return role === 'counsellor' || role === 'superadmin'
}

/** Teachers and superadmin: the teacher screening test. Mirrors can_hire(). */
export function canHire(role: unknown): boolean {
  return role === 'superadmin' || role === 'teacher'
}

/** Where a role lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'teacher' ? '/hiring' : '/leads'
}

const isHiringPath = (path: string) => path === '/hiring' || path.startsWith('/hiring/')

/**
 * Whether a signed-in role may open a staff path. The middleware asks this:
 * a teacher sees /hiring and nothing else, and /hiring is for teachers and
 * superadmin. Everything else stays as each page decides.
 */
export function roleMayOpen(role: unknown, path: string): boolean {
  if (!isRole(role)) return false
  if (role === 'teacher') return isHiringPath(path)
  if (isHiringPath(path)) return canHire(role)
  return true
}

// 8 is the NIST SP 800-63B floor. Set by the institute; raise it if staff
// accounts ever get more than superadmin's own data behind them.
export const MIN_PASSWORD = 8

export const MAX_NAME = 100

export interface NewStaff {
  name: string
  email: string
  password: string
  role: Role
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Deliberately loose: one @, a dot in the domain, no whitespace. The auth
// server is the final word; this only catches typos before a round trip.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role)
}

/** A display name, trimmed and with inner whitespace runs collapsed. */
export function validateName(input: string): Checked<string> {
  const name = input.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'Enter their name.' }
  if (name.length > MAX_NAME) {
    return { ok: false, error: `Name must be at most ${MAX_NAME} characters.` }
  }
  return { ok: true, value: name }
}

export function validateNewStaff(input: {
  name: string
  email: string
  password: string
  role: string
}): Checked<NewStaff> {
  const name = validateName(input.name)
  if (!name.ok) return name

  const email = input.email.trim().toLowerCase()
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  if (!isRole(input.role)) return { ok: false, error: 'Choose a role.' }
  if (input.password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` }
  }
  return { ok: true, value: { name: name.value, email, password: input.password, role: input.role } }
}

/**
 * Removing or re-roling an account is refused when it is your own.
 *
 * Only a superadmin gets this far, so forbidding self-changes is also what
 * guarantees a superadmin always remains — there is no separate "last
 * superadmin" count to race.
 */
export function checkChangeTarget(
  actorId: string,
  targetId: string,
): { ok: true } | { ok: false; error: string } {
  if (actorId === targetId) {
    return { ok: false, error: 'You cannot change or remove your own account.' }
  }
  return { ok: true }
}
