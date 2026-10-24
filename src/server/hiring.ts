import 'server-only'
import type { Db } from './supabase'
import type { ItemStatus } from '../lib/items'
import type { Choice } from '../lib/types'
import { generateToken } from '../lib/token'
import {
  HIRING_DECISIONS,
  resumeDownloadName,
  validateApplicant,
  validateNote,
  type HiringDecision,
  type HiringFormat,
  type HiringSource,
  type HiringSubject,
  type ResumeKind,
} from '../lib/hiring'

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

// ── after the test: notes, decision, resume (migration 0023) ────────────────

/** A note on an applicant; the database stamps the author and refuses an applicant this session cannot see. */
export async function addHiringNote(db: Db, applicantId: string, body: string): Promise<HiringResult> {
  const checked = validateNote(body)
  if (!checked.ok) return checked
  const { error } = await db.from('hiring_notes').insert({ applicant_id: applicantId, body: checked.value })
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'You cannot add a note to this applicant.' }
    console.error('hiring: add note failed:', error)
    return { ok: false, error: 'The note could not be saved. Try again.' }
  }
  return { ok: true }
}

/**
 * Sets where an applicant stands. A teacher may not touch hired or rejected,
 * into or out of (hiring_applicants_decision_guard); RLS hides another
 * teacher's applicant, which updates nothing.
 */
export async function setHiringDecision(db: Db, applicantId: string, decision: string): Promise<HiringResult> {
  if (!HIRING_DECISIONS.includes(decision as HiringDecision)) return { ok: false, error: 'Choose a decision.' }
  const { data, error } = await db.from('hiring_applicants').update({ decision }).eq('id', applicantId).select('id')
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'Only superadmin can mark an applicant hired or rejected.' }
    console.error('hiring: set decision failed:', error)
    return { ok: false, error: 'The decision could not be saved. Try again.' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'You cannot change this applicant.' }
  return { ok: true }
}

/**
 * Records a resume the browser has just uploaded under the applicant's id
 * (attach_resume checks it is there and reads its type from storage).
 */
export async function attachResume(db: Db, applicantId: string, fileName: string): Promise<HiringResult> {
  const { error } = await db.rpc('attach_resume', { p_applicant: applicantId, p_file_name: fileName.slice(0, 200) })
  if (error) {
    const message = error.message ?? ''
    if (error.code === '42501') return { ok: false, error: 'You cannot add a resume for this applicant.' }
    if (message.includes('upload the resume')) return { ok: false, error: 'The file did not upload. Try again.' }
    console.error('hiring: attach resume failed:', error)
    return { ok: false, error: 'The resume could not be saved. Try again.' }
  }
  return { ok: true }
}

/**
 * A ten-minute link to an applicant's resume; null when there is none or the
 * storage policy refuses this session. A PDF opens in the browser; a Word
 * file downloads, named after the applicant.
 */
