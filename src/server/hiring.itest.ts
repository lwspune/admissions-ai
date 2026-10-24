import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './supabase'
import { purgeExpired } from './retention'
import {
  addApplicant,
  issueHiringTest,
  loadApplicants,
  loadApplicantReport,
  addHiringNote,
  setHiringDecision,
  attachResume,
  hiringResumeUrl,
} from './hiring'
import {
  openHiringTest,
  identifyApplicant,
  startHiringAttempt,
  saveHiringAnswer,
  submitHiringTest,
} from './hiringAttempt'
import { gradeAttempt, type GradeItem, type GradeAnswer } from '../lib/grade'
import type { Choice } from '../lib/types'

// The teacher screening test (HIRING_TEST_SPEC.md), end to end against the real
// database, signed in as real roles. The rules themselves are proven by
// `db:probe -- 0021`; this proves the server code uses them, that the
// applicant's browser gets no key, and that SQL grading matches grade.ts.
//
// Marker: applicants on 97000021xx, questions 'itest-hiring-%', logins PREFIX.
// The live bank holds only these while the suite runs: real questions are at
// review until a subject is signed off.

const svc = serviceClient()
const PASSWORD = 'itest-password-1'
const PREFIX = 'hiringtest-'
const mobile = (n: number) => `97000021${String(n).padStart(2, '0')}`
const MINUTE = 60_000

type Role = 'teacher' | 'superadmin' | 'counsellor'
interface Session {
  db: SupabaseClient
  id: string
}

async function signIn(role: Role, tag: string): Promise<Session> {
  const email = `${PREFIX}${tag}-${Date.now()}@example.com`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role, name: `Hiring ${tag}` },
  })
  if (error) throw new Error(`could not create ${role}: ${error.message}`)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`could not sign in as ${role}: ${signInError.message}`)
  return { db, id: data.user.id }
}

async function cleanup() {
  // Storage does not cascade: a test applicant's resume goes by name first.
  const { data } = await svc.from('hiring_applicants').select('id').like('mobile', '97000021%')
  const names = (data ?? []).map((a) => a.id as string)
  if (names.length > 0) await svc.storage.from('hiring-resumes').remove(names)
  await svc.from('hiring_applicants').delete().like('mobile', '97000021%')
}

async function removeItemsAndUsers() {
  await cleanup()
  await svc.from('hiring_items').delete().like('source_ref', 'itest-hiring-%')
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(PREFIX))) await svc.auth.admin.deleteUser(u.id)
}

/** Live questions: chemistry 30 MCQ over 15 chapters + 8 typed; English 20 MCQ. Keys known. */
async function seedItems() {
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => ({
      source_ref: `itest-hiring-cm${i}`, source: 'mht-cet', subject: 'chemistry', chapter: `ch${Math.floor(i / 2)}`,
      format: 'mcq', options: { A: 'w', B: 'x', C: 'y', D: 'z' }, answer_key: (['A', 'B', 'C', 'D'] as const)[i % 4],
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      source_ref: `itest-hiring-cn${i}`, source: 'jee-mains', subject: 'chemistry', chapter: `nch${i}`,
      format: 'numeric', numeric_answer: 10 + i,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      source_ref: `itest-hiring-em${i}`, source: 'cds', subject: 'english', chapter: `ech${Math.floor(i / 2)}`,
      format: 'mcq', options: { A: 'w', B: 'x', C: 'y', D: 'z' }, answer_key: 'B',
    })),
  ].map((r, n) => ({ paper: 'itest', stem: `Question number ${n}`, status: 'live', ...r }))
  const { error } = await svc.from('hiring_items').insert(rows)
  if (error) throw new Error(`could not seed items: ${error.message}`)
}

let teacher: Session
let otherTeacher: Session
let superadmin: Session
let counsellor: Session

beforeAll(async () => {
  await removeItemsAndUsers()
  await seedItems()
  teacher = await signIn('teacher', 't1')
  otherTeacher = await signIn('teacher', 't2')
  superadmin = await signIn('superadmin', 's')
  counsellor = await signIn('counsellor', 'c')
})
beforeEach(cleanup)
afterAll(removeItemsAndUsers)

