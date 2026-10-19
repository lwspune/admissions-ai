import 'server-only'
import type { Db } from './supabase'
import { MAX_IDENTIFY_FAILURES, MAX_IDENTIFY_PER_IP_HOUR } from './attempt'
import { isValidTokenShape } from '../lib/token'
import { mobilesMatch } from '../lib/mobile'
import { toApplicantPaper, type ApplicantQuestion, type HiringItemRow, type HiringSubject } from '../lib/hiring'
import { CHOICES, type Choice } from '../lib/types'

// The applicant's side of the teacher screening test (HIRING_TEST_SPEC.md).
// Runs on service role, like the admissions candidate's: an applicant has no
// session. The rules — deadline, answer shape, closing at submit, grading —
// are the database's (migration 0021); this file asks and translates.
//
// Unlike the admissions start, starting here re-checks the number: the
// identity screen is not the only door to the paper.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HiringOpenResult =
  | {
      status: 'ok'
      applicantName: string
      subject: HiringSubject
      minutes: number
      questionCount: number
      expiresAt: string
      /** An attempt is under way: the screen goes straight back to it after the number. */
      started: boolean
    }
  | { status: 'not_found' | 'expired' | 'submitted' }

interface TestRow {
  id: string
  state: string
  subject: HiringSubject
  limit_minutes: number
  question_count: number
  expires_at: string
  hiring_applicants: { name: string; mobile: string }
}

async function loadTest(db: Db, token: string): Promise<TestRow | null> {
  if (!isValidTokenShape(token)) return null
  const { data } = await db
    .from('hiring_tests')
    .select('id, state, subject, limit_minutes, question_count, expires_at, hiring_applicants(name, mobile)')
    .eq('token', token)
    .maybeSingle()
  return (data as TestRow | null) ?? null
}

interface AttemptRow {
  id: string
  deadline_at: string
  submitted_at: string | null
}

async function loadAttempt(db: Db, testId: string): Promise<AttemptRow | null> {
  const { data } = await db.from('hiring_attempts').select('id, deadline_at, submitted_at').eq('test_id', testId).maybeSingle()
  return (data as AttemptRow | null) ?? null
}

/** Closes an attempt whose time ran out while the page was shut. True if it did. */
async function closeIfOver(db: Db, attempt: AttemptRow): Promise<boolean> {
  if (attempt.submitted_at) return true
  if (Date.now() <= new Date(attempt.deadline_at).getTime() + 30_000) return false
  await submitHiringTest(db, { attemptId: attempt.id, reason: 'timer' })
  return true
}

/** What the link's first screen may know: the name to confirm, the subject and the time. Never the paper. */
export async function openHiringTest(db: Db, token: string): Promise<HiringOpenResult> {
  const test = await loadTest(db, token)
  if (!test || test.state === 'voided') return { status: 'not_found' }
  if (test.state === 'submitted') return { status: 'submitted' }

  let started = false
  if (test.state === 'started') {
    const attempt = await loadAttempt(db, test.id)
    if (attempt && (await closeIfOver(db, attempt))) return { status: 'submitted' }
    started = true
  } else if (Date.now() >= new Date(test.expires_at).getTime()) {
    return { status: 'expired' }
  }

  // Only while still 'issued': a slow load that read 'issued' must not write
  // 'opened' over a start or a submit that landed meanwhile. The database
  // refuses any backward move too (migration 0022).
  if (test.state === 'issued') {
    await db.from('hiring_tests').update({ state: 'opened' }).eq('id', test.id).eq('state', 'issued')
  }

  return {
    status: 'ok',
    applicantName: test.hiring_applicants.name,
    subject: test.subject,
    minutes: test.limit_minutes,
    questionCount: test.question_count,
    expiresAt: test.expires_at,
    started,
  }
}

export type HiringIdentifyResult = { ok: true; applicantName: string } | { ok: false; locked: boolean; remaining: number }

/**
 * The number check, rate limited per link and per IP across links, counted in
 * identify_attempts with the admissions test's (the token tells them apart,
 * and the purge clears both by age). The same answer for a wrong number, a
 * malformed one and no such link.
 */
export async function identifyApplicant(
  db: Db,
  { token, mobile, ip }: { token: string; mobile: string; ip?: string | null },
): Promise<HiringIdentifyResult> {
  if (!isValidTokenShape(token)) return { ok: false, locked: false, remaining: 0 }
  const failures = await failuresFor(db, token)
  if (failures >= MAX_IDENTIFY_FAILURES) return { ok: false, locked: true, remaining: 0 }
  if (ip && (await attemptsFromIp(db, ip)) >= MAX_IDENTIFY_PER_IP_HOUR) return { ok: false, locked: true, remaining: 0 }

  const test = await loadTest(db, token)
  const matched = test !== null && ['issued', 'opened', 'started'].includes(test.state) && mobilesMatch(mobile, test.hiring_applicants.mobile)
  await db.from('identify_attempts').insert({ token, ip: ip ?? null, ok: matched })

  if (!matched) {
    const used = failures + 1
    return { ok: false, locked: used >= MAX_IDENTIFY_FAILURES, remaining: Math.max(0, MAX_IDENTIFY_FAILURES - used) }
  }
  return { ok: true, applicantName: test!.hiring_applicants.name }
}

