import 'server-only'
import type { Db } from './supabase'
import { isValidTokenShape } from '../lib/token'
import { mobilesMatch } from '../lib/mobile'
import { toCandidatePaper, type BankRow, type CandidateQuestion } from '../lib/serialize'
import { gradeAttempt, type GradeItem, type GradeAnswer } from '../lib/grade'
import { computeActiveMs, computeDeadline, canStart, type TimerEvent } from '../lib/timer'
import { limitMsFor, type Choice, type Subject } from '../lib/types'

const LIVE_STATES = ['issued', 'opened', 'started']

/** Failed identity attempts before a token is locked (spec §5). */
export const MAX_IDENTIFY_FAILURES = 5
/** Identity attempts allowed per IP per hour, across all tokens. */
export const MAX_IDENTIFY_PER_IP_HOUR = 20

export interface Attempt {
  id: string
  assessment_id: string
  started_at: string
  active_ms: number
  deadline_at: string
  submitted_at: string | null
}

/** What the candidate is told about the paper before it opens. */
export interface PaperMeta {
  questionCount: number
  minutes: number
  /** Class N−1, named on syllabus questions. Null on a paper without them. */
  syllabusClass: number | null
}

export type OpenResult =
  | ({ status: 'ok'; candidateName: string; expiresAt: string; alreadySubmitted: boolean } & PaperMeta)
  | { status: 'not_found' | 'expired' | 'too_late' | 'submitted' }

/**
 * What the landing page may know before the candidate proves anything: the
 * name to confirm, and how long the window has left. Never the paper.
 */
export async function openByToken(db: Db, token: string): Promise<OpenResult> {
  if (!isValidTokenShape(token)) return { status: 'not_found' }

  const row = await loadByToken(db, token)
  if (!row) return { status: 'not_found' }

  if (row.state === 'submitted') return { status: 'submitted' }
  if (!LIVE_STATES.includes(row.state)) return { status: 'not_found' }

  const expiresAt = new Date(row.expires_at).getTime()
  if (Date.now() >= expiresAt) return { status: 'expired' }

  // Starting with less than the paper's full time left would hand them a
  // truncated test and a score nobody can read, so the link is treated as
  // spent (spec §4).
  if (row.state !== 'started' && !canStart(Date.now(), expiresAt, limitMsOf(row))) return { status: 'too_late' }

  if (row.state === 'issued') {
    await db.from('assessments').update({ state: 'opened' }).eq('id', row.id)
  }

  return {
    status: 'ok',
    candidateName: row.leads.name,
    expiresAt: row.expires_at,
    alreadySubmitted: false,
    ...paperMeta(row),
  }
}

export type IdentifyResult =
  | { ok: true; candidateName: string }
  | { ok: false; locked: boolean; remaining: number }

/**
 * The identity gate: the candidate types the number the link was sent to.
 *
 * The number is a 10-digit secret in a known format, so this is rate limited —
 * per token, and per IP across all tokens. Both counters live in the database,
 * because serverless instances do not share memory and an in-memory limit
 * would multiply by the instance count.
 *
 * Returns the same shape for "wrong number", "unparseable input" and "no such
 * token", so probing cannot tell them apart.
 */
export async function identify(
  db: Db,
  { token, mobile, ip }: { token: string; mobile: string; ip?: string | null },
): Promise<IdentifyResult> {
  if (!isValidTokenShape(token)) return { ok: false, locked: false, remaining: 0 }

  const failures = await failuresForToken(db, token)
  if (failures >= MAX_IDENTIFY_FAILURES) return { ok: false, locked: true, remaining: 0 }
  if (ip && (await attemptsFromIp(db, ip)) >= MAX_IDENTIFY_PER_IP_HOUR) {
    return { ok: false, locked: true, remaining: 0 }
  }

  const row = await loadByToken(db, token)
  const matched =
    row != null && LIVE_STATES.includes(row.state) && mobilesMatch(mobile, row.leads.contact_mobile)

  // Recorded whatever the outcome: the failures are the forensics.
  await db.from('identify_attempts').insert({ token, ip: ip ?? null, ok: matched })

  if (!matched) {
    const used = failures + 1
    return {
      ok: false,
      locked: used >= MAX_IDENTIFY_FAILURES,
      remaining: Math.max(0, MAX_IDENTIFY_FAILURES - used),
    }
  }

  return { ok: true, candidateName: row!.leads.name }
}