async function applicantWithTest(n: number, subject: 'chemistry' | 'english' = 'chemistry') {
  const added = await addApplicant(teacher.db as never, { name: `Hiring Test ${n}`, mobile: `+91 ${mobile(n)}`, subject })
  if (!added.ok) throw new Error(added.error)
  const issued = await issueHiringTest(teacher.db as never, added.id)
  if (!issued.ok) throw new Error(issued.error)
  return { applicantId: added.id, token: issued.token }
}

const begin = (token: string, n: number) =>
  startHiringAttempt(svc as never, { token, mobile: mobile(n), context: { userAgent: 'itest', ip: null } })

describe('adding and issuing', () => {
  it('lets a teacher add an applicant and issue a 15-question chemistry paper', async () => {
    const { applicantId, token } = await applicantWithTest(1)
    expect(token).toMatch(/^[0-9A-Za-z]{22}$/)

    const { data: test } = await teacher.db.from('hiring_tests').select('*').eq('applicant_id', applicantId).single()
    expect(test).toMatchObject({ subject: 'chemistry', question_count: 15, limit_minutes: 25, state: 'issued', issued_by: teacher.id })
    const { data: applicant } = await teacher.db.from('hiring_applicants').select('mobile, created_by').eq('id', applicantId).single()
    expect(applicant).toEqual({ mobile: mobile(1), created_by: teacher.id })
  })

  it('refuses a bad number or name before the database', async () => {
    expect(await addApplicant(teacher.db as never, { name: 'X', mobile: '12345', subject: 'maths' })).toEqual({
      ok: false,
      error: 'Enter a 10-digit mobile number.',
    })
    expect(await addApplicant(teacher.db as never, { name: '  ', mobile: mobile(2), subject: 'maths' })).toMatchObject({ ok: false })
  })

  it('shows an applicant to the teacher who added them and to superadmin only', async () => {
    const { applicantId } = await applicantWithTest(3)
    const seen = async (s: Session) =>
      (await s.db.from('hiring_applicants').select('id').eq('id', applicantId)).data?.length ?? 0
    expect(await seen(teacher)).toBe(1)
    expect(await seen(superadmin)).toBe(1)
    expect(await seen(otherTeacher)).toBe(0)
    expect(await seen(counsellor)).toBe(0)
    expect((await issueHiringTest(otherTeacher.db as never, applicantId)).ok).toBe(false)
  })

  it('refuses a counsellor adding an applicant', async () => {
    const r = await addApplicant(counsellor.db as never, { name: 'No', mobile: mobile(4), subject: 'maths' })
    expect(r.ok).toBe(false)
  })

  it('gives English 15 MCQ in 20 minutes', async () => {
    const { applicantId } = await applicantWithTest(5, 'english')
    const { data } = await teacher.db.from('hiring_tests').select('limit_minutes, question_count').eq('applicant_id', applicantId).single()
    expect(data).toEqual({ limit_minutes: 20, question_count: 15 })
  })
})

