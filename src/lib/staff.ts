// Rules for staff accounts, kept pure so they test without an auth server.
// The superadmin gate itself lives in src/server/staff.ts, beside the admin
// API calls it protects.

export const ROLES = ['telecaller', 'counsellor', 'superadmin'] as const
export type Role = (typeof ROLES)[number]

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
