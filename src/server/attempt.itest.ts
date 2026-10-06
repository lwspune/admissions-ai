import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { serviceClient } from './supabase'
import { issueAssessment } from './assessments'
import { openByToken, identify, startAttempt, saveAnswer, recordEvents, submitAttempt } from './attempt'
import { limitMsFor } from '../lib/types'

const LIMIT_MS = limitMsFor(15)

// Integration tests against the real database (npm run test:integration).
// Mocks would not exercise the constraints, triggers and RPC that most of this
// design leans on — which is the whole point of putting the rules down there.

const db = serviceClient()
const MOBILE = '9812345678'
let leadId: string

/**
 * Moves an assessment's whole window into the past.
 *
 * `created_at` has to move too: the assessments_window_positive CHECK requires
 * expires_at > created_at, so setting only a past expiry silently fails the
 * UPDATE and the test then asserts against an unchanged row.
 */
async function expireWindow(assessmentId: string) {
  const { error } = await db
    .from('assessments')
    .update({
      created_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      expires_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    })
    .eq('id', assessmentId)
  if (error) throw new Error(`could not expire the window: ${error.message}`)
}

/**
 * A lead admitted to `classLevel`, or with no class when null. Issuing needs a
 * class; the one test that passes null is checking that it is refused.
 */
async function freshLead(classLevel: number | null = 11) {
  await db.from('leads').delete().like('name', 'ITest%')
  const { data, error } = await db
    .from('leads')
    .insert({ name: 'ITest Candidate', contact_mobile: MOBILE, class_level: classLevel })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data.id as string
}

beforeEach(async () => {
  leadId = await freshLead()
})

type PoolRow = { id: string; subject: string; part: string }

/**
 * A 15-question paper by hand: five basics per subject from this pool, minus
 * any ids in `skip`, plus the ids in `extra` counted against their subject.
 * The database checks the per-subject make-up (migration 0014), so a paper
 * built to test some other rule has to have the right shape first.
 */
function basicsPaper(pool: PoolRow[], { skip = [], extra = [] }: { skip?: string[]; extra?: PoolRow[] } = {}): string[] {
  const ids: string[] = extra.map((r) => r.id)
  for (const subject of ['maths', 'english', 'science']) {
    const need = 5 - extra.filter((r) => r.subject === subject).length
    ids.push(
      ...pool
        .filter((r) => r.subject === subject && r.part === 'basics' && !skip.includes(r.id) && !ids.includes(r.id))
        .slice(0, need)
        .map((r) => r.id),
    )
  }
  return ids
}

afterAll(async () => {
  await db.from('leads').delete().like('name', 'ITest%')
})

// ── issuing ──────────────────────────────────────────────────────────────────

describe('issueAssessment', () => {
  it('issues a 15-question paper with the right composition', async () => {
    const { assessment } = await issueAssessment(db, { leadId })

    const { data: items } = await db
      .from('assessment_items')
      .select('position, test_items(subject, difficulty)')
      .eq('assessment_id', assessment.id)
      .order('position')

    expect(items).toHaveLength(15)
    expect(items!.map((i) => i.position)).toEqual(Array.from({ length: 15 }, (_, n) => n + 1))

    for (const subject of ['maths', 'english', 'science']) {
      const forSubject = items!.filter((i) => (i.test_items as never as { subject: string }).subject === subject)
      expect(forSubject).toHaveLength(5)
    }
  })

  it('sets a 2-hour window from creation', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const span = new Date(assessment.expires_at).getTime() - new Date(assessment.created_at).getTime()
    expect(span).toBe(2 * 60 * 60 * 1000)
  })

  it('generates a distinct unguessable token each time', async () => {
    const a = await issueAssessment(db, { leadId })
    const b = await issueAssessment(db, { leadId })
    expect(a.assessment.token).not.toBe(b.assessment.token)
    expect(a.assessment.token).toHaveLength(22)
  })

  it('increments issue_seq and voids the previous token', async () => {
    const first = await issueAssessment(db, { leadId })
    const second = await issueAssessment(db, { leadId })

    expect(first.assessment.issue_seq).toBe(1)
    expect(second.assessment.issue_seq).toBe(2)

    const { data: old } = await db.from('assessments').select('*').eq('id', first.assessment.id).single()
    expect(old!.state).toBe('voided')
    expect(old!.voided_reason).toMatch(/reissue/i)
    expect(old!.superseded_by).toBe(second.assessment.id)
  })

  it('refuses a 4th issue', async () => {
    await issueAssessment(db, { leadId })
    await issueAssessment(db, { leadId })
    await issueAssessment(db, { leadId })
    await expect(issueAssessment(db, { leadId })).rejects.toThrow(/3 tests|limit/i)
  })

  it('refuses to reissue once an attempt has been submitted', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await identify(db, { token: assessment.token, mobile: MOBILE })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })

    await expect(issueAssessment(db, { leadId })).rejects.toThrow(/submitted/i)
  })

  it('refuses a lead with no admitting class, before the draw', async () => {
    const unclassed = await freshLead(null)
    await expect(issueAssessment(db, { leadId: unclassed })).rejects.toThrow(/class/i)
    const { count } = await db.from('assessments').select('id', { count: 'exact', head: true }).eq('lead_id', unclassed)
    expect(count).toBe(0)
  })
})

