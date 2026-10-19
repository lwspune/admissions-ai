import 'server-only'
import type { Db } from './supabase'
import type { ItemStatus } from '../lib/items'
import type { Choice } from '../lib/types'
import { generateToken } from '../lib/token'
import { validateApplicant, type HiringFormat, type HiringSource, type HiringSubject } from '../lib/hiring'

export type HiringResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Adds an applicant for the signed-in teacher or superadmin. The database
 * stamps who added them; a teacher sees only their own (migration 0021).
 */
export async function addApplicant(
  db: Db,
  input: { name: string; mobile: string; subject: string },
): Promise<HiringResult<{ id: string }>> {
  const checked = validateApplicant(input)
  if (!checked.ok) return checked

  const { data, error } = await db.from('hiring_applicants').insert(checked.value).select('id').single()
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only a teacher or superadmin can add an applicant.' }
    console.error('hiring: add applicant failed:', error)
    return { ok: false, error: 'The applicant could not be saved. Try again.' }
  }
  return { ok: true, id: data.id as string }
}

/**
 * Issues a fresh test: the database draws the paper, voids any earlier link
 * and refuses a fourth (issue_hiring_test). Returns the token for the link.
 */
export async function issueHiringTest(db: Db, applicantId: string): Promise<HiringResult<{ token: string; testId: string }>> {
  const token = generateToken()
  const { data, error } = await db.rpc('issue_hiring_test', { p_applicant: applicantId, p_token: token })
  if (error) {
    const message = error.message ?? ''
    if (error.code === '42501') return { ok: false, error: 'You cannot issue a test to this applicant.' }
    if (message.includes('already submitted')) return { ok: false, error: 'This applicant has already taken the test.' }
    if (message.includes('3 tests')) return { ok: false, error: 'This applicant has had three tests, the most allowed.' }
    if (message.includes('not enough live') || message.includes('could not draw')) {
      return { ok: false, error: 'Not enough questions are live for this subject yet.' }
    }
    console.error('hiring: issue failed:', error)
    return { ok: false, error: 'The test could not be issued. Try again.' }
  }
  const test = data as { id: string; token: string }
  return { ok: true, token: test.token, testId: test.id }
}

// The teacher screening test's server side (HIRING_TEST_SPEC.md). Every read
// here runs on the session-bound client: can_hire() in migration 0020 decides
// who sees what, not an `if` in this file.

export interface HiringBankItem {
  id: string
  sourceRef: string
  source: HiringSource
  paper: string
  subject: HiringSubject
  chapter: string
  format: HiringFormat
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
  answerKey: Choice | null
  numericAnswer: number | null
  status: ItemStatus
}

/** One subject's questions, answers included. A subject holds a few hundred, under the API's 1000-row page. */
export async function loadHiringBank(db: Db, subject: HiringSubject): Promise<HiringBankItem[]> {
  const { data, error } = await db
    .from('hiring_items')
    .select('id, source_ref, source, paper, subject, chapter, format, direction, stem, options, answer_key, numeric_answer, status')
    .eq('subject', subject)
    .order('format')
    .order('chapter')
    .order('source_ref')

  if (error) throw new Error(`could not read the hiring bank: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    sourceRef: row.source_ref as string,
    source: row.source as HiringSource,
    paper: row.paper as string,
    subject: row.subject as HiringSubject,
    chapter: row.chapter as string,
    format: row.format as HiringFormat,
    direction: (row.direction as string | null) ?? null,
    stem: row.stem as string,
    options: (row.options as Record<Choice, string> | null) ?? null,
    answerKey: (row.answer_key as Choice | null) ?? null,
    numericAnswer: row.numeric_answer === null ? null : Number(row.numeric_answer),
    status: row.status as ItemStatus,
  }))
}