describe('taking the test', () => {
  it('opens on the applicant name, then asks for the number', async () => {
    const { token } = await applicantWithTest(10)
    const opened = await openHiringTest(svc as never, token)
    expect(opened).toMatchObject({ status: 'ok', applicantName: 'Hiring Test 10', subject: 'chemistry', minutes: 25, questionCount: 15 })

    const wrong = await identifyApplicant(svc as never, { token, mobile: '9999999999', ip: null })
    expect(wrong).toEqual({ ok: false, locked: false, remaining: 4 })
    expect(await identifyApplicant(svc as never, { token, mobile: `0${mobile(10)}`, ip: null })).toEqual({
      ok: true,
      applicantName: 'Hiring Test 10',
    })
  })

  it('will not start on the wrong number, even called directly', async () => {
    const { token } = await applicantWithTest(11)
    await expect(startHiringAttempt(svc as never, { token, mobile: '9999999999', context: {} })).rejects.toThrow()
  })

  it('sends the paper without its key, MCQ first, and a 25-minute deadline', async () => {
    const { token } = await applicantWithTest(12)
    const started = await begin(token, 12)
    expect(started.questions).toHaveLength(15)
    expect(started.questions.map((q) => q.format)).toEqual([...Array(12).fill('mcq'), ...Array(3).fill('numeric')])
    const bytes = JSON.stringify(started)
    for (const secret of ['answer_key', 'numeric_answer', 'itest-hiring', 'source', 'chapter', '"ch']) expect(bytes).not.toContain(secret)
    const left = new Date(started.deadlineAt).getTime() - Date.now()
    expect(left).toBeGreaterThan(24 * MINUTE)
    // The database sets it on its own clock, a little apart from this one.
    expect(left).toBeLessThanOrEqual(25 * MINUTE + 5_000)
  })

  it('resumes the same attempt with its answers', async () => {
    const { token } = await applicantWithTest(13)
    const first = await begin(token, 13)
    await saveHiringAnswer(svc as never, { attemptId: first.attemptId, position: 1, choice: 'C', numericValue: null })
    await saveHiringAnswer(svc as never, { attemptId: first.attemptId, position: 13, choice: null, numericValue: 42 })
    const again = await begin(token, 13)
    expect(again.attemptId).toBe(first.attemptId)
    expect(again.resumed).toBe(true)
    expect(again.answers).toEqual([
      { position: 1, choice: 'C', numericValue: null },
      { position: 13, choice: null, numericValue: 42 },
    ])
  })

  it('refuses an answer of the wrong shape, in words', async () => {
    const { token } = await applicantWithTest(14)
    const { attemptId } = await begin(token, 14)
    await expect(saveHiringAnswer(svc as never, { attemptId, position: 2, choice: null, numericValue: 5 })).rejects.toThrow(
      'That answer does not fit this question.',
    )
  })

  it('grades in the database exactly as grade.ts does', async () => {
    const { token } = await applicantWithTest(15)
    const { attemptId } = await begin(token, 15)

    // The paper and its keys, read the way the grader would.
    const { data: attempt } = await svc.from('hiring_attempts').select('test_id').eq('id', attemptId).single()
    const { data: paper } = await svc
      .from('hiring_test_items')
      .select('position, hiring_items(format, answer_key, numeric_answer)')
      .eq('test_id', attempt!.test_id)
      .order('position')
    const items: GradeItem[] = paper!.map((p) => {
      const i = p.hiring_items as unknown as { format: 'mcq' | 'numeric'; answer_key: Choice | null; numeric_answer: number | null }
      return { position: p.position, subject: 'maths', format: i.format, answerKey: i.answer_key, numericAnswer: i.numeric_answer === null ? null : Number(i.numeric_answer), numericTolerance: 0 }
    })

    // Right, wrong and blank on both kinds.
    const answers: GradeAnswer[] = items.flatMap((it, n): GradeAnswer[] => {
      if (n % 5 === 4) return []
      const right = n % 3 !== 1
      if (it.format === 'mcq') {
        const wrong: Choice = it.answerKey === 'A' ? 'B' : 'A'
        return [{ position: it.position, choice: right ? it.answerKey : wrong, numericValue: null }]
      }
      return [{ position: it.position, choice: null, numericValue: right ? it.numericAnswer : it.numericAnswer! + 1 }]
    })
    for (const a of answers) {
      await saveHiringAnswer(svc as never, { attemptId, position: a.position, choice: a.choice, numericValue: a.numericValue })
    }

    await submitHiringTest(svc as never, { attemptId, reason: 'manual' })
    const expected = gradeAttempt(items, answers)
    const { data: graded } = await svc.from('hiring_attempts').select('score, correct, incorrect, skipped, submit_reason').eq('id', attemptId).single()
    expect({ ...graded, score: Number(graded!.score) }).toEqual({
      score: expected.score,
      correct: expected.correct,
      incorrect: expected.incorrect,
      skipped: expected.skipped,
      submit_reason: 'manual',
    })
  })

  it('closes after submitting: the link says so, and nothing more is saved', async () => {
    const { token } = await applicantWithTest(16)
    const { attemptId } = await begin(token, 16)
    await submitHiringTest(svc as never, { attemptId, reason: 'manual' })
    expect(await openHiringTest(svc as never, token)).toEqual({ status: 'submitted' })
    await expect(begin(token, 16)).rejects.toThrow()
    await expect(saveHiringAnswer(svc as never, { attemptId, position: 1, choice: 'A', numericValue: null })).rejects.toThrow()
  })

  it('makes a reissue the only working link', async () => {
    const { applicantId, token } = await applicantWithTest(17)
    const second = await issueHiringTest(teacher.db as never, applicantId)
    expect(second.ok).toBe(true)
    expect(await openHiringTest(svc as never, token)).toEqual({ status: 'not_found' })
    if (second.ok) expect((await openHiringTest(svc as never, second.token)).status).toBe('ok')
  })

  it('lists a teacher their own applicants with the latest test, superadmin everyone', async () => {
    const mine = await applicantWithTest(18)
    const added = await addApplicant(otherTeacher.db as never, { name: 'Hiring Test 19', mobile: mobile(19), subject: 'english' })
    if (!added.ok) throw new Error(added.error)

    const forTeacher = await loadApplicants(teacher.db as never)
    expect(forTeacher.map((a) => a.name)).toEqual(['Hiring Test 18'])
    expect(forTeacher[0]).toMatchObject({ subject: 'chemistry', mobile: mobile(18), latest: { state: 'issued', issueSeq: 1, token: mine.token }, attempt: null })

    const forSuperadmin = (await loadApplicants(superadmin.db as never)).filter((a) => a.mobile.startsWith('97000021'))
    expect(forSuperadmin.map((a) => a.name).sort()).toEqual(['Hiring Test 18', 'Hiring Test 19'])
    expect(forSuperadmin.find((a) => a.name === 'Hiring Test 19')!.latest).toBeNull()
  })

  it('reports each question right, wrong or skipped, to the teacher who added the applicant only', async () => {
    const { applicantId, token } = await applicantWithTest(20)
    const { attemptId } = await begin(token, 20)
    await saveHiringAnswer(svc as never, { attemptId, position: 1, choice: 'A', numericValue: null })
    await saveHiringAnswer(svc as never, { attemptId, position: 13, choice: null, numericValue: 9999 })
    await submitHiringTest(svc as never, { attemptId, reason: 'manual' })

    const report = await loadApplicantReport(teacher.db as never, applicantId)
    expect(report).not.toBeNull()
    expect(report!.attempt).toMatchObject({ submitReason: 'manual' })
    expect(report!.questions).toHaveLength(15)
    const q1 = report!.questions[0]!
    expect(q1).toMatchObject({ position: 1, format: 'mcq', given: 'A', verdict: q1.answerKey === 'A' ? 'correct' : 'incorrect' })
    expect(report!.questions[12]).toMatchObject({ position: 13, format: 'numeric', given: '9999', verdict: 'incorrect' })
    expect(report!.questions.filter((q) => q.verdict === 'skipped')).toHaveLength(13)
    // The verdicts add up to the stored score.
    const score = report!.questions.reduce((s, q) => s + (q.verdict === 'correct' ? 1 : q.verdict === 'incorrect' && q.format === 'mcq' ? -0.25 : 0), 0)
    expect(score).toBe(report!.attempt!.score)

    expect(await loadApplicantReport(otherTeacher.db as never, applicantId)).toBeNull()
    expect(await loadApplicantReport(superadmin.db as never, applicantId)).not.toBeNull()
  })

  it('treats a malformed token as not found', async () => {
    expect(await openHiringTest(svc as never, "x' or 1=1 --")).toEqual({ status: 'not_found' })
  })
})