// ── class scoping ────────────────────────────────────────────────────────────
//
// An admit to class N is tested on content taught up to N−1 (src/lib/classes).
// The draw filters through live_pool(p_class); issue_assessment re-checks the
// paper inside its transaction. Both are proved here against a live item that
// only a class 12 admit may see.

describe('issueAssessment — class scoping', () => {
  const SENIOR = { skill: 'ITest-senior', taught_in: 11 }
  let seniorItemId: string

  async function removeSeniorItem() {
    // Papers referencing it go with their leads; freshLead already swept those.
    await db.from('leads').delete().like('name', 'ITest%')
    await db.from('test_items').delete().eq('skill', SENIOR.skill)
  }

  beforeEach(async () => {
    await removeSeniorItem()
    const { data, error } = await db
      .from('test_items')
      .insert({
        subject: 'maths', skill: SENIOR.skill, difficulty: 'easy', format: 'numeric',
        stem: 'ITest senior-only item', numeric_answer: 1, rationale: 'Integration fixture: class 11 content.',
        status: 'live', taught_in: SENIOR.taught_in,
      })
      .select('id')
      .single()
    if (error) throw new Error(`could not create fixture item: ${error.message}`)
    seniorItemId = data.id as string
  })

  afterAll(removeSeniorItem)

  it('live_pool shows a class 11 item to a class 12 admit and to nobody younger', async () => {
    for (const classLevel of [8, 9, 10, 11]) {
      const { data } = await db.rpc('live_pool', { p_class: classLevel })
      expect((data ?? []).map((r: { id: string }) => r.id)).not.toContain(seniorItemId)
    }
    const { data: senior } = await db.rpc('live_pool', { p_class: 12 })
    expect((senior ?? []).map((r: { id: string }) => r.id)).toContain(seniorItemId)
  })

  it('never puts an item above the ceiling on a younger admit’s paper', async () => {
    const lead9 = await freshLead(9)
    const { assessment } = await issueAssessment(db, { leadId: lead9 })
    const { data: items } = await db
      .from('assessment_items')
      .select('item_id, test_items(taught_in)')
      .eq('assessment_id', assessment.id)
    expect(items).toHaveLength(15)
    for (const row of items!) {
      expect((row.test_items as never as { taught_in: number }).taught_in).toBeLessThanOrEqual(8)
    }
  })

  it('issues a class 8 admit a paper of content taught up to class 7', async () => {
    const lead8 = await freshLead(8)
    const { assessment } = await issueAssessment(db, { leadId: lead8 })
    const { data: items } = await db
      .from('assessment_items')
      .select('item_id, test_items(taught_in)')
      .eq('assessment_id', assessment.id)
    expect(items).toHaveLength(15)
    for (const row of items!) {
      expect((row.test_items as never as { taught_in: number }).taught_in).toBeLessThanOrEqual(7)
    }
  })

  it('the database refuses a paper holding an item above the ceiling, whatever the caller drew', async () => {
    const lead9 = await freshLead(9)
    const { data: pool } = await db.rpc('live_pool', { p_class: 9 })
    const paper = basicsPaper(pool as PoolRow[], {
      skip: [seniorItemId],
      extra: [{ id: seniorItemId, subject: 'maths', part: 'basics' }],
    })

    const { error } = await db.rpc('issue_assessment', {
      p_lead_id: lead9,
      p_issued_by: null,
      p_token: 'itest-ceiling-' + Date.now(),
      p_item_ids: paper,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/class|ceiling/i)

    const { count } = await db.from('assessments').select('id', { count: 'exact', head: true }).eq('lead_id', lead9)
    expect(count).toBe(0)
  })

  it('accepts the same paper for a class 12 admit', async () => {
    const lead12 = await freshLead(12)
    const { data: pool } = await db.rpc('live_pool', { p_class: 12 })
    const paper = basicsPaper(pool as PoolRow[], {
      skip: [seniorItemId],
      extra: [{ id: seniorItemId, subject: 'maths', part: 'basics' }],
    })

    const { error } = await db.rpc('issue_assessment', {
      p_lead_id: lead12,
      p_issued_by: null,
      p_token: 'itest-ceiling-ok-' + Date.now(),
      p_item_ids: paper,
    })
    expect(error).toBeNull()
  })
})

// ── the 30-question paper (migration 0014) ───────────────────────────────────
//
// Fixture: exactly one paper's worth of first-term class 7 syllabus items
// (3/1/1 in maths and in science), so a class 8 admit can be drawn 30
// questions. Class 8 because no real lead is a class 8 admit: a real paper
// issued while these exist cannot pick one up. Plus two items that must NOT
// be drawn for a class 8 admit: second-term class 7, and first-term class 8.

describe('the 30-question paper', () => {
  const SKILL = 'ITest-syllabus'

  async function removeFixtures() {
    await db.from('leads').delete().like('name', 'ITest%')
    await db.from('test_items').delete().eq('skill', SKILL)
  }

  const row = (subject: string, difficulty: string, over: Record<string, unknown> = {}) => ({
    subject,
    skill: SKILL,
    difficulty,
    format: 'numeric',
    stem: `ITest syllabus ${subject} ${difficulty}`,
    numeric_answer: 1,
    rationale: 'Integration fixture: class 7 first-term syllabus.',
    status: 'live',
    part: 'syllabus',
    term: 1,
    taught_in: 7,
    ...over,
  })

  let secondTermId: string
  let classEightId: string

  beforeEach(async () => {
    await removeFixtures()
    const rows = []
    for (const subject of ['maths', 'science']) {
      rows.push(row(subject, 'easy'), row(subject, 'easy'), row(subject, 'easy'))
      rows.push(row(subject, 'moderate'), row(subject, 'difficult'))
    }
    const { error } = await db.from('test_items').insert(rows)
    if (error) throw new Error(`could not create syllabus fixtures: ${error.message}`)

    const { data: t2 } = await db
      .from('test_items')
      .insert(row('maths', 'easy', { term: 2, stem: 'ITest term 2' }))
      .select('id')
      .single()
    const { data: c8 } = await db
      .from('test_items')
      .insert(row('maths', 'easy', { taught_in: 8, stem: 'ITest class 8' }))
      .select('id')
      .single()
    secondTermId = t2!.id as string
    classEightId = c8!.id as string
  })

  afterAll(removeFixtures)

  it('live_pool offers a class 8 admit only first-term class 7 syllabus items', async () => {
    const { data } = await db.rpc('live_pool', { p_class: 8 })
    const syllabus = (data as PoolRow[]).filter((r) => r.part === 'syllabus')
    expect(syllabus).toHaveLength(10)
    const ids = (data as PoolRow[]).map((r) => r.id)
    expect(ids).not.toContain(secondTermId)
    expect(ids).not.toContain(classEightId)
  })

  it('issues a class 8 admit 30 questions: ten per subject, five syllabus in maths and science', async () => {
    const lead8 = await freshLead(8)
    const { assessment } = await issueAssessment(db, { leadId: lead8 })
    expect(assessment.question_count).toBe(30)
    expect(assessment.limit_minutes).toBe(30)
    expect(assessment.class_level).toBe(8)

    const { data: items } = await db
      .from('assessment_items')
      .select('position, test_items(subject, part)')
      .eq('assessment_id', assessment.id)
    expect(items).toHaveLength(30)
    const count = (subject: string, part: string) =>
      items!.filter((r) => {
        const t = r.test_items as never as { subject: string; part: string }
        return t.subject === subject && t.part === part
      }).length
    expect(count('english', 'basics')).toBe(10)
    expect(count('maths', 'basics')).toBe(5)
    expect(count('maths', 'syllabus')).toBe(5)
    expect(count('science', 'basics')).toBe(5)
    expect(count('science', 'syllabus')).toBe(5)
  })

  it('keeps a class without syllabus items on the 15-question paper', async () => {
    const lead9 = await freshLead(9)
    const { assessment } = await issueAssessment(db, { leadId: lead9 })
    expect(assessment.question_count).toBe(15)
    expect(assessment.limit_minutes).toBe(15)
    expect(assessment.class_level).toBe(9)
  })

  it('tells the candidate 30 questions, 30 minutes and the syllabus class', async () => {
    const lead8 = await freshLead(8)
    const { assessment } = await issueAssessment(db, { leadId: lead8 })
    const opened = await openByToken(db, assessment.token)
    expect(opened).toMatchObject({ status: 'ok', questionCount: 30, minutes: 30, syllabusClass: 7 })
  })

  it('runs 30 minutes and labels each question with its part, and nothing more', async () => {
    const lead8 = await freshLead(8)
    const { assessment } = await issueAssessment(db, { leadId: lead8 })
    const { attempt, questions } = await startAttempt(db, { token: assessment.token, context: {} })
    const remaining = new Date(attempt.deadline_at).getTime() - Date.now()
    expect(remaining).toBeGreaterThan(limitMsFor(30) - 10_000)
    expect(questions.filter((q) => q.part === 'syllabus')).toHaveLength(10)
    const json = JSON.stringify(questions)
    expect(json).not.toContain('taught_in')
    expect(json).not.toContain('term')
  })

  it('the database refuses 30 basics items: the syllabus part is part of the shape', async () => {
    const lead8 = await freshLead(8)
    const { data: pool } = await db.rpc('live_pool', { p_class: 8 })
    const basics = (pool as PoolRow[]).filter((r) => r.part === 'basics')
    const thirty = ['maths', 'english', 'science'].flatMap((s) =>
      basics.filter((r) => r.subject === s).slice(0, 10).map((r) => r.id),
    )
    expect(thirty).toHaveLength(30)
    const { error } = await db.rpc('issue_assessment', {
      p_lead_id: lead8,
      p_issued_by: null,
      p_token: 'itest-shape-' + Date.now(),
      p_item_ids: thirty,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/30-question paper must be/)
  })
})

// ── opening the link ─────────────────────────────────────────────────────────

describe('openByToken', () => {
  it('returns the candidate name and window, never the paper', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const view = await openByToken(db, assessment.token)

    expect(view.status).toBe('ok')
    // Narrows the union; expect() above already failed the test if not 'ok'.
    if (view.status !== 'ok') throw new Error(`expected ok, got ${view.status}`)
    expect(view.candidateName).toBe('ITest Candidate')
    expect(JSON.stringify(view)).not.toContain('answer_key')
    expect('questions' in view).toBe(false)
  })

  it('marks the assessment opened', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await openByToken(db, assessment.token)
    const { data } = await db.from('assessments').select('state').eq('id', assessment.id).single()
    expect(data!.state).toBe('opened')
  })

  it('reports an unknown token as not-found without a database error', async () => {
    const view = await openByToken(db, 'aaaaaaaaaaaaaaaaaaaaaa')
    expect(view.status).toBe('not_found')
  })

  it('reports a malformed token as not-found without querying', async () => {
    expect((await openByToken(db, "'; drop table leads;--")).status).toBe('not_found')
    expect((await openByToken(db, '')).status).toBe('not_found')
  })

  it('reports a voided token as not-found, so a reissued link kills the old one', async () => {
    const first = await issueAssessment(db, { leadId })
    await issueAssessment(db, { leadId })
    expect((await openByToken(db, first.assessment.token)).status).toBe('not_found')
  })

  it('reports an expired window', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await expireWindow(assessment.id)
    expect((await openByToken(db, assessment.token)).status).toBe('expired')
  })

  it('reports too_late when under 15 minutes remain', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await db
      .from('assessments')
      .update({ expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq('id', assessment.id)
    expect((await openByToken(db, assessment.token)).status).toBe('too_late')
  })
})

