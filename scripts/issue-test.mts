// Issues a test link for manual end-to-end checking.
//
//   npm run issue -- "Candidate Name" 9876543210 11
//
// The third argument is the class the candidate is being admitted to (8-12).
// It decides the pool: an admit to class N draws content taught up to N-1.
//
// The throwaway version of what the staff console will do. It exists so the
// candidate flow can be exercised on a real phone before that console is built.
//
// It deliberately does NOT import src/server/assessments.ts: that module is
// marked `server-only`, which throws outside Next's bundler, and shimming that
// away here would risk weakening the guard in the real build. It calls the same
// `issue_assessment` RPC and the same pure draw, so the risky part — the
// transactional write — is still the code that ships.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assemblePaper, type PoolItem } from '../src/lib/assemble'
import { parseClassLevel } from '../src/lib/classes'
import { generateToken } from '../src/lib/token'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const
    }),
)

async function main(): Promise<number> {
  const [name, mobile, rawClass] = process.argv.slice(2)
  const classLevel = parseClassLevel(rawClass)
  if (!name || !mobile || classLevel === null) {
    console.error('\nUsage: npm run issue -- "Candidate Name" 9876543210 <8|9|10|11|12>\n')
    return 1
  }

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data: existing } = await db.from('leads').select('id, name').eq('contact_mobile', mobile)

  let leadId: string
  if (existing?.length) {
    leadId = existing[0]!.id
    console.log(`\nUsing existing lead: ${existing[0]!.name}`)
  } else {
    const { data, error } = await db
      .from('leads')
      .insert({ name, contact_mobile: mobile, class_level: classLevel })
      .select()
      .single()
    if (error) {
      console.error(`\nCould not create the lead: ${error.message}\n`)
      return 1
    }
    leadId = data.id
    console.log(`\nCreated lead: ${name}`)
  }

  // The lead's stored class wins over the argument when they differ: the
  // database checks the paper against the row, not against the command line.
  const { data: leadRow } = await db.from('leads').select('class_level').eq('id', leadId).single()
  const forClass = parseClassLevel(leadRow?.class_level) ?? classLevel

  const { data: pool } = await db.rpc('live_pool', { p_class: forClass })
  const { data: priors } = await db.from('assessments').select('id').eq('lead_id', leadId)
  const { data: seenRows } = priors?.length
    ? await db.from('assessment_items').select('item_id').in('assessment_id', priors.map((p) => p.id))
    : { data: [] }

  let paper
  try {
    paper = assemblePaper({
      pool: (pool ?? []) as PoolItem[],
      excludeItemIds: (seenRows ?? []).map((r) => r.item_id as string),
      forClass,
    })
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
    return 1
  }

  const { data: assessment, error } = await db.rpc('issue_assessment', {
    p_lead_id: leadId,
    p_issued_by: null,
    p_token: generateToken(),
    p_item_ids: paper.map((i) => i.id),
  })

  if (error) {
    console.error(`\n${error.message}\n`)
    return 1
  }

  const base = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  console.log(
    `Issue ${assessment.issue_seq} of 3 · expires ${new Date(assessment.expires_at).toLocaleTimeString()}`,
  )
  console.log(`\n  ${base}/t/${assessment.token}\n`)
  console.log(`Identify with: ${mobile}\n`)
  return 0
}

process.exitCode = await main()