// Applicants are never purged (the owner, 2026-10-24): past applicants
// inform future hiring. The nightly purge leaves them, however old.
describe('the purge', () => {
  const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString()

  it('keeps an applicant idle for over 12 months, with their tests and notes', async () => {
    const { applicantId, token } = await applicantWithTest(30)
    await begin(token, 30)
    expect((await addHiringNote(teacher.db as never, applicantId, 'Old note')).ok).toBe(true)
    for (const [table, column] of [['hiring_applicants', 'id'], ['hiring_tests', 'applicant_id'], ['hiring_notes', 'applicant_id']] as const) {
      const { error } = await svc.from(table).update({ created_at: longAgo }).eq(column, applicantId)
      if (error) throw new Error(error.message)
    }

    await purgeExpired(svc as never)
    const count = async (table: string, column: string) =>
      (await svc.from(table).select('*', { count: 'exact', head: true }).eq(column, applicantId)).count
    expect(await count('hiring_applicants', 'id')).toBe(1)
    expect(await count('hiring_tests', 'applicant_id')).toBe(1)
    expect(await count('hiring_notes', 'applicant_id')).toBe(1)
  })
})

// After the test (migration 0023). The rules are proven by `db:probe -- 0023`;
// this proves the server code uses them, through real sessions and the real
// storage API, whose type and size limits no SQL probe can reach.
describe('notes', () => {
  it('lets the teacher who added an applicant write notes that superadmin reads, with the author', async () => {
    const { applicantId } = await applicantWithTest(40)
    expect(await addHiringNote(teacher.db as never, applicantId, '  Strong on calculus  ')).toEqual({ ok: true })
    expect(await addHiringNote(superadmin.db as never, applicantId, 'Call on Monday')).toEqual({ ok: true })

    const report = await loadApplicantReport(superadmin.db as never, applicantId)
    expect(report!.notes.map((n) => [n.kind, n.body, n.authorName])).toEqual([
      ['note', 'Call on Monday', 'Hiring s'],
      ['note', 'Strong on calculus', 'Hiring t1'],
    ])
  })

  it('comes with the list: notes only, newest first, and only to those who see the applicant', async () => {
    const { applicantId } = await applicantWithTest(42)
    expect((await addHiringNote(teacher.db as never, applicantId, 'First note')).ok).toBe(true)
    expect((await setHiringDecision(teacher.db as never, applicantId, 'shortlisted')).ok).toBe(true)
    expect((await addHiringNote(superadmin.db as never, applicantId, 'Second note')).ok).toBe(true)

    for (const s of [teacher, superadmin]) {
      const row = (await loadApplicants(s.db as never)).find((a) => a.id === applicantId)!
      expect(row.notes.map((n) => [n.kind, n.body, n.authorName])).toEqual([
        ['note', 'Second note', 'Hiring s'],
        ['note', 'First note', 'Hiring t1'],
      ])
    }
    const others = await loadApplicants(otherTeacher.db as never)
    expect(others.flatMap((a) => a.notes).some((n) => n.body.endsWith(' note'))).toBe(false)
  })

  it('refuses a blank note, and any note from another teacher', async () => {
    const { applicantId } = await applicantWithTest(41)
    expect(await addHiringNote(teacher.db as never, applicantId, '  ')).toEqual({ ok: false, error: 'Write a note first.' })
    expect((await addHiringNote(otherTeacher.db as never, applicantId, 'Not mine')).ok).toBe(false)
    expect((await addHiringNote(counsellor.db as never, applicantId, 'Not mine')).ok).toBe(false)
  })
})

