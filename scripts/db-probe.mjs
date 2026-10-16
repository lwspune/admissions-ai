// Transactional database probes, safe against production.
//
//   npm run db:probe                 every file in supabase/probes
//   npm run db:probe -- 0018         the files whose name contains "0018"
//
// `db:verify` writes rows and so refuses a database holding real leads — which
// production always does now. A probe here is one SQL statement (a DO block)
// that always ends by raising: the raise rolls back everything it wrote, so no
// other session ever sees its rows, and its message carries the result. A
// file passes when that message says PROBE-PASS.
//
// Connects through the IPv4 session pooler with SUPABASE_DB_PASSWORD from
// .env.local (see CLAUDE.md, Commands). The connection string is never printed.

import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1]
if (!ref || !env.SUPABASE_DB_PASSWORD) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD in .env.local')
  process.exit(1)
}
const dbUrl =
  `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}` +
  '@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'

const only = process.argv[2]
const dir = join(root, 'supabase', 'probes')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && (!only || f.includes(only)))
if (files.length === 0) {
  console.error(`No probe files${only ? ` matching "${only}"` : ''} in supabase/probes`)
  process.exit(1)
}

const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js')
let failed = 0
for (const file of files) {
  const run = spawnSync(process.execPath, [cli, 'db', 'query', '--db-url', dbUrl, '-f', join(dir, file)], {
    encoding: 'utf8',
  })
  const out = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.replaceAll(dbUrl, '<db-url>')
  const result = /PROBE-(PASS|FAIL)[^\n"]*/.exec(out)?.[0]
  if (result?.startsWith('PROBE-PASS')) {
    console.log(`  PASS  ${file}\n        ${result.slice('PROBE-PASS'.length).trim()}`)
  } else {
    failed++
    console.log(`  FAIL  ${file}\n        ${result ?? out.trim().split('\n').slice(-5).join('\n        ')}`)
  }
}
console.log(`\n${files.length - failed} of ${files.length} probe file(s) passed`)
process.exit(failed ? 1 : 0)
