import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { ITEST_ORG } from './itestOrg'
import { openByToken, identify, startAttempt, recordEvents, submitAttempt } from './attempt'
import { loadLeadReport } from './report'
import { generateToken } from '../lib/token'

// Hindi versions of maths and science questions (migration 0016), against the
// real database: the shape rules, the all-or-nothing load, the freeze on a
// question mid-test, and the paper a candidate is served.
//
// The fixtures are ten live basics items, taught in class 6, carrying Hindi.
// Live means drawable, so they are removed at the end; a real paper issued in
// the meantime could draw one, as with the other suites' fixtures.

const db = serviceClient()
const SKILL = 'ITest-hindi'
const MOBILE = '9812345680'
const DEVANAGARI = /[\u0900-\u097F]/

const HINDI_OPTIONS = { A: 'एक 1', B: 'दो 2', C: 'तीन 3', D: 'चार 4' }

const item = (subject: string, difficulty: string, n: number, over: Record<string, unknown> = {}) => ({
  subject,
  skill: SKILL,
  difficulty,
  format: 'mcq',
  stem: `ITest hindi ${subject} ${difficulty} ${n}`,
  options: { A: 'one 1', B: 'two 2', C: 'three 3', D: 'four 4' },
  answer_key: 'B',
  rationale: 'Integration fixture for the Hindi version of a question.',
  status: 'live',
  taught_in: 6,
  stem_hi: `ITest हिंदी ${subject} ${difficulty} ${n}`,
  options_hi: HINDI_OPTIONS,
  ...over,
})

const MIX = ['easy', 'easy', 'easy', 'moderate', 'difficult']

async function removeFixtures() {
  await db.from('leads').delete().like('name', 'HiTest%')
  await db.from('test_items').delete().eq('skill', SKILL)
}

let fixtureIds: { id: string; subject: string; ref: string | null }[] = []
let englishIds: string[] = []

beforeAll(async () => {
  await removeFixtures()
  const rows = ['maths', 'science'].flatMap((s) => MIX.map((d, n) => item(s, d, n, { ref: `ITH-${s[0]}-${n}` })))
  const { data, error } = await db.from('test_items').insert(rows).select('id, subject, ref')
  if (error) throw new Error(`could not insert fixtures: ${error.message}`)
  fixtureIds = data as typeof fixtureIds

  const { data: pool } = await db.rpc('live_pool', { p_class: 11 })
  englishIds = (pool as { id: string; subject: string; part: string }[])
    .filter((r) => r.subject === 'english' && r.part === 'basics')
    .slice(0, 5)
    .map((r) => r.id)
})

afterAll(removeFixtures)

async function freshLead() {
  await db.from('leads').delete().like('name', 'HiTest%')
  const { data, error } = await db
    .from('leads')
    .insert({ name: 'HiTest Candidate', contact_mobile: MOBILE, class_level: 11, org_id: ITEST_ORG })
    .select()
    .single()
  if (error) throw new Error(`could not create lead: ${error.message}`)
  return data.id as string
}

/** A 15-question paper: the ten fixtures and five English basics from the real bank. */
async function issueHindiPaper() {
  const leadId = await freshLead()
  const { data, error } = await db.rpc('issue_assessment', {
    p_lead_id: leadId,
    p_issued_by: null,
    p_token: generateToken(),
    p_item_ids: [...fixtureIds.map((f) => f.id), ...englishIds],
  })
  if (error) throw new Error(`could not issue: ${error.message}`)
  return { leadId, token: (data as { token: string }).token }
}

async function startedPaper() {
  const paper = await issueHindiPaper()
  await identify(db, { token: paper.token, mobile: MOBILE })
  const started = await startAttempt(db, { token: paper.token, context: {} })
  return { ...paper, ...started }
}

// ── the shape the database accepts ──────────────────────────────────────────

describe('test_items Hindi shape', () => {
  const insert = (over: Record<string, unknown>) =>
    db.from('test_items').insert(item('maths', 'easy', 99, { stem: `ITest hindi shape ${Math.random()}`, status: 'review', ...over }))

  it('accepts a whole Hindi MCQ and a numeric item with a Hindi stem', async () => {
    expect((await insert({})).error).toBeNull()
    const numeric = await insert({ format: 'numeric', options: null, answer_key: null, numeric_answer: 5, options_hi: null })
    expect(numeric.error).toBeNull()
  })

  it('refuses Hindi on an English question', async () => {
    expect((await insert({ subject: 'english' })).error).not.toBeNull()
  })

  it('refuses an MCQ whose Hindi options are missing D, carry an extra E, or leave one blank', async () => {
    expect((await insert({ options_hi: { A: '1', B: '2', C: '3' } })).error).not.toBeNull()
    expect((await insert({ options_hi: { ...HINDI_OPTIONS, E: 'पाँच' } })).error).not.toBeNull()
    expect((await insert({ options_hi: { ...HINDI_OPTIONS, C: '  ' } })).error).not.toBeNull()
    expect((await insert({ options_hi: null })).error).not.toBeNull()
  })

  it('refuses Hindi options on a numeric item', async () => {
    const r = await insert({ format: 'numeric', options: null, answer_key: null, numeric_answer: 5 })
    expect(r.error).not.toBeNull()
  })

  it('refuses Hindi options without a Hindi stem, and a blank Hindi stem', async () => {
    expect((await insert({ stem_hi: null })).error).not.toBeNull()
    expect((await insert({ stem_hi: '   ' })).error).not.toBeNull()
  })
})

// ── loading a batch ─────────────────────────────────────────────────────────