describe('the decision', () => {
  it('starts in progress, and a teacher may shortlist but not hire', async () => {
    const { applicantId } = await applicantWithTest(50)
    const listed = async () => (await loadApplicants(teacher.db as never)).find((a) => a.id === applicantId)!
    expect((await listed()).decision).toBe('in_progress')

    expect(await setHiringDecision(teacher.db as never, applicantId, 'shortlisted')).toEqual({ ok: true })
    expect((await listed()).decision).toBe('shortlisted')
    expect(await setHiringDecision(teacher.db as never, applicantId, 'hired')).toEqual({
      ok: false,
      error: 'Only superadmin can mark an applicant hired or rejected.',
    })
    expect((await listed()).decision).toBe('shortlisted')
  })

  it('lets superadmin hire, writes each change into the history, and refuses another teacher', async () => {
    const { applicantId } = await applicantWithTest(51)
    expect((await setHiringDecision(otherTeacher.db as never, applicantId, 'on_hold')).ok).toBe(false)
    expect(await setHiringDecision(teacher.db as never, applicantId, 'on_hold')).toEqual({ ok: true })
    expect(await setHiringDecision(superadmin.db as never, applicantId, 'hired')).toEqual({ ok: true })

    const report = await loadApplicantReport(teacher.db as never, applicantId)
    expect(report!.applicant.decision).toBe('hired')
    expect(report!.notes.map((n) => [n.kind, n.body, n.authorName])).toEqual([
      ['decision', 'on_hold → hired', 'Hiring s'],
      ['decision', 'in_progress → on_hold', 'Hiring t1'],
    ])
    expect(await setHiringDecision(teacher.db as never, applicantId, 'in_progress')).toMatchObject({ ok: false })
  })

  it('refuses a decision that is not one, before the database', async () => {
    const { applicantId } = await applicantWithTest(52)
    expect(await setHiringDecision(teacher.db as never, applicantId, 'maybe')).toEqual({ ok: false, error: 'Choose a decision.' })
  })
})