// ── identity ─────────────────────────────────────────────────────────────────

describe('identify', () => {
  it('accepts the number the link was sent to', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const r = await identify(db, { token: assessment.token, mobile: MOBILE })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected identify to succeed')
    expect(r.candidateName).toBe('ITest Candidate')
  })

  it('accepts the same number spelled differently', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    expect((await identify(db, { token: assessment.token, mobile: '+91 98123 45678' })).ok).toBe(true)
  })

  it('rejects a different number', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const r = await identify(db, { token: assessment.token, mobile: '9999999999' })
    expect(r.ok).toBe(false)
    expect('candidateName' in r).toBe(false)
  })

  it('locks the token after 5 failed attempts', async () => {
    const { assessment } = await issueAssessment(db, { leadId })

    for (let n = 1; n <= 4; n++) {
      const r = await identify(db, { token: assessment.token, mobile: '9999999999' })
      expect(r.ok).toBe(false)
      if (r.ok) throw new Error('unreachable')
      expect(r.locked).toBe(false)
      expect(r.remaining).toBe(5 - n)
    }

    const fifth = await identify(db, { token: assessment.token, mobile: '9999999999' })
    expect(fifth.ok).toBe(false)
    if (fifth.ok) throw new Error('unreachable')
    expect(fifth.locked).toBe(true)

    // Locked means locked: the correct number no longer opens it either.
    const withCorrect = await identify(db, { token: assessment.token, mobile: MOBILE })
    expect(withCorrect.ok).toBe(false)
  })

  it('does not count successful attempts toward the lock', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    for (let n = 0; n < 8; n++) {
      expect((await identify(db, { token: assessment.token, mobile: MOBILE })).ok).toBe(true)
    }
  })

  it('records every attempt for the report, successful or not', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await identify(db, { token: assessment.token, mobile: '9999999999' })
    await identify(db, { token: assessment.token, mobile: MOBILE })

    const { data } = await db.from('identify_attempts').select('ok').eq('token', assessment.token)
    expect(data).toHaveLength(2)
    expect(data!.map((r) => r.ok).sort()).toEqual([false, true])
  })

  it('rejects junk without leaking whether the token exists', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    expect((await identify(db, { token: assessment.token, mobile: 'abc' })).ok).toBe(false)
  })
})

