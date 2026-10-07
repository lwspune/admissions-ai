// Seeds content/items/*.json into test_items.
//
//   npm run items:seed                                 # upsert; never changes an existing status
//   npm run items:seed -- --live                       # upsert and promote the WHOLE bank
//   npm run items:seed -- --live --file <batch.json>   # promote one reviewed batch
//
// Idempotent on `ref`: re-running updates the existing row rather than
// creating a duplicate. Promoting to 'live' is the answer-key sign-off, so it
// takes an explicit flag — seeding and approving are not the same act.
//
// Seeding never demotes. An upsert rewrites every column it supplies, so a
// plain re-seed that names `status` pulls live items out of circulation and
// nothing says so until staff cannot issue a paper. The rule lives in
// src/lib/items.ts where it is unit-tested; this script only applies it.
//
// Runs the lint first and refuses to seed if it fails. The item bank is the
// one place where a bad row is both expensive and invisible.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSeedStatus, inPromotionScope, type ItemStatus } from '../src/lib/items'
import { lintItems } from './items-lint.mts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'content', 'items')
const SUBJECTS = ['maths', 'english', 'science']
const DIFFICULTIES = ['easy', 'moderate', 'difficult']

function readEnv(): Record<string, string> {
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

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i === -1) return undefined
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : undefined
}

async function main(): Promise<number> {
  const live = process.argv.includes('--live')
  const only = flagValue('--file')

  if (only && !live) {
    console.error('--file scopes a promotion and only means something with --live.')
    return 1
  }

  if (lintItems() !== 0) {
    console.error('\nSeeding aborted: item lint failed.\n')
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

  // What the database already holds, so an upsert can preserve it.
  const existingRows: { ref: string; status: ItemStatus }[] = await (
    await fetch(`${url}/rest/v1/test_items?select=ref,status`, { headers: auth })
  ).json()
  const current = new Map(existingRows.map((r) => [r.ref, r.status]))

  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  if (only && !files.some((f) => inPromotionScope(f, only))) {
    console.error(`\nNo item file matches --file ${only}. Files present: ${files.join(', ')}\n`)
    return 1
  }

  const items = []
  let promoting = 0
  let retiring = 0
  for (const file of files) {
    const promote = live && inPromotionScope(file, only)
    for (const item of JSON.parse(readFileSync(join(DIR, file), 'utf8'))) {
      const status = resolveSeedStatus({ current: current.get(item.ref) ?? null, promote, retired: item.status === 'retired' })
      if (status === 'live' && current.get(item.ref) !== 'live') promoting++
      if (status === 'retired' && current.get(item.ref) !== 'retired') retiring++
      items.push({
        ref: item.ref,
        subject: item.subject,
        skill: item.skill,
        difficulty: item.difficulty,
        taught_in: item.taught_in,
        // Sent on every upsert, as the seed sends every column it names: an
        // item that does not say otherwise is basics, and only syllabus
        // content carries a term (migration 0014).
        part: item.part ?? 'basics',
        term: item.part === 'syllabus' ? item.term : null,
        format: item.format,
        stem: item.stem,
        options: item.format === 'mcq' ? item.options : null,
        answer_key: item.format === 'mcq' ? item.answer_key : null,
        numeric_answer: item.format === 'numeric' ? item.numeric_answer : null,
        numeric_tolerance: item.format === 'numeric' ? (item.numeric_tolerance ?? 0) : 0,
        rationale: item.rationale,
        status,
      })
    }
  }

  const held = items.filter((i) => i.status === 'review').length
  console.log(`\nSeeding ${items.length} items · promoting ${promoting} to live · retiring ${retiring} · ${held} held at review`)
  if (live && !only) console.log('  --live without --file promotes every batch, reviewed or not.')

  const res = await fetch(`${url}/rest/v1/test_items?on_conflict=ref`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(items),
  })

  if (!res.ok) {
    console.error(`\nSeed failed: HTTP ${res.status}`)
    console.error((await res.text()).slice(0, 600))
    return 1
  }

  console.log(`Upserted ${((await res.json()) as unknown[]).length} rows.\n`)

  const inBank: { subject: string; difficulty: string }[] = await (
    await fetch(`${url}/rest/v1/test_items?select=subject,difficulty&status=eq.live`, { headers: auth })
  ).json()

  const counts: Record<string, number> = {}
  for (const r of inBank) {
    const k = `${r.subject}/${r.difficulty}`
    counts[k] = (counts[k] ?? 0) + 1
  }

  console.log('Live bank:')
  for (const subject of SUBJECTS) {
    const parts = DIFFICULTIES.map((d) => `${d} ${counts[`${subject}/${d}`] ?? 0}`)
    console.log(`  ${subject.padEnd(8)} ${parts.join(' · ')}`)
  }
  console.log(`  total    ${inBank.length}\n`)

  if (held > 0) {
    console.log(`${held} item(s) are at 'review' and are not drawable.`)
    console.log('Promote a batch once reviewed:  npm run items:seed -- --live --file <batch.json>\n')
  }
  return 0
}

process.exitCode = await main()
