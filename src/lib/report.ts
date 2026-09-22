import { gradeAttempt, type GradeItem, type GradeAnswer } from './grade'
import { SUBJECTS, CHOICES, type Subject, type Choice, type Format, type Difficulty } from './types'

export interface ReportPaperItem {
  position: number
  subject: Subject
  skill: string
  difficulty: Difficulty
  format: Format
  stem: string
  options: Record<Choice, string> | null
  answerKey: Choice | null
  numericAnswer: number | null
  numericTolerance: number
}

export interface ReportAnswer {
  position: number
  choice: Choice | null
  numericValue: number | null
  activeMs: number
  changeCount: number
  changedAfterPause: boolean
}

export interface ReportEvent {
  kind: string
  position: number | null
  /** Server arrival time. Flush time, so it clusters — see dwell below. */
  at: number
  /** Milliseconds from attempt start, reported by the client. Relative. */
  offsetMs: number | null
  payload: Record<string, unknown>
}

export interface ReportInput {
  paper: ReportPaperItem[]
  answers: ReportAnswer[]
  events: ReportEvent[]
  activeMs: number
  limitMs: number
}

/**
 * The five facts the report shows (spec §7), plus whether any telemetry
 * arrived at all.
 *
 * Deliberately NOT a score. Weighted integrity scoring is parked until there
 * are enough attempts to calibrate weights against — a guessed number dressed
 * up as a verdict is worse than the raw facts it replaces.
 */
export interface IntegrityFacts {
  pauseCount: number
  pauseTotalMs: number
  /** Positions whose answer was revised after a pause. The key signal. */
  changedAfterPause: number[]
  pasteCount: number
  deviceChanged: boolean
  timeUsedMs: number
  timeAvailableMs: number
  /**
   * False when no telemetry arrived. Without it the other facts read as zero,
   * which means "nothing seen", never "nothing happened" — the report must not
   * present silence as a clean bill of health.
   */
  telemetrySeen: boolean
}

export interface ReportQuestion {
  position: number
  subject: Subject
  skill: string
  difficulty: Difficulty
  format: Format
  stem: string
  givenDisplay: string | null
  correctDisplay: string
  verdict: 'correct' | 'incorrect' | 'skipped'
  delta: number
  dwellMs: number | null
  dwellSource: 'answer' | 'nav' | null
  changeCount: number
  changedAfterPause: boolean
}

export interface ReportTotals {
  score: number
  outOf: number
  correct: number
  incorrect: number
  skipped: number
  sections: Record<Subject, number>
}

/**
 * Turns one attempt into everything the report displays. Pure: no clock, no
 * database, no IO.
 */
export function buildReport(input: ReportInput): {
  facts: IntegrityFacts
  questions: ReportQuestion[]
  totals: ReportTotals
} {
  const paper = [...input.paper].sort((a, b) => a.position - b.position)
  const byPosition = new Map(input.answers.map((a) => [a.position, a]))

  const graded = gradeAttempt(
    paper.map<GradeItem>((i) => ({
      position: i.position,
      subject: i.subject,
      format: i.format,
      answerKey: i.answerKey,
      numericAnswer: i.numericAnswer,
      numericTolerance: i.numericTolerance,
    })),
    input.answers.map<GradeAnswer>((a) => ({
      position: a.position,
      choice: a.choice,
      numericValue: a.numericValue,
    })),
  )
  const verdicts = new Map(graded.perQuestion.map((q) => [q.position, q]))
  const navDwell = dwellFromNav(input.events, input.activeMs)

  const questions = paper.map<ReportQuestion>((item) => {
    const answer = byPosition.get(item.position)
    const graded = verdicts.get(item.position)
    const fromAnswer = answer && answer.activeMs > 0

    return {
      position: item.position,
      subject: item.subject,
      skill: item.skill,
      difficulty: item.difficulty,
      format: item.format,
      stem: item.stem,
      givenDisplay: display(item, answer),
      correctDisplay: correctDisplay(item),
      verdict: graded?.verdict ?? 'skipped',
      delta: graded?.delta ?? 0,
      dwellMs: fromAnswer ? answer.activeMs : (navDwell.get(item.position) ?? null),
      dwellSource: fromAnswer ? 'answer' : navDwell.has(item.position) ? 'nav' : null,
      changeCount: answer?.changeCount ?? 0,
      changedAfterPause: answer?.changedAfterPause ?? false,
    }
  })

  return {
    facts: integrityFacts(input),
    questions,
    totals: {
      score: graded.score,
      outOf: paper.length,
      correct: graded.correct,
      incorrect: graded.incorrect,
      skipped: graded.skipped,
      sections: graded.sections,
    },
  }
}