// ── the attempt ──────────────────────────────────────────────────────────────

describe('startAttempt', () => {
  it('returns 15 questions with no answer key anywhere in the payload', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { questions } = await startAttempt(db, { token: assessment.token, context: {} })

    expect(questions).toHaveLength(15)
    const json = JSON.stringify(questions)
    expect(json).not.toContain('answer_key')
    expect(json).not.toContain('numeric_answer')
    expect(json).not.toContain('rationale')
    expect(json).not.toContain('difficulty')
  })

  it('sets a deadline 15 minutes out, inside the window', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    const remaining = new Date(attempt.deadline_at).getTime() - Date.now()
    expect(remaining).toBeGreaterThan(LIMIT_MS - 10_000)
    expect(remaining).toBeLessThanOrEqual(LIMIT_MS)
  })

  it('moves the assessment to started via the trigger', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await startAttempt(db, { token: assessment.token, context: {} })
    const { data } = await db.from('assessments').select('state').eq('id', assessment.id).single()
    expect(data!.state).toBe('started')
  })

  it('returns the existing attempt on resume rather than starting a second', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const first = await startAttempt(db, { token: assessment.token, context: {} })
    const second = await startAttempt(db, { token: assessment.token, context: {} })
    expect(second.attempt.id).toBe(first.attempt.id)
    expect(second.resumed).toBe(true)
  })

  it('refuses to start after the window has closed', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    await expireWindow(assessment.id)
    await expect(startAttempt(db, { token: assessment.token, context: {} })).rejects.toThrow(/expired/i)
  })
})

