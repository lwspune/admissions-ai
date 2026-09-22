// Seeds content/items/*.json into test_items.
//
//   npm run items:seed            # upsert as status='review'
//   npm run items:seed -- --live  # upsert and promote to status='live'
//
// Idempotent on `ref`: re-running updates the existing row rather than
// creating a duplicate. Promoting to 'live' is the answer-key sign-off, so it
// takes an explicit flag — seeding and approving are not the same act.
//
// Runs the lint first and refuses to seed if it fails. The item bank is the
// one place where a bad row is both expensive and invisible.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'content', 'items')
const SUBJECTS = ['maths', 'english', 'science']
const DIFFICULTIES = ['easy', 'moderate', 'difficult']

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
  const live = process.argv.includes('--live')

  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'items-lint.mjs')], { stdio: 'inherit' })
  } catch {
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

  const items = []
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    for (const item of JSON.parse(readFileSync(join(DIR, file), 'utf8'))) {
      items.push({
        ref: item.ref,
        subject: item.subject,
        skill: item.skill,
        difficulty: item.difficulty,
        format: item.format,
        stem: item.stem,
        options: item.format === 'mcq' ? item.options : null,
        answer_key: item.format === 'mcq' ? item.answer_key : null,
        numeric_answer: item.format === 'numeric' ? item.numeric_answer : null,
        numeric_tolerance: item.format === 'numeric' ? (item.numeric_tolerance ?? 0) : 0,
        rationale: item.rationale,
        status: live ? 'live' : 'review',
      })
    }
  }

  console.log(`\nSeeding ${items.length} items as status='${live ? 'live' : 'review'}'`)

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

  console.log(`Upserted ${(await res.json()).length} rows.\n`)

  const inBank = await (
    await fetch(`${url}/rest/v1/test_items?select=subject,difficulty&status=eq.live`, { headers: auth })
  ).json()

  const counts = {}
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

  if (!live) console.log("Nothing is drawable until items are 'live'. Re-run with --live to promote.\n")
  return 0
}

process.exitCode = await main()
