import { describe, it, expect } from 'vitest'
import {
  buildReport,
  toParentReport,
  displayName,
  type ReportInput,
  type ReportPaperItem,
  type ReportEvent,
} from './report'
import { limitMsFor, type Subject, type Part } from './types'

const LIMIT_MS = limitMsFor(15)

const MIN = 60_000

function mcq(position: number, subject: Subject, key: 'A' | 'B' | 'C' | 'D' = 'B', part: Part = 'basics'): ReportPaperItem {
  return {
    position,
    subject,
    part,
    skill: 'number-series',
    difficulty: 'easy',
    format: 'mcq',
    stem: `Question ${position}`,
    options: { A: 'thirty six', B: 'thirty eight', C: 'thirty seven', D: 'forty' },
    answerKey: key,
    numericAnswer: null,
    numericTolerance: 0,
  }
}

function numeric(position: number, subject: Subject, answer = 840): ReportPaperItem {
  return {
    ...mcq(position, subject),
    format: 'numeric',
    options: null,
    answerKey: null,
    numericAnswer: answer,
    numericTolerance: 0,
  }
}

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    paper: [mcq(1, 'maths'), numeric(2, 'english'), mcq(3, 'science')],
    answers: [],
    events: [],
    activeMs: 5 * MIN,
    limitMs: LIMIT_MS,
    ...over,
  }
}

const ev = (kind: string, offsetMs: number | null, position: number | null = null, payload = {}): ReportEvent => ({
  kind,
  position,
  at: 0,
  offsetMs,
  payload,
})

// ── the five facts (spec §7) ─────────────────────────────────────────────────

describe('buildReport — integrity facts', () => {
  it('reports no pauses on a clean attempt', () => {
    const { facts } = buildReport(input())
    expect(facts.pauseCount).toBe(0)
    expect(facts.pauseTotalMs).toBe(0)
    expect(facts.changedAfterPause).toEqual([])
    expect(facts.pasteCount).toBe(0)
    expect(facts.deviceChanged).toBe(false)
  })

  it('counts pauses and totals their duration from the relative offsets', () => {
    const { facts } = buildReport(
      input({
        events: [
          ev('pause', 60_000, 1),
          ev('resume', 240_000, 1),
          ev('pause', 300_000, 2),
          ev('resume', 330_000, 2),
        ],
      }),
    )
    expect(facts.pauseCount).toBe(2)
    expect(facts.pauseTotalMs).toBe(210_000) // 180s + 30s
  })

  it('handles an unpaired pause — the tab was closed and never reopened', () => {
    const { facts } = buildReport(input({ events: [ev('pause', 60_000, 1)] }))
    expect(facts.pauseCount).toBe(1)
    // No resume means no measurable duration; it must not guess one.
    expect(facts.pauseTotalMs).toBe(0)
  })

  it('lists the positions whose answer changed after a pause — the key signal', () => {
    const { facts } = buildReport(
      input({
        answers: [
          { position: 1, choice: 'B', numericValue: null, activeMs: 1000, changeCount: 1, changedAfterPause: true },
          { position: 3, choice: 'A', numericValue: null, activeMs: 1000, changeCount: 2, changedAfterPause: false },
        ],
      }),
    )
    expect(facts.changedAfterPause).toEqual([1])
  })

  it('counts paste events', () => {
    const { facts } = buildReport(input({ events: [ev('paste', 1000, 1), ev('paste', 2000, 2)] }))
    expect(facts.pasteCount).toBe(2)
  })

  it('flags a device change when two different contexts are reported', () => {
    const { facts } = buildReport(
      input({
        events: [
          ev('context', 0, null, { ua: 'Chrome/Android', screen: '390x844' }),
          ev('context', 90_000, null, { ua: 'Chrome/Windows', screen: '1920x1080' }),
        ],
      }),
    )
    expect(facts.deviceChanged).toBe(true)
  })

  it('does not flag a device change when the same context is re-reported', () => {
    const same = { ua: 'Chrome/Android', screen: '390x844' }
    const { facts } = buildReport(input({ events: [ev('context', 0, null, same), ev('context', 90_000, null, same)] }))
    expect(facts.deviceChanged).toBe(false)
  })

  it('reports time used against time available', () => {
    const { facts } = buildReport(input({ activeMs: 7 * MIN }))
    expect(facts.timeUsedMs).toBe(7 * MIN)
    expect(facts.timeAvailableMs).toBe(LIMIT_MS)
  })

  it('never reports a fact as certain when the telemetry is missing', () => {
    // Absent events must read as "nothing seen", never as "nothing happened".
    const { facts } = buildReport(input({ events: [] }))
    expect(facts.telemetrySeen).toBe(false)

    const { facts: seen } = buildReport(input({ events: [ev('nav', 1000, 2)] }))
    expect(seen.telemetrySeen).toBe(true)
  })
})