async function failuresFor(db: Db, token: string): Promise<number> {
  const { count } = await db.from('identify_attempts').select('id', { count: 'exact', head: true }).eq('token', token).eq('ok', false)
  return count ?? 0
}

async function attemptsFromIp(db: Db, ip: string): Promise<number> {
  const { count } = await db
    .from('identify_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('at', new Date(Date.now() - 60 * 60_000).toISOString())
  return count ?? 0
}

export interface HiringSavedAnswer {
  position: number
  choice: Choice | null
  numericValue: number | null
}

export interface HiringStart {
  attemptId: string
  deadlineAt: string
  questions: ApplicantQuestion[]
  answers: HiringSavedAnswer[]
  resumed: boolean
}

/**
 * Starts the attempt, or returns the one under way with its answers. The
 * number is checked again here, counted like a failed identity check.
 */
export async function startHiringAttempt(
  db: Db,
  { token, mobile, context }: { token: string; mobile: string; context: { userAgent?: string | null; ip?: string | null } },
): Promise<HiringStart> {
  const who = await identifyApplicant(db, { token, mobile, ip: context.ip })
  if (!who.ok) throw new Error(who.locked ? 'Too many attempts. Please ask the institute for a new link.' : 'That number does not match this link.')

  const test = await loadTest(db, token)
  if (!test || !['issued', 'opened', 'started'].includes(test.state)) throw new Error('This link is no longer available.')

  let attempt = await loadAttempt(db, test.id)
  let resumed = true
  if (attempt) {
    if (await closeIfOver(db, attempt)) throw new Error('This test has already been submitted.')
  } else {
    if (Date.now() >= new Date(test.expires_at).getTime()) throw new Error('This link has expired.')
    const { data, error } = await db
      .from('hiring_attempts')
      // deadline_at is set by the database (hiring_attempts_start); this value is overwritten.
      .insert({ test_id: test.id, deadline_at: new Date().toISOString(), user_agent: context.userAgent?.slice(0, 500) ?? null, ip: context.ip ?? null })
      .select('id, deadline_at, submitted_at')
      .single()
    if (error) {
      console.error('hiring: start failed:', error)
      throw new Error('The test could not be started. Try again.')
    }
    attempt = data as AttemptRow
    resumed = false
  }

  return {
    attemptId: attempt.id,
    deadlineAt: attempt.deadline_at,
    questions: toApplicantPaper(await loadPaper(db, test.id)),
    answers: resumed ? await loadAnswers(db, attempt.id) : [],
    resumed,
  }
}

async function loadPaper(db: Db, testId: string): Promise<{ position: number; item: HiringItemRow }[]> {
  const { data, error } = await db
    .from('hiring_test_items')
    .select('position, hiring_items(*)')
    .eq('test_id', testId)
    .order('position')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ position: r.position as number, item: r.hiring_items as never as HiringItemRow }))
}

async function loadAnswers(db: Db, attemptId: string): Promise<HiringSavedAnswer[]> {
  const { data } = await db
    .from('hiring_answers')
    .select('position, choice, numeric_value')
    .eq('attempt_id', attemptId)
    .order('position')
  return (data ?? [])
    .filter((a) => a.choice !== null || a.numeric_value !== null)
    .map((a) => ({ position: a.position as number, choice: (a.choice as Choice | null) ?? null, numericValue: a.numeric_value === null ? null : Number(a.numeric_value) }))
}

/** Saves one answer, or clears it (both null). The database refuses a closed attempt or a wrong shape. */
export async function saveHiringAnswer(
  db: Db,
  { attemptId, position, choice, numericValue }: { attemptId: string; position: number; choice: Choice | null; numericValue: number | null },
): Promise<void> {
  if (!UUID.test(attemptId)) throw new Error('No such attempt.')
  if (!Number.isInteger(position) || position < 1 || position > 15) throw new Error('That question is not on this paper.')
  if (choice !== null && !CHOICES.includes(choice)) throw new Error('That answer does not fit this question.')
  if (numericValue !== null && (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 9999)) {
    throw new Error('Enter a whole number from 0 to 9999.')
  }

  const { error } = await db
    .from('hiring_answers')
    .upsert({ attempt_id: attemptId, position, choice, numeric_value: numericValue }, { onConflict: 'attempt_id,position' })
  if (error) {
    const m = error.message ?? ''
    if (m.includes('closed')) throw new Error('Time is up: this test is closed.')
    if (m.includes('wrong shape') || m.includes('not on this paper')) throw new Error('That answer does not fit this question.')
    console.error('hiring: save failed:', error)
    throw new Error('The answer could not be saved. Try again.')
  }
}

/** Grades and closes the attempt in the database. The score is never returned to the applicant. */
export async function submitHiringTest(db: Db, { attemptId, reason }: { attemptId: string; reason: 'manual' | 'timer' }): Promise<void> {
  if (!UUID.test(attemptId)) throw new Error('No such attempt.')
  const { error } = await db.rpc('submit_hiring_attempt', { p_attempt: attemptId, p_reason: reason })
  if (error) {
    console.error('hiring: submit failed:', error)
    throw new Error('The test could not be submitted. Try again.')
  }
}
