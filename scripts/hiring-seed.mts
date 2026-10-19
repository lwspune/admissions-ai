// Seeds content/hiring/*.json into hiring_items.
//
//   npm run hiring:seed                              # upsert; never changes an existing status
//   npm run hiring:seed -- --live --file <subject>   # promote one reviewed subject, e.g. maths
//
// Idempotent on `source_ref`. Promotion is the reviewer's sign-off, so it is a
// flag and scoped to one file, as with items:seed; a plain re-seed never
// demotes (resolveSeedStatus, src/lib/items.ts). Nothing is deleted: a
// question dropped from a file keeps its row, since papers may hold it — mark
// it "status": "retired" in the file to withdraw it.
//
// Lints first and refuses to seed a bank that fails (lintHiringBank).

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSeedStatus, inPromotionScope, type ItemStatus } from '../src/lib/items'
import { lintHiringBank, HIRING_SUBJECTS, type HiringItem } from '../src/lib/hiring'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'content', 'hiring')

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  const next = i === -1 ? undefined : process.argv[i + 1]
  return next && !next.startsWith('--') ? next : undefined
}

async function main(): Promise<number> {
  const live = process.argv.includes('--live')
  const only = flagValue('--file')
  if (live && !only) {
    console.error('--live needs --file <subject>: promote one reviewed subject at a time.')
    return 1
  }
  if (only && !live) {
    console.error('--file scopes a promotion and only means something with --live.')
    return 1
  }

  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  if (only && !files.some((f) => inPromotionScope(f, only))) {
    console.error(`No file matches --file ${only}. Files present: ${files.join(', ')}`)
    return 1
  }

  const byFile = files.map((file) => ({ file, items: JSON.parse(readFileSync(join(DIR, file), 'utf8')) as HiringItem[] }))
  const errors = lintHiringBank(byFile.flatMap((f) => f.items))
  if (errors.length) {
    console.error(`Seeding aborted: ${errors.length} problem(s) in content/hiring.`)
    for (const e of errors.slice(0, 30)) console.error(`  ${e}`)
    return 1
  }

  const env = readEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const svc = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) {
    console.error('Missing Supabase env vars in .env.local')
    return 1
  }
  const auth = { apikey: svc, Authorization: `Bearer ${svc}` }

  // The API returns at most 1000 rows a request. Read short, every question
  // past the first 1000 would look new and a re-seed would demote it to review.
  const readAll = async <T,>(path: string): Promise<T[]> => {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${url}/rest/v1/${path}&order=source_ref`, { headers: { ...auth, Range: `${from}-${from + 999}` } })
      if (!res.ok) throw new Error(`Read failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
      const page = (await res.json()) as T[]
      out.push(...page)
      if (page.length < 1000) return out
    }
  }

  const existing = await readAll<{ source_ref: string; status: ItemStatus }>('hiring_items?select=source_ref,status')
  const current = new Map(existing.map((r) => [r.source_ref, r.status]))

  let promoting = 0
  const rows = byFile.flatMap(({ file, items }) =>
    items.map(({ status: fileStatus, ...item }) => {
      const status = resolveSeedStatus({
        current: current.get(item.source_ref) ?? null,
        promote: live && inPromotionScope(file, only),
        retired: fileStatus === 'retired',
      })
      if (status === 'live' && current.get(item.source_ref) !== 'live') promoting++
      return { ...item, status }
    }),
  )

  console.log(`Seeding ${rows.length} questions · promoting ${promoting} to live`)
  const res = await fetch(`${url}/rest/v1/hiring_items?on_conflict=source_ref`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    console.error(`Seed failed: HTTP ${res.status}\n${(await res.text()).slice(0, 600)}`)
    return 1
  }

  const bank = await readAll<{ subject: string; format: string; status: string }>(
    'hiring_items?select=source_ref,subject,format,status',
  )
  console.log('\nHiring bank (live / review):')
  for (const subject of HIRING_SUBJECTS) {
    const n = (format: string, status: string) =>
      bank.filter((b) => b.subject === subject && b.format === format && b.status === status).length
    console.log(`  ${subject.padEnd(10)} MCQ ${n('mcq', 'live')} / ${n('mcq', 'review')} · typed ${n('numeric', 'live')} / ${n('numeric', 'review')}`)
  }
  if (!live) console.log('\nPromote a subject once reviewed:  npm run hiring:seed -- --live --file <subject>')
  return 0
}

process.exitCode = await main()
