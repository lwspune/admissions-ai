import { describe, it, expect } from 'vitest'
import { buildReport, type ReportInput, type ReportPaperItem, type ReportEvent } from './report'
import { LIMIT_MS, type Subject } from './types'

const MIN = 60_000

function mcq(position: number, subject: Subject, key: 'A' | 'B' | 'C' | 'D' = 'B'): ReportPaperItem {
  return {
    position,
    subject,
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
