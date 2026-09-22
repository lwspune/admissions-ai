// Creates a staff account with a role the RLS policies will actually honour.
//
//   npm run staff:add -- <email> <password> <telecaller|counsellor|superadmin>
//   npm run staff:list
//
// Why this exists: the Supabase dashboard's "Add user" cannot set
// app_metadata. A user created there has no role, so is_staff() returns false
// and they sign in to an empty console with nothing explaining why.
//
// The role goes in app_metadata, never user_metadata — user_metadata is
// editable by the signed-in user, so a role stored there would let any
// telecaller promote themselves to superadmin.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROLES = ['telecaller', 'counsellor', 'superadmin']
const MIN_PASSWORD = 12

const USAGE = `
Usage:
  npm run staff:add -- <email> <password> <${ROLES.join('|')}>
  npm run staff:list
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
    console.log(`\n${users.length} account(s):\n`)
    for (const u of users) {
      const role = u.app_metadata?.role ?? '(NO ROLE — will see an empty console)'
      console.log(`  ${u.email.padEnd(34)} ${role}`)
    }
    console.log()
    return 0
  }

  if (cmd !== 'add') {
    console.error(USAGE)
    return 1
  }

  const [email, password, role] = rest
  if (!email || !password || !role) {
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

  const res = await admin('users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true, // internal staff; no inbox round-trip
      app_metadata: { role },
    }),
  })

  if (!res.ok) {
    console.error(`\nFailed: HTTP ${res.status}`)
    console.error((await res.text()).slice(0, 400))
    return 1
  }

  const user = await res.json()
  console.log(`\nCreated ${user.email} with role "${user.app_metadata?.role}".`)
  console.log('Have them change this password after first sign-in.\n')
  return 0
}

process.exitCode = await main()
