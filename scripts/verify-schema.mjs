// Schema probe. Re-run after every migration.
//
// Verifies that the database actually enforces what the migration claims —
// tables present, RLS closed to anon, and the constraints that matter
// rejecting bad data. A migration that "ran successfully" can still leave a
// constraint silently absent, and the whole design leans on them.
//
//   node scripts/verify-schema.mjs
//
// Writes and then deletes a handful of rows in a transaction-less way, so it
// is safe on an empty database and safe to re-run. It refuses to run against a
// database that already holds leads, so it can never touch real candidates.

import { readFileSync } from 'node:fs'

// ── env ──────────────────────────────────────────────────────────────────────

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !ANON || !SVC) {
  console.error('Missing Supabase env vars in .env.local')
  process.exit(1)
}

// ── helpers ──────────────────────────────────────────────────────────────────

const rest = (path, key, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

/** Distinct from 1 so a skipped run is not read as a failed one. */
const REFUSED = 2

let passed = 0
let failed = 0

function check(label, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Asserts an insert is REJECTED by a constraint. */
async function rejects(label, table, row) {
  const r = await rest(table, SVC, { method: 'POST', body: JSON.stringify(row) })
  const body = await r.text()
  check(label, !r.ok, r.ok ? 'row was ACCEPTED but should have been rejected' : '')
  return body
}

/** Asserts an insert SUCCEEDS, returning the created row. */
async function accepts(label, table, row) {
  const r = await rest(table, SVC, {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'return=representation' },
  })
  const body = await r.text()
  check(label, r.ok, r.ok ? '' : body.slice(0, 160))
  return r.ok ? JSON.parse(body)[0] : null
}

const TABLES = [
  'leads',
  'test_items',
  'assessments',
  'assessment_items',
  'attempts',
  'attempt_answers',
  'attempt_events',
]

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {

  console.log(`\nProbing ${URL_}\n`)

  // Safety: never run against a database holding real leads.
  const existing = await rest('leads?select=id&limit=1', SVC)
  if (!existing.ok) {
    console.error('Cannot read leads — has the migration been applied?')
    return REFUSED
  }
  if ((await existing.json()).length > 0) {
    console.error('SKIPPED: the leads table is not empty.')
    console.error('This probe writes test rows and must never touch real candidate data.')
    console.error('It is a tool for an empty development database.')
    return REFUSED
  }

  console.log('Tables present')
  for (const t of TABLES) {
    const r = await rest(`${t}?select=*&limit=1`, SVC)
    check(t, r.status === 200, `HTTP ${r.status}`)
  }

  console.log('\nRLS closed to the anon key')
  for (const t of TABLES) {
    const r = await rest(`${t}?select=*&limit=1`, ANON)
    const rows = r.ok ? await r.json() : null
    // With RLS on and no anon policy, PostgREST returns an empty set, never rows.
    check(`${t} leaks nothing to anon`, r.status === 200 && Array.isArray(rows) && rows.length === 0, `HTTP ${r.status}`)
  }

  console.log('\nConstraints reject bad data')

  await rejects('leads: rejects a malformed mobile number', 'leads', {
    name: 'Probe', contact_mobile: '12345',
  })
  await rejects('leads: rejects a blank name', 'leads', {
    name: '   ', contact_mobile: '9876543210',
  })
  await rejects('test_items: rejects an MCQ with no options', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'mcq',
    stem: 'probe', answer_key: 'A', rationale: 'probe',
  })
  await rejects('test_items: rejects an MCQ missing option D', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'mcq',
    stem: 'probe', options: { A: '1', B: '2', C: '3' }, answer_key: 'A', rationale: 'probe',
  })
  await rejects('test_items: rejects a numeric item carrying an answer key', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe', numeric_answer: 5, answer_key: 'A', rationale: 'probe',
  })
  await rejects('test_items: rejects a blank rationale', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe', numeric_answer: 5, rationale: '  ',
  })
  await rejects('test_items: rejects an unknown subject', 'test_items', {
    subject: 'history', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe', numeric_answer: 5, rationale: 'probe',
  })

  console.log('\nValid data is accepted')

  const lead = await accepts('leads: accepts a valid lead', 'leads', {
    name: 'Probe Candidate', contact_mobile: '9876543210',
  })
  await accepts('leads: accepts a sibling on the same number', 'leads', {
    name: 'Probe Sibling', contact_mobile: '9876543210',
  })

  const item = await accepts('test_items: accepts a well-formed MCQ', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'mcq',
    stem: 'probe', options: { A: '1', B: '2', C: '3', D: '4' },
    answer_key: 'B', rationale: 'probe',
  })

  console.log('\nReissue cap and paper integrity')

  let assessment = null
  if (lead) {
    for (const seq of [1, 2, 3]) {
      const a = await accepts(`assessments: accepts issue ${seq}`, 'assessments', {
        lead_id: lead.id, token: `probe-token-${seq}-${Date.now()}`, issue_seq: seq,
      })
      if (seq === 1) assessment = a
    }
    await rejects('assessments: rejects a 4th issue — the cap is in the database', 'assessments', {
      lead_id: lead.id, token: `probe-token-4-${Date.now()}`, issue_seq: 4,
    })
    await rejects('assessments: rejects a duplicate issue_seq for the same lead', 'assessments', {
      lead_id: lead.id, token: `probe-token-dup-${Date.now()}`, issue_seq: 1,
    })
    await rejects('assessments: rejects voiding without a reason', 'assessments', {
      lead_id: lead.id, token: `probe-token-v-${Date.now()}`, issue_seq: 4, state: 'voided',
    })
  }

  if (assessment && item) {
    await accepts('assessment_items: accepts a paper position', 'assessment_items', {
      assessment_id: assessment.id, position: 1, item_id: item.id,
    })
    await rejects('assessment_items: rejects the same item twice on one paper', 'assessment_items', {
      assessment_id: assessment.id, position: 2, item_id: item.id,
    })
    await rejects('assessment_items: rejects a position outside 1-15', 'assessment_items', {
      assessment_id: assessment.id, position: 16, item_id: item.id,
    })
  }

  // ── cleanup ──────────────────────────────────────────────────────────────────

  console.log('\nCleaning up probe rows')
  // Sweep by marker rather than by collected id: a row this probe expected to be
  // REJECTED but that slipped through would otherwise be left behind. Every probe
  // row carries name 'Probe ...' or skill 'probe'.
  await rest('leads?name=like.Probe*', SVC, { method: 'DELETE' })
  await rest('test_items?skill=eq.probe', SVC, { method: 'DELETE' })

  // Assert no PROBE rows remain — not that the tables are empty. The real item
  // bank lives in test_items and must survive this probe untouched.
  const leftLeads = await (await rest('leads?select=id&name=like.Probe*', SVC)).json()
  const leftItems = await (await rest('test_items?select=id&skill=eq.probe', SVC)).json()
  check('all probe rows removed', leftLeads.length === 0 && leftItems.length === 0,
    `${leftLeads.length} probe leads, ${leftItems.length} probe items remain`)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  return failed === 0 ? 0 : 1
}

process.exitCode = await main()