/**
 * All failures for this token, not just recent ones. No time window is needed:
 * a token only lives three hours, so its whole history IS the recent window.
 */
async function failuresForToken(db: Db, token: string): Promise<number> {
  const { count } = await db
    .from('identify_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('token', token)
    .eq('ok', false)
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

export interface AttemptContext {
  userAgent?: string | null
  ip?: string | null
  screen?: string | null
}

/**
 * Starts the attempt, or returns the one in progress.
 *
 * Resume is not a separate path: returning to the link mid-attempt lands here
 * and gets the same attempt back with a recomputed deadline, because the
 * unique constraint on assessment_id makes a second attempt impossible anyway.
 */
export async function startAttempt(
  db: Db,
  { token, context }: { token: string; context: AttemptContext },
): Promise<{ attempt: Attempt; questions: CandidateQuestion[]; answers: SavedAnswer[]; resumed: boolean }> {
  if (!isValidTokenShape(token)) throw new Error('This link is not valid.')

  const row = await loadByToken(db, token)
  if (!row || !LIVE_STATES.includes(row.state)) throw new Error('This link is no longer available.')

  const expiresAt = new Date(row.expires_at).getTime()
  if (Date.now() >= expiresAt) throw new Error('This link has expired.')

  const questions = toCandidatePaper(await loadPaper(db, row.id))

  const existing = await loadAttempt(db, row.id)
  if (existing) {
    if (existing.submitted_at) throw new Error('This test has already been submitted.')
    const deadline = await refreshDeadline(db, existing, expiresAt, limitMsOf(row))
    return { attempt: deadline, questions, answers: await loadAnswers(db, existing.id), resumed: true }
  }

  if (!canStart(Date.now(), expiresAt, limitMsOf(row))) {
    throw new Error('This link is about to expire. Please ask for a fresh one.')
  }

  const { data, error } = await db
    .from('attempts')
    .insert({
      assessment_id: row.id,
      deadline_at: new Date(Date.now() + limitMsOf(row)).toISOString(),
      user_agent: context.userAgent ?? null,
      ip: context.ip ?? null,
      screen: context.screen ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return { attempt: data as Attempt, questions, answers: [], resumed: false }
}

export interface SavedAnswer {
  position: number
  choice: Choice | null
  numeric_value: number | null
  change_count: number
  changed_after_pause: boolean
}

/**
 * Saves one answer. Idempotent on (attempt, position) so a retry over a flaky
 * connection cannot duplicate or double-count.
 *
 * `changed_after_pause` is computed here rather than trusted from the client:
 * it is the signal a cheating candidate would most want to suppress.
 */
export async function saveAnswer(
  db: Db,
  {
    attemptId,
    position,
    choice = null,
    numericValue = null,
    activeMs,
  }: {
    attemptId: string
    position: number
    choice?: Choice | null
    numericValue?: number | null
    activeMs: number
  },
): Promise<void> {
  // The longest paper is 30. Whether this position is on *this* paper is the
  // database's check (attempt_answers_on_paper, migration 0014).
  if (!Number.isInteger(position) || position < 1 || position > 30) {
    throw new Error(`position ${position} is not on the paper`)
  }

  const attempt = await requireOpenAttempt(db, attemptId)

  const { data: prior } = await db
    .from('attempt_answers')
    .select('choice, numeric_value, change_count, changed_after_pause')
    .eq('attempt_id', attemptId)
    .eq('position', position)
    .maybeSingle()

  const isChange =
    prior != null && (prior.choice !== choice || Number(prior.numeric_value) !== Number(numericValue))

  const { error } = await db.from('attempt_answers').upsert(
    {
      attempt_id: attemptId,
      position,
      choice,
      numeric_value: numericValue,
      active_ms: Math.max(0, Math.round(activeMs)),
      change_count: (prior?.change_count ?? 0) + (isChange ? 1 : 0),
      changed_after_pause:
        (prior?.changed_after_pause ?? false) ||
        (isChange && (await pausedSinceLastAnswer(db, attempt.id, position))),
      last_answered_at: new Date().toISOString(),
    },
    { onConflict: 'attempt_id,position' },
  )

  if (error) throw new Error(error.message)
}

export interface IncomingEvent {
  kind: string
  position?: number | null
  payload?: Record<string, unknown>
}

/**
 * Appends telemetry. Fire-and-forget by design: losing events degrades the
 * report, but must never block a candidate from answering.
 */
export async function recordEvents(
  db: Db,
  { attemptId, events }: { attemptId: string; events: IncomingEvent[] },
): Promise<void> {
  if (!events.length) return

  const rows = events.slice(0, 200).map((e) => ({
    attempt_id: attemptId,
    kind: e.kind,
    position: e.position ?? null,
    // Timestamped on the server. A client clock is not evidence.
    payload: e.payload ?? {},
  }))

  const { error } = await db.from('attempt_events').insert(rows)
  if (error) throw new Error(error.message)
}

export interface SubmitResult {
  score: number
  correct: number
  incorrect: number
  skipped: number
  sections: Record<Subject, number>
}

/**
 * Grades server-side against the key the candidate never received, and closes
 * the attempt. A trigger moves the assessment to `submitted`.
 */
export async function submitAttempt(
  db: Db,
  { attemptId, reason }: { attemptId: string; reason: 'manual' | 'timer' | 'window' },
): Promise<SubmitResult> {
  const attempt = await requireOpenAttempt(db, attemptId)

  const paper = await loadPaper(db, attempt.assessment_id)
  const items: GradeItem[] = paper.map(({ position, item }) => ({
    position,
    subject: item.subject,
    format: item.format,
    answerKey: item.answer_key,
    numericAnswer: item.numeric_answer === null ? null : Number(item.numeric_answer),
    numericTolerance: Number(item.numeric_tolerance ?? 0),
  }))

  const saved = await loadAnswers(db, attemptId)
  const answers: GradeAnswer[] = saved.map((a) => ({
    position: a.position,
    choice: a.choice,
    numericValue: a.numeric_value === null ? null : Number(a.numeric_value),
  }))

  const result = gradeAttempt(items, answers)
  const activeMs = computeActiveMs(new Date(attempt.started_at).getTime(), await loadTimerEvents(db, attemptId), Date.now())

  const { error } = await db
    .from('attempts')
    .update({
      submitted_at: new Date().toISOString(),
      submit_reason: reason,
      active_ms: activeMs,
      score: result.score,
      correct: result.correct,
      incorrect: result.incorrect,
      skipped: result.skipped,
      maths_score: result.sections.maths,
      english_score: result.sections.english,
      science_score: result.sections.science,
    })
    .eq('id', attemptId)
    .is('submitted_at', null) // loses a double-submit race rather than regrading

  if (error) throw new Error(error.message)

  return {
    score: result.score,
    correct: result.correct,
    incorrect: result.incorrect,
    skipped: result.skipped,
    sections: result.sections,
  }
}

// ── internals ────────────────────────────────────────────────────────────────

interface AssessmentRow {
  id: string
  expires_at: string
  state: string
  question_count: number
  limit_minutes: number
  class_level: number | null
  leads: { name: string; contact_mobile: string }
}

/** Each paper carries its own limit: 15 minutes, or 30 for the longer paper. */
function limitMsOf(row: Pick<AssessmentRow, 'limit_minutes'>): number {
  return limitMsFor(row.limit_minutes)
}

function paperMeta(row: AssessmentRow): PaperMeta {
  return {
    questionCount: row.question_count,
    minutes: row.limit_minutes,
    syllabusClass: row.question_count === 30 && row.class_level !== null ? row.class_level - 1 : null,
  }
}

async function loadByToken(db: Db, token: string): Promise<AssessmentRow | null> {
  const { data } = await db
    .from('assessments')
    .select('id, expires_at, state, question_count, limit_minutes, class_level, leads(name, contact_mobile)')
    .eq('token', token)
    .maybeSingle()

  return (data as AssessmentRow | null) ?? null
}

async function loadPaper(db: Db, assessmentId: string): Promise<{ position: number; item: BankRow }[]> {
  const { data, error } = await db
    .from('assessment_items')
    .select('position, test_items(*)')
    .eq('assessment_id', assessmentId)
    .order('position')

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    position: row.position as number,
    item: row.test_items as never as BankRow,
  }))
}

async function loadAttempt(db: Db, assessmentId: string): Promise<Attempt | null> {
  const { data } = await db.from('attempts').select('*').eq('assessment_id', assessmentId).maybeSingle()
  return (data as Attempt | null) ?? null
}

async function loadAnswers(db: Db, attemptId: string): Promise<SavedAnswer[]> {
  const { data } = await db
    .from('attempt_answers')
    .select('position, choice, numeric_value, change_count, changed_after_pause')
    .eq('attempt_id', attemptId)
    .order('position')
  return (data ?? []) as SavedAnswer[]
}

async function loadTimerEvents(db: Db, attemptId: string): Promise<TimerEvent[]> {
  const { data } = await db
    .from('attempt_events')
    .select('kind, at')
    .eq('attempt_id', attemptId)
    .in('kind', ['pause', 'resume'])
    .order('at')

  return (data ?? []).map((e) => ({
    kind: e.kind as 'pause' | 'resume',
    at: new Date(e.at as string).getTime(),
  }))
}

async function requireOpenAttempt(db: Db, attemptId: string): Promise<Attempt & { assessment_id: string }> {
  const { data } = await db.from('attempts').select('*').eq('id', attemptId).maybeSingle()
  if (!data) throw new Error('No such attempt.')
  if (data.submitted_at) throw new Error('This test has already been submitted.')
  return data as Attempt & { assessment_id: string }
}

/** Was there a pause between the last save for this position and now? */
async function pausedSinceLastAnswer(db: Db, attemptId: string, position: number): Promise<boolean> {
  const { data } = await db
    .from('attempt_events')
    .select('kind, at')
    .eq('attempt_id', attemptId)
    .eq('kind', 'resume')
    .order('at', { ascending: false })
    .limit(1)

  if (!data?.length) return false

  const { data: answer } = await db
    .from('attempt_answers')
    .select('last_answered_at')
    .eq('attempt_id', attemptId)
    .eq('position', position)
    .maybeSingle()

  if (!answer?.last_answered_at) return false
  return new Date(data[0]!.at as string).getTime() > new Date(answer.last_answered_at as string).getTime()
}

/** Recomputes the server-authoritative deadline on resume. */
async function refreshDeadline(db: Db, attempt: Attempt, windowEndsAt: number, limitMs: number): Promise<Attempt> {
  const deadline = computeDeadline({
    startedAt: new Date(attempt.started_at).getTime(),
    events: await loadTimerEvents(db, attempt.id),
    now: Date.now(),
    windowEndsAt,
    limitMs,
  })

  const { data } = await db
    .from('attempts')
    .update({ deadline_at: new Date(deadline).toISOString() })
    .eq('id', attempt.id)
    .select()
    .single()

  return (data as Attempt) ?? attempt
}