// ── per-question detail ──────────────────────────────────────────────────────

describe('buildReport — questions', () => {
  it('returns one row per paper position, in order', () => {
    const { questions } = buildReport(input())
    expect(questions.map((q) => q.position)).toEqual([1, 2, 3])
  })

  it('shows the option text the candidate chose, not just the letter', () => {
    const { questions } = buildReport(
      input({
        answers: [{ position: 1, choice: 'C', numericValue: null, activeMs: 1000, changeCount: 0, changedAfterPause: false }],
      }),
    )
    expect(questions[0]!.givenDisplay).toBe('C. thirty seven')
    expect(questions[0]!.correctDisplay).toBe('B. thirty eight')
    expect(questions[0]!.verdict).toBe('incorrect')
  })

  it('shows a numeric answer as typed, against the expected value', () => {
    const { questions } = buildReport(
      input({
        answers: [{ position: 2, choice: null, numericValue: 920, activeMs: 1000, changeCount: 0, changedAfterPause: false }],
      }),
    )
    expect(questions[1]!.givenDisplay).toBe('920')
    expect(questions[1]!.correctDisplay).toBe('840')
    expect(questions[1]!.verdict).toBe('incorrect')
  })

  it('marks an unanswered question skipped with no given value', () => {
    const { questions } = buildReport(input())
    expect(questions[0]!.verdict).toBe('skipped')
    expect(questions[0]!.givenDisplay).toBeNull()
    expect(questions[0]!.delta).toBe(0)
  })

  it('takes dwell from the answer row when the question was answered', () => {
    const { questions } = buildReport(
      input({
        answers: [{ position: 1, choice: 'B', numericValue: null, activeMs: 51_454, changeCount: 0, changedAfterPause: false }],
      }),
    )
    expect(questions[0]!.dwellMs).toBe(51_454)
    expect(questions[0]!.dwellSource).toBe('answer')
  })
})

// ── the flush-clustering fix ─────────────────────────────────────────────────

describe('buildReport — dwell for SKIPPED questions', () => {
  it('derives dwell from nav offsets when there is no answer row', () => {
    // Arrived at Q2 at 10s, left for Q3 at 25s => 15s on Q2, despite both
    // events arriving in the same 5-second flush.
    const { questions } = buildReport(
      input({
        events: [ev('nav', 10_000, 2, { from: 1 }), ev('nav', 25_000, 3, { from: 2 })],
      }),
    )
    expect(questions[1]!.dwellMs).toBe(15_000)
    expect(questions[1]!.dwellSource).toBe('nav')
  })

  it('uses the final active time for the last question visited', () => {
    const { questions } = buildReport(
      input({ activeMs: 40_000, events: [ev('nav', 10_000, 3, { from: 1 })] }),
    )
    expect(questions[2]!.dwellMs).toBe(30_000)
  })

  it('reports unknown dwell rather than zero when offsets are absent', () => {
    // Events predating the offsetMs change carry null. Zero would read as
    // "answered instantly", which is a fraud signal — exactly the wrong claim.
    const { questions } = buildReport(input({ events: [ev('nav', null, 2, { from: 1 })] }))
    expect(questions[1]!.dwellMs).toBeNull()
    expect(questions[1]!.dwellSource).toBeNull()
  })

  it('never derives a negative dwell from out-of-order events', () => {
    const { questions } = buildReport(
      input({ events: [ev('nav', 25_000, 2, { from: 1 }), ev('nav', 10_000, 3, { from: 2 })] }),
    )
    for (const q of questions) expect(q.dwellMs === null || q.dwellMs >= 0).toBe(true)
  })
})

