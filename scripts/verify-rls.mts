// RLS probe. Signs in as a real staff member and checks what the policies
// actually allow — not what they were meant to allow.
//
//   npm run db:verify-rls -- <email> <password>
//
// The schema probe (verify-schema.mjs) runs as service role, which bypasses
// RLS entirely and therefore proves nothing about access control. This one
// uses the anon key plus a session, so every statement below is governed by
// the same policies a real staff member hits.
//
// Writes and removes a couple of throwaway rows; refuses to run against a
// database holding real leads.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assemblePaper, type PoolItem } from '../src/lib/assemble'
import { generateToken } from '../src/lib/token'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKER = 'RLSProbe'

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const
    }),
)

let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ''}`)
  }
}

async function main(): Promise<number> {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('\nUsage: npm run db:verify-rls -- <email> <password>\n')
    return 1
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const svc = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { count: realLeads } = await svc
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .not('name', 'like', `${MARKER}%`)
  if ((realLeads ?? 0) > 0) {
    console.error('\nSKIPPED: this database holds real leads.')
    console.error('This probe writes rows and must never touch candidate data.')
    console.error('It is a tool for an empty development database.')
    return 2 // distinct from 1, so a skip is never read as a failure
  }

  const db = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email, password })
  if (authErr || !auth.user) {
    console.error(`\nCould not sign in: ${authErr?.message}\n`)
    return 1
  }
  console.log(`\nSigned in as ${auth.user.email} · role ${auth.user.app_metadata?.role}\n`)

  // ── what staff may do ──────────────────────────────────────────────────────
  console.log('Staff can:')

  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({ name: `${MARKER} Candidate`, contact_mobile: '9700000002' })
    .select()
    .single()
  check('create a lead', !leadErr, leadErr?.message)

  const { error: readErr } = await db.from('leads').select('id').limit(1)
  check('read leads', !readErr, readErr?.message)

  const { data: pool } = await db.from('test_items').select('id, subject, difficulty').eq('status', 'live')
  check('read the item bank', (pool?.length ?? 0) > 0)

  // Who may read the bank, and how much of it.
  //
  // Superadmin browses it, answer keys included — that is /items. Every other
  // role must not: a telecaller who can read the keys can coach the items, and
  // they are measured on candidates reaching the counsellor. Unissued and
  // review-status rows are the sharp edge, since that is the sign-off queue.
  //
  // This assertion is role-aware because the probe signs in as exactly one
  // person. Run it as a superadmin AND as a counsellor; a single green run
  // proves only half of it.
  const role = auth.user.app_metadata?.role
  const { count: reviewVisible } = await db
    .from('test_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'review')
  const { count: reviewReal } = await svc
    .from('test_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'review')

  if (role === 'superadmin') {
    check(
      `superadmin reads the whole bank (${reviewReal} review items)`,
      (reviewReal ?? 0) === 0 || (reviewVisible ?? 0) === (reviewReal ?? 0),
      `saw ${reviewVisible} of ${reviewReal}`,
    )
  } else {
    check(
      `${role} cannot read unreviewed items (${reviewReal} exist)`,
      (reviewVisible ?? 0) === 0,
      `saw ${reviewVisible} of ${reviewReal} — the answer keys are readable`,
    )
  }

  const paper = assemblePaper({ pool: (pool ?? []) as PoolItem[] })
  const { data: assessment, error: issueErr } = await db.rpc('issue_assessment', {
    p_lead_id: lead!.id,
    p_issued_by: auth.user.id,
    p_token: generateToken(),
    p_item_ids: paper.map((i) => i.id),
  })
  check('issue a test (needs the assessment_items insert policy)', !issueErr, issueErr?.message)

  if (assessment) {
    const { count } = await db
      .from('assessment_items')
      .select('position', { count: 'exact', head: true })
      .eq('assessment_id', assessment.id)
    check('the issued paper holds all 15 questions', count === 15, `got ${count}`)
  }

  // ── what staff may NOT do ──────────────────────────────────────────────────
  console.log('\nStaff cannot:')

  const { error: attemptErr } = await db
    .from('attempts')
    .insert({ assessment_id: assessment!.id, deadline_at: new Date().toISOString() })
  check('write an attempt — only the candidate API does', attemptErr != null, 'it was ALLOWED')

  const { error: answerErr } = await db
    .from('attempt_answers')
    .insert({ attempt_id: assessment!.id, position: 1, choice: 'A' })
  check('write an answer', answerErr != null, 'it was ALLOWED')

  // A frozen paper must be immutable: a question changing under a candidate
  // mid-attempt is exactly what assessment_items exists to prevent.
  await db.from('assessment_items').delete().eq('assessment_id', assessment!.id)
  const { count: left } = await db
    .from('assessment_items')
    .select('position', { count: 'exact', head: true })
    .eq('assessment_id', assessment!.id)
  check('delete a frozen paper', left === 15, `${left} of 15 rows survived`)

  // ── what anonymous visitors may see ────────────────────────────────────────
  await db.auth.signOut()
  console.log('\nSigned out, the anon key sees nothing:')
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  for (const table of ['leads', 'test_items', 'assessments', 'attempts', 'attempt_answers']) {
    const { data } = await anon.from(table).select('*').limit(1)
    check(`${table}`, Array.isArray(data) && data.length === 0, `returned ${data?.length} row(s)`)
  }

  await svc.from('leads').delete().like('name', `${MARKER}%`)
  console.log(`\n${pass} passed, ${fail} failed\n`)
  return fail === 0 ? 0 : 1
}

process.exitCode = await main()
