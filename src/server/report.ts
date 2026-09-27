import 'server-only'
import type { Db } from './supabase'
import type { Role } from './auth'
import { buildReport, type ReportInput, type ReportPaperItem } from '../lib/report'
import { LIMIT_MS } from '../lib/types'

export interface LeadReport {
  lead: { id: string; name: string; contact_mobile: string; school: string | null; class_level: number | null }
  issue: { seq: number; of: number; createdAt: string; expiresAt: string; state: string }
  attempt: { startedAt: string; submittedAt: string | null; submitReason: string | null } | null
  report: ReturnType<typeof buildReport> | null
  /** Prior issues that were abandoned or replaced. Three of these is itself a finding. */
  priorIssues: { seq: number; state: string; createdAt: string }[]
  identifyFailures: number
}

/**
 * Everything the report page shows for one lead.
 *
 * Runs on the session-bound client, so RLS decides whether this staff member
 * may see it. Question stems are stripped for telecallers by the caller —
 * staff who see the same items repeatedly can coach them, and the incentives
 * push exactly that way.
 */
export async function loadLeadReport(db: Db, leadId: string, role: Role): Promise<LeadReport | null> {
  const { data: lead } = await db
    .from('leads')
    .select('id, name, contact_mobile, school, class_level')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return null

  const { data: assessments } = await db
    .from('assessments')
    .select('id, token, issue_seq, state, created_at, expires_at')
    .eq('lead_id', leadId)
    .order('issue_seq', { ascending: false })

  const all = assessments ?? []
  // The newest issue that got furthest: a submitted one always wins.
  const current = all.find((a) => a.state === 'submitted') ?? all[0]

  if (!current) {
    return {
      lead,
      issue: { seq: 0, of: 3, createdAt: '', expiresAt: '', state: 'none' },
      attempt: null,
      report: null,
      priorIssues: [],
      identifyFailures: 0,
    }
  }

  const { count: failures } = await db
    .from('identify_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('token', current.token)
    .eq('ok', false)

  const { data: attempt } = await db
    .from('attempts')
    .select('id, started_at, submitted_at, submit_reason, active_ms')
    .eq('assessment_id', current.id)
    .maybeSingle()

  const base = {
    lead,
    issue: {
      seq: current.issue_seq as number,
      of: 3,
      createdAt: current.created_at as string,
      expiresAt: current.expires_at as string,
      state: current.state as string,
    },
    priorIssues: all
      .filter((a) => a.id !== current.id)
      .map((a) => ({ seq: a.issue_seq as number, state: a.state as string, createdAt: a.created_at as string })),
    identifyFailures: failures ?? 0,
  }

  if (!attempt) return { ...base, attempt: null, report: null }

  const [paper, answers, events] = await Promise.all([
    loadPaper(db, current.id, role),
    loadAnswers(db, attempt.id),
    loadEvents(db, attempt.id),
  ])

  const input: ReportInput = { paper, answers, events, activeMs: attempt.active_ms ?? 0, limitMs: LIMIT_MS }

  return {
    ...base,
    attempt: {
      startedAt: attempt.started_at as string,
      submittedAt: attempt.submitted_at as string | null,
      submitReason: attempt.submit_reason as string | null,
    },
    report: buildReport(input),
  }
}

async function loadPaper(db: Db, assessmentId: string, role: Role): Promise<ReportPaperItem[]> {
  const { data } = await db
    .from('assessment_items')
    .select('position, test_items(subject, skill, difficulty, format, stem, options, answer_key, numeric_answer, numeric_tolerance)')
    .eq('assessment_id', assessmentId)
    .order('position')

  const hideStems = role === 'telecaller'

  return (data ?? []).map((row) => {
    const item = row.test_items as never as {
      subject: ReportPaperItem['subject']
      skill: string
      difficulty: ReportPaperItem['difficulty']
      format: ReportPaperItem['format']
      stem: string
      options: ReportPaperItem['options']
      answer_key: ReportPaperItem['answerKey']
      numeric_answer: number | null
      numeric_tolerance: number | null
    }
    return {
      position: row.position as number,
      subject: item.subject,
      skill: item.skill,
      difficulty: item.difficulty,
      format: item.format,
      // Telecallers get the shape of the question, never its text.
      stem: hideStems ? '' : item.stem,
      options: hideStems ? null : item.options,
      answerKey: item.answer_key,
      numericAnswer: item.numeric_answer === null ? null : Number(item.numeric_answer),
      numericTolerance: Number(item.numeric_tolerance ?? 0),
    }
  })
}

async function loadAnswers(db: Db, attemptId: string) {
  const { data } = await db
    .from('attempt_answers')
    .select('position, choice, numeric_value, active_ms, change_count, changed_after_pause')
    .eq('attempt_id', attemptId)
    .order('position')

  return (data ?? []).map((a) => ({
    position: a.position as number,
    choice: a.choice as ReportPaperItem['answerKey'],
    numericValue: a.numeric_value === null ? null : Number(a.numeric_value),
    activeMs: (a.active_ms as number) ?? 0,
    changeCount: (a.change_count as number) ?? 0,
    changedAfterPause: Boolean(a.changed_after_pause),
  }))
}

async function loadEvents(db: Db, attemptId: string) {
  const { data } = await db
    .from('attempt_events')
    .select('kind, position, at, payload')
    .eq('attempt_id', attemptId)
    .order('at')

  return (data ?? []).map((e) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    const offset = payload.offsetMs
    return {
      kind: e.kind as string,
      position: (e.position as number | null) ?? null,
      at: new Date(e.at as string).getTime(),
      offsetMs: typeof offset === 'number' ? offset : null,
      payload,
    }
  })
}