describe('saveAnswer', () => {
  it('saves and is idempotent on re-save', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })

    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'A', activeMs: 5000 })
    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'B', activeMs: 9000 })

    const { data } = await db.from('attempt_answers').select('*').eq('attempt_id', attempt.id)
    expect(data).toHaveLength(1)
    expect(data![0]!.choice).toBe('B')
  })

  it('counts changes so the report can show a revised answer', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })

    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'A', activeMs: 1000 })
    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'B', activeMs: 2000 })
    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'C', activeMs: 3000 })

    const { data } = await db.from('attempt_answers').select('change_count').eq('attempt_id', attempt.id).single()
    expect(data!.change_count).toBe(2)
  })

  it('records an answer changed after a pause — the key integrity signal', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })

    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'A', activeMs: 1000 })
    await recordEvents(db, {
      attemptId: attempt.id,
      events: [
        { kind: 'pause', position: 1, payload: {} },
        { kind: 'resume', position: 1, payload: { duration_ms: 240000 } },
      ],
    })
    await saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'D', activeMs: 2000 })

    const { data } = await db
      .from('attempt_answers')
      .select('changed_after_pause')
      .eq('attempt_id', attempt.id)
      .single()
    expect(data!.changed_after_pause).toBe(true)
  })

  it('rejects a position outside the paper', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await expect(
      saveAnswer(db, { attemptId: attempt.id, position: 99, choice: 'A', activeMs: 0 }),
    ).rejects.toThrow()
  })

  it('the database refuses an answer to position 20 on a 15-question paper', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    expect(assessment.question_count).toBe(15)
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await expect(
      saveAnswer(db, { attemptId: attempt.id, position: 20, choice: 'A', activeMs: 0 }),
    ).rejects.toThrow(/not on this paper/)
  })

  it('refuses to save into a submitted attempt', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    await expect(
      saveAnswer(db, { attemptId: attempt.id, position: 1, choice: 'A', activeMs: 0 }),
    ).rejects.toThrow(/submitted/i)
  })
})