// ── facts ────────────────────────────────────────────────────────────────────

function integrityFacts(input: ReportInput): IntegrityFacts {
  const events = [...input.events].sort(byOffsetThenArrival)

  let pauseCount = 0
  let pauseTotalMs = 0
  let openPauseAt: number | null = null

  for (const event of events) {
    if (event.kind === 'pause') {
      pauseCount++
      openPauseAt = event.offsetMs
    } else if (event.kind === 'resume' && openPauseAt !== null && event.offsetMs !== null) {
      // An unpaired pause contributes nothing: the tab was closed and never
      // reopened, so there is no measurable duration to report and inventing
      // one would be a claim the data does not support.
      pauseTotalMs += Math.max(0, event.offsetMs - openPauseAt)
      openPauseAt = null
    }
  }

  const contexts = new Set(
    events.filter((e) => e.kind === 'context').map((e) => JSON.stringify(omitOffset(e.payload))),
  )

  return {
    pauseCount,
    pauseTotalMs,
    changedAfterPause: input.answers.filter((a) => a.changedAfterPause).map((a) => a.position).sort((a, b) => a - b),
    pasteCount: events.filter((e) => e.kind === 'paste').length,
    deviceChanged: contexts.size > 1,
    timeUsedMs: input.activeMs,
    timeAvailableMs: input.limitMs,
    telemetrySeen: events.length > 0,
  }
}

// ── dwell for questions with no answer row ───────────────────────────────────

/**
 * Reconstructs time-on-question from navigation offsets.
 *
 * An answered question carries its own precise dwell. A SKIPPED one has no
 * answer row at all, so its only evidence is the nav events — and their server
 * arrival time is flush time, which clusters them into 5-second groups. The
 * client-reported `offsetMs` is what makes this measurable.
 *
 * Returns nothing for a question whose events predate offsets. A missing value
 * is reported as unknown, never as zero: zero reads as "answered instantly",
 * which is a fraud signal, and asserting one from absent data would be a lie
 * in the direction that harms the candidate.
 */
function dwellFromNav(events: ReportEvent[], activeMs: number): Map<number, number> {
  const navs = events
    .filter((e) => e.kind === 'nav' && e.position !== null && e.offsetMs !== null)
    .sort((a, b) => a.offsetMs! - b.offsetMs!)

  const dwell = new Map<number, number>()
  for (let i = 0; i < navs.length; i++) {
    const arrived = navs[i]!
    // The last question visited runs until the attempt's own total.
    const left = navs[i + 1]?.offsetMs ?? activeMs
    const spent = left - arrived.offsetMs!
    if (spent < 0) continue // out-of-order batch; no honest reading available
    dwell.set(arrived.position!, (dwell.get(arrived.position!) ?? 0) + spent)
  }
  return dwell
}

// ── display ──────────────────────────────────────────────────────────────────

/** "C. thirty seven" reads; "C" makes the reader open the item bank. */
function display(item: ReportPaperItem, answer: ReportAnswer | undefined): string | null {
  if (!answer) return null
  if (item.format === 'mcq') {
    if (!answer.choice) return null
    return `${answer.choice}. ${item.options?.[answer.choice] ?? ''}`.trim()
  }
  return answer.numericValue === null ? null : String(answer.numericValue)
}

function correctDisplay(item: ReportPaperItem): string {
  if (item.format === 'mcq' && item.answerKey && CHOICES.includes(item.answerKey)) {
    return `${item.answerKey}. ${item.options?.[item.answerKey] ?? ''}`.trim()
  }
  return item.numericAnswer === null ? '' : String(item.numericAnswer)
}

// ── helpers ──────────────────────────────────────────────────────────────────

function byOffsetThenArrival(a: ReportEvent, b: ReportEvent): number {
  if (a.offsetMs !== null && b.offsetMs !== null) return a.offsetMs - b.offsetMs
  return a.at - b.at
}

/** offsetMs rides in the payload; it must not make two identical devices differ. */
function omitOffset(payload: Record<string, unknown>): Record<string, unknown> {
  const { offsetMs: _offsetMs, ...rest } = payload
  return rest
}

/** Section order for display, so every report reads the same way. */
export const SECTION_ORDER: readonly Subject[] = SUBJECTS