export async function hiringResumeUrl(
  db: Db,
  applicant: { id: string; name: string; resumeType: ResumeKind | null },
): Promise<string | null> {
  if (!applicant.resumeType) return null
  const options = applicant.resumeType === 'docx' ? { download: resumeDownloadName(applicant.name, 'docx') } : undefined
  const { data, error } = await db.storage.from('hiring-resumes').createSignedUrl(applicant.id, 600, options)
  if (error || !data) return null
  return data.signedUrl
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

// ── the /hiring pages ───────────────────────────────────────────────────────

export interface HiringTestSummary {
  id: string
  token: string
  state: string
  issueSeq: number
  expiresAt: string
  createdAt: string
  limitMinutes: number
}

export interface HiringAttemptSummary {
  startedAt: string
  deadlineAt: string
  submittedAt: string | null
  submitReason: 'manual' | 'timer' | null
  score: number | null
  correct: number | null
  incorrect: number | null
  skipped: number | null
}

export interface HiringApplicantRow {
  id: string
  name: string
  mobile: string
  subject: HiringSubject
  createdAt: string
  createdBy: string | null
  decision: HiringDecision
  resumeType: ResumeKind | null
  resumeName: string | null
  resumeAt: string | null
  /** The newest test; earlier ones were voided by it. */
  latest: HiringTestSummary | null
  attempt: HiringAttemptSummary | null
}

interface AttemptRowRaw {
  id: string
  started_at: string
  deadline_at: string
  submitted_at: string | null
  submit_reason: 'manual' | 'timer' | null
  score: number | string | null
  correct: number | null
  incorrect: number | null
  skipped: number | null
}

interface TestRowRaw {
  id: string
  token: string
  state: string
  issue_seq: number
  expires_at: string
  created_at: string
  limit_minutes: number
  hiring_attempts: AttemptRowRaw[] | AttemptRowRaw | null
}

const num = (v: number | string | null) => (v === null ? null : Number(v))

function toTest(t: TestRowRaw): HiringTestSummary {
  return {
    id: t.id,
    token: t.token,
    state: t.state,
    issueSeq: t.issue_seq,
    expiresAt: t.expires_at,
    createdAt: t.created_at,
    limitMinutes: t.limit_minutes,
  }
}

/** One attempt per test (unique test_id), which PostgREST may return as an object or a list. */
function attemptOf(t: TestRowRaw): AttemptRowRaw | null {
  const a = t.hiring_attempts
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function toAttempt(a: AttemptRowRaw): HiringAttemptSummary {
  return {
    startedAt: a.started_at,
    deadlineAt: a.deadline_at,
    submittedAt: a.submitted_at,
    submitReason: a.submit_reason,
    score: num(a.score),
    correct: a.correct,
    incorrect: a.incorrect,
    skipped: a.skipped,
  }
}

/**
 * Grades any attempt whose time ran out with the page closed, so the list
 * shows a score rather than "taking the test" forever. A failure only delays
 * that; it never blocks the page.
 */
async function closeExpired(db: Db): Promise<void> {
  const { error } = await db.rpc('close_expired_hiring_attempts')
  if (error) console.error('hiring: closing expired attempts failed:', error)
}

const APPLICANT_COLUMNS = 'id, name, mobile, subject, created_at, created_by, decision, resume_type, resume_name, resume_at'

function toApplicant(row: Record<string, unknown>): Omit<HiringApplicantRow, 'latest' | 'attempt'> {
  return {
    id: row.id as string,
    name: row.name as string,
    mobile: row.mobile as string,
    subject: row.subject as HiringSubject,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    decision: row.decision as HiringDecision,
    resumeType: (row.resume_type as ResumeKind | null) ?? null,
    resumeName: (row.resume_name as string | null) ?? null,
    resumeAt: (row.resume_at as string | null) ?? null,
  }
}

const TEST_COLUMNS =
  'id, token, state, issue_seq, expires_at, created_at, limit_minutes, ' +
  'hiring_attempts(id, started_at, deadline_at, submitted_at, submit_reason, score, correct, incorrect, skipped)'

/** The applicants this session may see — a teacher's own, or all for superadmin — newest first. */
export async function loadApplicants(db: Db): Promise<HiringApplicantRow[]> {
  await closeExpired(db)
  const { data, error } = await db
    .from('hiring_applicants')
    .select(`${APPLICANT_COLUMNS}, hiring_tests(${TEST_COLUMNS})`)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`could not read applicants: ${error.message}`)

  return (data ?? []).map((row) => {
    const tests = ((row.hiring_tests ?? []) as unknown as TestRowRaw[]).sort((a, b) => b.issue_seq - a.issue_seq)
    const latest = tests[0] ?? null
    const attempt = latest ? attemptOf(latest) : null
    return {
      ...toApplicant(row),
      latest: latest ? toTest(latest) : null,
      attempt: attempt ? toAttempt(attempt) : null,
    }
  })
}

export type HiringVerdict = 'correct' | 'incorrect' | 'skipped'

export interface HiringReportQuestion {
  position: number
  format: HiringFormat
  chapter: string
  paper: string
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
  answerKey: Choice | null
  numericAnswer: number | null
  /** What the applicant gave: a letter, a number as text, or null. */
  given: string | null
  verdict: HiringVerdict
}

export interface HiringNote {
  id: number
  kind: 'note' | 'decision' | 'resume'
  body: string
  authorName: string | null
  createdAt: string
}

export interface HiringApplicantReport {
  applicant: Omit<HiringApplicantRow, 'latest' | 'attempt'>
  /** The history, newest first. */
  notes: HiringNote[]
  tests: HiringTestSummary[]
  /** The test the report is about: the submitted one, else the newest. */
  test: HiringTestSummary | null
  attempt: HiringAttemptSummary | null
  /** Empty until that test has an attempt. */
  questions: HiringReportQuestion[]
}

interface PaperItemRaw {
  format: HiringFormat
  chapter: string
  paper: string
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
  answer_key: Choice | null
  numeric_answer: number | string | null
}

/**
 * One applicant, question by question. Null when there is no such applicant
 * or this session may not see them — the same answer for both.
 */
export async function loadApplicantReport(db: Db, applicantId: string): Promise<HiringApplicantReport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(applicantId)) return null
  await closeExpired(db)

  const [{ data: row, error }, notesRes] = await Promise.all([
    db.from('hiring_applicants').select(`${APPLICANT_COLUMNS}, hiring_tests(${TEST_COLUMNS})`).eq('id', applicantId).maybeSingle(),
    db
      .from('hiring_notes')
      .select('id, kind, body, author_name, created_at')
      .eq('applicant_id', applicantId)
      .order('id', { ascending: false }),
  ])
  if (error) throw new Error(`could not read the applicant: ${error.message}`)
  if (notesRes.error) throw new Error(`could not read the notes: ${notesRes.error.message}`)
  if (!row) return null

  const raw = ((row.hiring_tests ?? []) as unknown as TestRowRaw[]).sort((a, b) => b.issue_seq - a.issue_seq)
  const chosen = raw.find((t) => t.state === 'submitted') ?? raw[0] ?? null
  const attemptRaw = chosen ? attemptOf(chosen) : null

  let questions: HiringReportQuestion[] = []
  if (chosen && attemptRaw) {
    const [paperRes, answersRes] = await Promise.all([
      db
        .from('hiring_test_items')
        .select('position, hiring_items(format, chapter, paper, direction, stem, options, answer_key, numeric_answer)')
        .eq('test_id', chosen.id)
        .order('position'),
      db.from('hiring_answers').select('position, choice, numeric_value').eq('attempt_id', attemptRaw.id),
    ])
    const failure = paperRes.error ?? answersRes.error
    if (failure) throw new Error(`could not read the paper: ${failure.message}`)

    const byPosition = new Map((answersRes.data ?? []).map((a) => [a.position as number, a]))
    questions = (paperRes.data ?? []).map((p) => {
      const i = p.hiring_items as unknown as PaperItemRaw
      const a = byPosition.get(p.position as number)
      const given = (a?.choice as string | null | undefined) ?? (a?.numeric_value == null ? null : String(a.numeric_value))
      const verdict: HiringVerdict =
        given === null
          ? 'skipped'
          : i.format === 'mcq'
            ? given === i.answer_key
              ? 'correct'
              : 'incorrect'
            : Number(given) === Number(i.numeric_answer)
              ? 'correct'
              : 'incorrect'
      return {
        position: p.position as number,
        format: i.format,
        chapter: i.chapter,
        paper: i.paper,
        direction: i.direction,
        stem: i.stem,
        options: i.options,
        answerKey: i.answer_key,
        numericAnswer: num(i.numeric_answer),
        given,
        verdict,
      }
    })
  }

  return {
    applicant: toApplicant(row),
    notes: (notesRes.data ?? []).map((n) => ({
      id: Number(n.id),
      kind: n.kind as HiringNote['kind'],
      body: n.body as string,
      authorName: (n.author_name as string | null) ?? null,
      createdAt: n.created_at as string,
    })),
    tests: raw.map(toTest),
    test: chosen ? toTest(chosen) : null,
    attempt: attemptRaw ? toAttempt(attemptRaw) : null,
    questions,
  }
}