// ── totals ───────────────────────────────────────────────────────────────────

describe('buildReport — totals', () => {
  it('scores and splits by section', () => {
    const { totals } = buildReport(
      input({
        paper: [mcq(1, 'maths'), mcq(2, 'english'), mcq(3, 'science')],
        answers: [
          { position: 1, choice: 'B', numericValue: null, activeMs: 0, changeCount: 0, changedAfterPause: false },
          { position: 2, choice: 'A', numericValue: null, activeMs: 0, changeCount: 0, changedAfterPause: false },
        ],
      }),
    )
    expect(totals.score).toBe(0.75) // +1, -0.25, skipped
    expect(totals.correct).toBe(1)
    expect(totals.sections.maths).toBe(1)
    expect(totals.sections.english).toBe(-0.25)
    expect(totals.sections.science).toBe(0)
  })

  it('reports the maximum so a score is readable without knowing the paper', () => {
    expect(buildReport(input()).totals.outOf).toBe(3)
  })
})

// ── the parent report ────────────────────────────────────────────────────────

describe('toParentReport', () => {
  const answer = (position: number, choice: 'A' | 'B' | 'C' | 'D' | null, numericValue: number | null = null) => ({
    position,
    choice,
    numericValue,
    activeMs: 30_000,
    changeCount: 2,
    changedAfterPause: true,
  })

  // Maths: right, wrong MCQ. English: wrong numeric, skipped. Science: right.
  const built = buildReport(
    input({
      paper: [mcq(1, 'maths'), mcq(2, 'maths'), numeric(3, 'english'), mcq(4, 'english'), mcq(5, 'science')],
      answers: [answer(1, 'B'), answer(2, 'C'), answer(3, null, 12), answer(5, 'B')],
      events: [ev('pause', 60_000, 2), ev('resume', 90_000, 2), ev('paste', 95_000, 2)],
      activeMs: 11 * MIN,
    }),
  )
  const parent = toParentReport({ name: 'ananya shah', submittedAt: '2026-10-06T10:18:11Z', report: built })

  it('carries the total and its counts', () => {
    expect(parent.total).toEqual({ score: 1.75, outOf: 5, correct: 2, wrong: 2, notAttempted: 1 })
  })

  it('splits the same counts by subject, in section order', () => {
    expect(parent.subjects).toEqual([
      { subject: 'maths', score: 0.75, outOf: 2, correct: 1, wrong: 1, notAttempted: 0 },
      { subject: 'english', score: 0, outOf: 2, correct: 0, wrong: 1, notAttempted: 1 },
      { subject: 'science', score: 1, outOf: 1, correct: 1, wrong: 0, notAttempted: 0 },
    ])
  })

  it('carries the name, the date and the time used', () => {
    expect(parent.name).toBe('Ananya Shah')
    expect(parent.testDate).toBe('2026-10-06T10:18:11Z')
    expect(parent.timeUsedMs).toBe(11 * MIN)
    expect(parent.timeAvailableMs).toBe(LIMIT_MS)
  })

  it('never reports more time used than was available', () => {
    const over = buildReport(input({ activeMs: LIMIT_MS + 4_000 }))
    expect(toParentReport({ name: 'A', submittedAt: '', report: over }).timeUsedMs).toBe(LIMIT_MS)
  })

  // An allow-list, checked on the bytes: the sheet leaves the institute.
  it('carries no question, answer, skill or integrity fact', () => {
    const bytes = JSON.stringify(parent)
    for (const leak of [
      'Question 1',
      'thirty',
      'number-series',
      'easy',
      'B.',
      '840',
      'pause',
      'paste',
      'changed',
      'dwell',
      'device',
      'telemetry',
      'position',
      'verdict',
    ]) {
      expect(bytes).not.toContain(leak)
    }
  })
})