describe('the resume', () => {
  const PDF = new TextEncoder().encode('%PDF-1.4 itest resume')
  const upload = (s: Session, applicantId: string, body: Uint8Array, contentType = 'application/pdf') =>
    s.db.storage.from('hiring-resumes').upload(applicantId, body, { contentType, upsert: true })

  it('is uploaded by the teacher, attached, and opened through a short-lived link', async () => {
    const { applicantId } = await applicantWithTest(60)
    expect((await upload(teacher, applicantId, PDF)).error).toBeNull()
    expect(await attachResume(teacher.db as never, applicantId, 'Asha CV.pdf')).toEqual({ ok: true })

    const report = await loadApplicantReport(teacher.db as never, applicantId)
    expect(report!.applicant).toMatchObject({ resumeType: 'pdf', resumeName: 'Asha CV.pdf' })
    expect(report!.notes[0]).toMatchObject({ kind: 'resume', body: 'Resume added: Asha CV.pdf' })
    expect((await loadApplicants(teacher.db as never)).find((a) => a.id === applicantId)!.resumeType).toBe('pdf')

    const url = await hiringResumeUrl(teacher.db as never, report!.applicant)
    const res = await fetch(url!)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
  })

  it('is not attached before it is uploaded', async () => {
    const { applicantId } = await applicantWithTest(61)
    expect(await attachResume(teacher.db as never, applicantId, 'CV.pdf')).toEqual({
      ok: false,
      error: 'The file did not upload. Try again.',
    })
  })

  it('is closed to another teacher, both ways', async () => {
    const { applicantId } = await applicantWithTest(62)
    expect((await upload(otherTeacher, applicantId, PDF)).error).not.toBeNull()
    expect((await upload(teacher, applicantId, PDF)).error).toBeNull()
    expect((await attachResume(otherTeacher.db as never, applicantId, 'CV.pdf')).ok).toBe(false)
    const { data } = await otherTeacher.db.storage.from('hiring-resumes').createSignedUrl(applicantId, 60)
    expect(data).toBeNull()
  })

  it('is refused by the bucket when it is not a PDF or Word file, or is over 5 MB', async () => {
    const { applicantId } = await applicantWithTest(63)
    expect((await upload(teacher, applicantId, new TextEncoder().encode('<html>'), 'text/html')).error).not.toBeNull()
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    big.set(PDF)
    expect((await upload(teacher, applicantId, big)).error).not.toBeNull()
  })
})

describe('malformed input', () => {
  it('treats a malformed token as not found here too', async () => {
    expect(await openHiringTest(svc as never, "x' or 1=1 --")).toEqual({ status: 'not_found' })
  })
})
