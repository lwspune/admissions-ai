// Orgs (migrations 0030–0031): which org something goes into, and how one is
// named on screen. The database enforces the same rule — a session's insert
// takes its own org, and only superadmin may name another — so this only
// decides what to ask for and what to show.

export interface Org {
  id: string
  name: string
}

/**
 * The org an insert goes into: the one superadmin names if it exists, else
 * the caller's own. Anyone else always gets their own (null: they have none,
 * and the database refuses them).
 */
export function orgFor(role: string, requested: string | null, own: string | null, orgs: Org[]): string | null {
  if (role === 'superadmin' && requested && orgs.some((o) => o.id === requested)) return requested
  return own
}

export function orgName(orgs: Org[], id: string | null): string {
  return orgs.find((o) => o.id === id)?.name ?? 'No org'
}

/**
 * "Priya · LWS Delhi" where there is more than one org to tell apart (that
 * is, for superadmin, who is given the list); the bare label otherwise.
 */
export function withOrg(label: string, orgId: string | null, orgs: Org[]): string {
  return orgs.length > 1 ? `${label} · ${orgName(orgs, orgId)}` : label
}