describe('set_hindi', () => {
  it('loads a batch by ref', async () => {
    const [a, b] = fixtureIds.filter((f) => f.subject === 'maths')
    const { data, error } = await db.rpc('set_hindi', {
      p_rows: [
        { ref: a!.ref, stem_hi: 'ITest नया प्रश्न A', options_hi: HINDI_OPTIONS },
        { ref: b!.ref, stem_hi: 'ITest नया प्रश्न B', options_hi: HINDI_OPTIONS },
      ],
    })
    expect(error).toBeNull()
    expect(data).toBe(2)
    const { data: rows } = await db.from('test_items').select('stem_hi').in('id', [a!.id, b!.id]).order('stem_hi')
    expect(rows!.map((r) => r.stem_hi)).toEqual(['ITest नया प्रश्न A', 'ITest नया प्रश्न B'])
  })

  it('loads none of a batch when one row is refused', async () => {
    const [a] = fixtureIds.filter((f) => f.subject === 'science')
    const { data: before } = await db.from('test_items').select('stem_hi').eq('id', a!.id).single()
    const { error } = await db.rpc('set_hindi', {
      p_rows: [
        { ref: a!.ref, stem_hi: 'ITest बदला हुआ', options_hi: HINDI_OPTIONS },
        { ref: 'ITH-no-such-ref', stem_hi: 'ITest', options_hi: HINDI_OPTIONS },
      ],
    })
    expect(error?.message).toMatch(/no item with ref/)
    const { data: after } = await db.from('test_items').select('stem_hi').eq('id', a!.id).single()
    expect(after!.stem_hi).toBe(before!.stem_hi)
  })

  it('cannot be called with the public key', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    const [a] = fixtureIds
    const { error } = await anon.rpc('set_hindi', { p_rows: [{ ref: a!.ref, stem_hi: 'ITest अनाम', options_hi: HINDI_OPTIONS }] })
    expect(error).not.toBeNull()
    const { data } = await db.from('test_items').select('stem_hi').eq('id', a!.id).single()
    expect(data!.stem_hi).not.toBe('ITest अनाम')
  })
})

// ── the paper a candidate gets ──────────────────────────────────────────────

describe('a paper with Hindi', () => {
  it('tells the candidate Hindi is on offer before the test starts', async () => {
    const { token } = await issueHindiPaper()
    expect(await openByToken(db, token)).toMatchObject({ status: 'ok', hindi: true })
  })

  it('serves Hindi on maths and science, and none on English', async () => {
    const { questions } = await startedPaper()
    const translated = questions.filter((q) => q.subject !== 'english')
    expect(translated).toHaveLength(10)
    for (const q of translated) expect(q.stemHi).toMatch(DEVANAGARI)
    for (const q of translated) expect(q.optionsHi).toEqual(HINDI_OPTIONS)
    for (const q of questions.filter((q) => q.subject === 'english')) {
      expect(q.stemHi).toBeNull()
      expect(q.optionsHi).toBeNull()
    }
  })

  it('offers no Hindi at all when one maths or science question has none', async () => {
    const { token } = await issueHindiPaper()
    const [first] = fixtureIds
    await db.rpc('set_hindi', { p_rows: [{ ref: first!.ref, stem_hi: null, options_hi: null }] })
    try {
      expect(await openByToken(db, token)).toMatchObject({ status: 'ok', hindi: false })
      await identify(db, { token, mobile: MOBILE })
      const { questions } = await startAttempt(db, { token, context: {} })
      expect(JSON.stringify(questions)).not.toMatch(DEVANAGARI)
    } finally {
      // The paper is mid-test, so the freeze would refuse the restore: end it first.
      await db.from('leads').delete().like('name', 'HiTest%')
      const restored = await db
        .from('test_items')
        .update({ stem_hi: 'ITest हिंदी restored', options_hi: HINDI_OPTIONS })
        .eq('id', first!.id)
      expect(restored.error).toBeNull()
    }
  })

  it('refuses to change the Hindi of a question while a candidate is mid-test, and allows it after', async () => {
    const { attempt } = await startedPaper()
    const [a] = fixtureIds
    const during = await db.from('test_items').update({ stem_hi: 'ITest बीच में बदला' }).eq('id', a!.id)
    expect(during.error?.message).toMatch(/test in progress/)

    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    const after = await db.from('test_items').update({ stem_hi: 'ITest बाद में बदला' }).eq('id', a!.id)
    expect(after.error).toBeNull()
  })

  it('records a switch of language', async () => {
    const { attempt } = await startedPaper()
    await recordEvents(db, { attemptId: attempt.id, events: [{ kind: 'lang', position: 1, payload: { to: 'hi' } }] })
    const { data } = await db.from('attempt_events').select('kind, payload').eq('attempt_id', attempt.id).eq('kind', 'lang')
    expect(data).toEqual([{ kind: 'lang', payload: { to: 'hi' } }])
  })

  it('gives staff the English text only, and a telecaller no text in either language', async () => {
    const { leadId, attempt } = await startedPaper()
    await submitAttempt(db, { attemptId: attempt.id, reason: 'manual' })
    const telecaller = await loadLeadReport(db, leadId, 'telecaller')
    const counsellor = await loadLeadReport(db, leadId, 'counsellor')
    expect(JSON.stringify(telecaller)).not.toMatch(DEVANAGARI)
    expect(JSON.stringify(counsellor)).not.toMatch(DEVANAGARI)
    expect(counsellor!.report!.questions.some((q) => q.stem.startsWith('ITest hindi'))).toBe(true)
  })
})
