// Creates a staff account with a role the RLS policies will actually honour.
//
//   npm run staff:add -- <email> <password> <telecaller|counsellor|superadmin|teacher> <org-slug> ["Full Name"]
//   npm run staff:list
//   npm run staff:org -- <email> <org-slug>
//
// Why this exists: the Supabase dashboard's "Add user" cannot set
// app_metadata. A user created there has no role, so is_staff() returns false
// and they sign in to an empty console with nothing explaining why.
//
// The role goes in app_metadata, never user_metadata — user_metadata is
// editable by the signed-in user, so a role stored there would let any
// telecaller promote themselves to superadmin.
//
// The org (migration 0030) sits beside the role: app_metadata.org_id, the id
// of an `organizations` row, named here by its slug (lws-pune, lws-delhi). An
// account with no org sees nothing, unless it is superadmin, who sees every org.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROLES = ['telecaller', 'counsellor', 'superadmin', 'teacher']
// 8 is the NIST SP 800-63B floor. Set by the institute; raise it if staff
// accounts ever get more than superadmin's own data behind them.
const MIN_PASSWORD = 8

const USAGE = `
Usage:
  npm run staff:add -- <email> <password> <${ROLES.join('|')}> <org-slug> ["Full Name"]
  npm run staff:list
  npm run staff:org -- <email> <org-slug>
  npm run staff:rm -- <email>
`

function readEnv() {
  return Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

async function main() {
  const env = readEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const svc = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) {
    console.error('Missing Supabase env vars in .env.local')
    return 1
  }

  const admin = (path, init = {}) =>
    fetch(`${url}/auth/v1/admin/${path}`, {
      ...init,
      headers: {
        apikey: svc,
        Authorization: `Bearer ${svc}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

  const orgs = async () => {
    const res = await fetch(`${url}/rest/v1/organizations?select=id,slug`, {
      headers: { apikey: svc, Authorization: `Bearer ${svc}` },
    })
    if (!res.ok) throw new Error(`could not read orgs: HTTP ${res.status}`)
    return res.json()
  }
  const orgBySlug = async (slug) => {
    const all = await orgs()
    const org = all.find((o) => o.slug === slug)
    if (!org) console.error(`\nNo org "${slug}". Orgs: ${all.map((o) => o.slug).join(', ')}\n`)
    return org ?? null
  }

  const [cmd, ...rest] = process.argv.slice(2)

  if (cmd === 'list') {
    const res = await admin('users?per_page=200')
    if (!res.ok) {
      console.error(`Failed: HTTP ${res.status}`, (await res.text()).slice(0, 300))
      return 1
    }
    const { users } = await res.json()
    if (users.length === 0) {
      console.log('\nNo accounts yet.\n')
      return 0
    }
    const slugs = Object.fromEntries((await orgs()).map((o) => [o.id, o.slug]))
    console.log(`\n${users.length} account(s):\n`)
    for (const u of users) {
      const role = u.app_metadata?.role ?? '(NO ROLE — will see an empty console)'
      const org = slugs[u.app_metadata?.org_id] ?? '(no org)'
      console.log(`  ${u.email.padEnd(34)} ${role.padEnd(12)} ${org.padEnd(10)} ${u.app_metadata?.name ?? ''}`)
    }
    console.log()
    return 0
  }

  if (cmd === 'rm') {
    const [email] = rest
    if (!email) {
      console.error(USAGE)
      return 1
    }

    const res = await admin('users?per_page=200')
    if (!res.ok) {
      console.error(`Failed: HTTP ${res.status}`, (await res.text()).slice(0, 300))
      return 1
    }
    const { users } = await res.json()
    const user = users.find((u) => u.email === email)
    if (!user) {
      console.error(`
No account with email ${email}.
`)
      return 1
    }

    // Refuse to remove the last superadmin: nobody could then promote anyone,
    // and the only way back is a service-role script.
    const superadmins = users.filter((u) => u.app_metadata?.role === 'superadmin')
    if (user.app_metadata?.role === 'superadmin' && superadmins.length <= 1) {
      console.error(`
Refusing: ${email} is the only superadmin.
`)
      return 1
    }

    const del = await admin(`users/${user.id}`, { method: 'DELETE' })
    if (!del.ok) {
      console.error(`
Failed: HTTP ${del.status}`)
      console.error((await del.text()).slice(0, 300))
      return 1
    }

    console.log(`
Removed ${email} (was ${user.app_metadata?.role ?? 'no role'}).
`)
    return 0
  }

  if (cmd === 'org') {
    const [email, slug] = rest
    if (!email || !slug) {
      console.error(USAGE)
      return 1
    }
    const org = await orgBySlug(slug)
    if (!org) return 1

    const res = await admin('users?per_page=200')
    if (!res.ok) {
      console.error(`Failed: HTTP ${res.status}`, (await res.text()).slice(0, 300))
      return 1
    }
    const user = (await res.json()).users.find((u) => u.email === email)
    if (!user) {
      console.error(`\nNo account with email ${email}.\n`)
      return 1
    }

    // app_metadata is merged, not replaced, so this touches only org_id.
    const put = await admin(`users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ app_metadata: { org_id: org.id } }),
    })
    if (!put.ok) {
      console.error(`\nFailed: HTTP ${put.status}`)
      console.error((await put.text()).slice(0, 300))
      return 1
    }
    console.log(`\nMoved ${email} to ${slug}. A live session follows when its token refreshes (within the hour).\n`)
    return 0
  }

  if (cmd !== 'add') {
    console.error(USAGE)
    return 1
  }

  const [email, password, role, slug, ...nameParts] = rest
  // Same cleaning as validateName in src/lib/staff.ts. Optional here so the
  // break-glass path still works with nothing but an email to hand.
  const name = nameParts.join(' ').trim().replace(/\s+/g, ' ')
  if (!email || !password || !role || !slug) {
    console.error(USAGE)
    return 1
  }
  if (!ROLES.includes(role)) {
    console.error(`\nInvalid role "${role}". Must be one of: ${ROLES.join(', ')}\n`)
    return 1
  }
  if (password.length < MIN_PASSWORD) {
    console.error(`\nPassword must be at least ${MIN_PASSWORD} characters.\n`)
    return 1
  }

  const org = await orgBySlug(slug)
  if (!org) return 1

  const res = await admin('users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true, // internal staff; no inbox round-trip
      app_metadata: name ? { role, name, org_id: org.id } : { role, org_id: org.id },
    }),
  })

  if (!res.ok) {
    console.error(`\nFailed: HTTP ${res.status}`)
    console.error((await res.text()).slice(0, 400))
    return 1
  }

  const user = await res.json()
  console.log(`\nCreated ${user.email} with role "${user.app_metadata?.role}" in ${slug}.`)
  console.log('Have them change this password after first sign-in.\n')
  return 0
}

process.exitCode = await main()
