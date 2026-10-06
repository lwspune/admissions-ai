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

/** Calls a Postgres function through PostgREST as service role. */
async function rpc(fn, args) {
  const r = await rest(`rpc/${fn}`, SVC, { method: 'POST', body: JSON.stringify(args) })
  return { ok: r.ok, body: await r.text() }
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
  await rejects('leads: rejects an admitting class below 9', 'leads', {
    name: 'Probe Class8', contact_mobile: '9876543210', class_level: 8,
  })
  await rejects('leads: rejects an admitting class above 12', 'leads', {
    name: 'Probe Class13', contact_mobile: '9876543210', class_level: 13,
  })
  await rejects('test_items: rejects taught_in below the floor (6)', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe', numeric_answer: 5, rationale: 'probe', taught_in: 5,
  })
  await rejects('test_items: rejects taught_in at class 12 — nobody may be tested on it', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe', numeric_answer: 5, rationale: 'probe', taught_in: 12,
  })

  console.log('\nValid data is accepted')

  const lead = await accepts('leads: accepts a valid lead', 'leads', {
    name: 'Probe Candidate', contact_mobile: '9876543210', class_level: 9,
  })
  const sibling = await accepts('leads: accepts a sibling on the same number', 'leads', {
    name: 'Probe Sibling', contact_mobile: '9876543210', class_level: 12,
  })
  const unclassed = await accepts('leads: accepts a lead with no class yet', 'leads', {
    name: 'Probe Unclassed', contact_mobile: '9876543210',
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
    await rejects('assessment_items: rejects a position outside 1-30', 'assessment_items', {
      assessment_id: assessment.id, position: 31, item_id: item.id,
    })
  }

  console.log('\nItem parts (migration 0014)')
  const syllabusItem = (over) => ({
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe syllabus', numeric_answer: 5, rationale: 'probe', status: 'review',
    part: 'syllabus', term: 1, taught_in: 9, ...over,
  })
  await accepts('test_items: accepts a first-term class 9 syllabus item', 'test_items', syllabusItem({}))
  await rejects('test_items: rejects a syllabus item with no term', 'test_items', syllabusItem({ term: null }))
  await rejects('test_items: rejects a basics item with a term', 'test_items', syllabusItem({ part: 'basics' }))
  await rejects('test_items: rejects English syllabus content', 'test_items', syllabusItem({ subject: 'english' }))
  await rejects('test_items: rejects syllabus content below class 7', 'test_items', syllabusItem({ taught_in: 6 }))

  console.log('\nClass scoping (live_pool + issue_assessment)')

  // A live item taught in class 11: drawable for a class 12 admit and nobody
  // younger. Skill 'probe' so the sweep below removes it.
  const senior = await accepts('test_items: accepts a live item taught in class 11', 'test_items', {
    subject: 'maths', skill: 'probe', difficulty: 'easy', format: 'numeric',
    stem: 'probe senior', numeric_answer: 5, rationale: 'probe', status: 'live', taught_in: 11,
  })

  const poolFor = async (cls) => {
    const r = await rpc('live_pool', { p_class: cls })
    return r.ok ? JSON.parse(r.body).map((row) => row.id) : []
  }

  if (senior) {
    const pool9 = await poolFor(9)
    const pool12 = await poolFor(12)
    check('live_pool(9) hides the class 11 item', !pool9.includes(senior.id))
    check('live_pool(12) shows the class 11 item', pool12.includes(senior.id))

    // The RPC checks need fourteen other live items a class 9 admit may see.
    // A fresh database with no seeded bank has none; say so rather than
    // asserting against an empty paper.
    const juniorPool = pool9.filter((id) => id !== senior.id)
    if (juniorPool.length < 15) {
      console.log(`  SKIP  issue_assessment class checks — ${juniorPool.length} live class-9 items; seed the bank first`)
    } else {
      const mixed = [...juniorPool.slice(0, 14), senior.id]
      const allJunior = juniorPool.slice(0, 15)

      if (unclassed) {
        const r = await rpc('issue_assessment', {
          p_lead_id: unclassed.id, p_issued_by: null, p_token: `probe-rpc-u-${Date.now()}`, p_item_ids: allJunior,
        })
        check('issue_assessment: refuses a lead with no admitting class', !r.ok && /class/i.test(r.body), r.ok ? 'it was ISSUED' : r.body.slice(0, 160))
      }
      if (sibling) {
        const r = await rpc('issue_assessment', {
          p_lead_id: sibling.id, p_issued_by: null, p_token: `probe-rpc-12-${Date.now()}`, p_item_ids: mixed,
        })
        check('issue_assessment: accepts the class 11 item on a class 12 admit’s paper', r.ok, r.body.slice(0, 160))
      }
      // `lead` is class 9 but already carries three direct-insert assessments,
      // so the cap would reject before the ceiling could. Use a fresh one.
      const junior = await accepts('leads: accepts a second class 9 lead', 'leads', {
        name: 'Probe Junior', contact_mobile: '9876543211', class_level: 9,
      })
      if (junior) {
        const r = await rpc('issue_assessment', {
          p_lead_id: junior.id, p_issued_by: null, p_token: `probe-rpc-9-${Date.now()}`, p_item_ids: mixed,
        })
        check('issue_assessment: refuses the class 11 item on a class 9 admit’s paper', !r.ok && /ceiling|class/i.test(r.body), r.ok ? 'it was ISSUED' : r.body.slice(0, 160))
      }
    }
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