describe('displayName', () => {
  it('capitalises each word as typed by staff', () => {
    expect(displayName('ananya shah')).toBe('Ananya Shah')
    expect(displayName('  ananya   shah ')).toBe('Ananya Shah')
  })

  it('leaves capitals that are already there', () => {
    expect(displayName('Riya McKenzie')).toBe('Riya McKenzie')
  })
})

// ── the two parts of a 30-question paper (2026-10-06) ────────────────────────

describe('buildReport — parts', () => {
  const answer = (position: number, choice: 'A' | 'B' | 'C' | 'D') => ({
    position, choice, numericValue: null, activeMs: 20_000, changeCount: 0, changedAfterPause: false,
  })

  // Maths basics right; maths syllabus one right, one wrong; science syllabus skipped.
  const built = buildReport(
    input({
      paper: [
        mcq(1, 'maths'),
        mcq(2, 'maths', 'B', 'syllabus'),
        mcq(3, 'maths', 'B', 'syllabus'),
        mcq(4, 'english'),
        mcq(5, 'science', 'B', 'syllabus'),
      ],
      answers: [answer(1, 'B'), answer(2, 'B'), answer(3, 'A')],
    }),
  )

  it('labels each question with its part', () => {
    expect(built.questions.map((q) => q.part)).toEqual(['basics', 'syllabus', 'syllabus', 'basics', 'syllabus'])
  })

  it('totals each subject by part, for the parts the paper holds', () => {
    expect(built.totals.parts).toEqual([
      { subject: 'maths', part: 'basics', score: 1, outOf: 1 },
      { subject: 'maths', part: 'syllabus', score: 0.75, outOf: 2 },
      { subject: 'english', part: 'basics', score: 0, outOf: 1 },
      { subject: 'science', part: 'syllabus', score: 0, outOf: 1 },
    ])
  })

  it('a 15-question paper totals as basics only', () => {
    const plain = buildReport(input())
    expect(plain.totals.parts.every((p) => p.part === 'basics')).toBe(true)
  })
})

describe('toParentReport — parts', () => {
  const answer = (position: number, choice: 'A' | 'B' | 'C' | 'D') => ({
    position, choice, numericValue: null, activeMs: 20_000, changeCount: 0, changedAfterPause: false,
  })

  it('splits a subject into basics and its class syllabus when the paper has both', () => {
    const built = buildReport(
      input({
        paper: [mcq(1, 'maths'), mcq(2, 'maths', 'B', 'syllabus'), mcq(3, 'english'), mcq(4, 'science', 'B', 'syllabus')],
        answers: [answer(1, 'B'), answer(2, 'C')],
      }),
    )
    const parent = toParentReport({ name: 'a', submittedAt: '', report: built, syllabusClass: 9 })
    expect(parent.syllabusClass).toBe(9)
    expect(parent.subjects[0]!.parts).toEqual([
      { part: 'basics', score: 1, outOf: 1, correct: 1, wrong: 0, notAttempted: 0 },
      { part: 'syllabus', score: -0.25, outOf: 1, correct: 0, wrong: 1, notAttempted: 0 },
    ])
    // English has no syllabus part, so it is not split.
    expect(parent.subjects[1]!.parts).toBeUndefined()
  })

  it('leaves a 15-question sheet exactly as it was: no parts, no class', () => {
    const parent = toParentReport({ name: 'a', submittedAt: '', report: buildReport(input()), syllabusClass: 9 })
    expect('syllabusClass' in parent).toBe(false)
    expect(parent.subjects.some((s) => 'parts' in s)).toBe(false)
  })
})