// ── submit and grade ─────────────────────────────────────────────────────────

describe('submitAttempt', () => {
  it('grades server-side and stores section scores', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })

    // Answer every question correctly by reading the key server-side — the
    // candidate never has this.
    const { data: paper } = await db
      .from('assessment_items')
      .select('position, test_items(format, answer_key, numeric_answer)')
      .eq('assessment_id', assessment.id)

    for (const row of paper!) {
      const item = row.test_items as never as { format: string; answer_key: string | null; numeric_answer: number | null }
      await saveAnswer(db, {
        attemptId: attempt.id,
        position: row.position,
        choice: item.format === 'mcq' ? (item.answer_key as 'A') : null,
        numericValue: item.format === 'numeric' ? item.numeric_answer : null,
        activeMs: 1000,
      })
    }

    const result = await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })

    expect(result.score).toBe(15)
    expect(result.correct).toBe(15)
    expect(result.sections.maths).toBe(5)
    expect(result.sections.english).toBe(5)
    expect(result.sections.science).toBe(5)
  })

  it('scores an untouched paper at zero, not negative', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    const result = await submitAttempt(db, { attemptId: attempt.id, reason: 'timer' })
    expect(result.score).toBe(0)
    expect(result.skipped).toBe(15)
  })

  it('moves the assessment to submitted via the trigger', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    const { data } = await db.from('assessments').select('state').eq('id', assessment.id).single()
    expect(data!.state).toBe('submitted')
  })

  it('refuses a double submit rather than regrading', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    await expect(submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })).rejects.toThrow(/submitted/i)
  })

  it('never returns the answer key to the caller', async () => {
    const { assessment } = await issueAssessment(db, { leadId })
    const { attempt } = await startAttempt(db, { token: assessment.token, context: {} })
    const result = await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    const json = JSON.stringify(result)
    expect(json).not.toContain('answer_key')
    expect(json).not.toContain('rationale')
  })
})
