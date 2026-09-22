import { describe, it, expect } from 'vitest'
import { gradeAttempt, type GradeItem, type GradeAnswer } from './grade'
import type { Subject } from './types'

// ── helpers ──────────────────────────────────────────────────────────────────

function mcq(position: number, subject: Subject, key: 'A' | 'B' | 'C' | 'D' = 'A'): GradeItem {
  return { position, subject, format: 'mcq', answerKey: key, numericAnswer: null, numericTolerance: 0 }
}

function numeric(position: number, subject: Subject, answer: number, tolerance = 0): GradeItem {
  return { position, subject, format: 'numeric', answerKey: null, numericAnswer: answer, numericTolerance: tolerance }
}

/** A realistic paper: 5 per subject, 12 MCQ + 3 numeric, interleaved. */
function standardPaper(): GradeItem[] {
  return [
    mcq(1, 'maths'), numeric(2, 'english', 0), mcq(3, 'science'),
    mcq(4, 'maths'), mcq(5, 'english'), numeric(6, 'science', 18),
    mcq(7, 'maths'), mcq(8, 'english'), mcq(9, 'science'),
    mcq(10, 'maths'), mcq(11, 'english'), mcq(12, 'science'),
    numeric(13, 'maths', 840), mcq(14, 'english'), mcq(15, 'science'),
  ]
}

function answerAll(items: GradeItem[], correct: boolean): GradeAnswer[] {
  return items.map((i) =>
    i.format === 'mcq'
      ? { position: i.position, choice: correct ? i.answerKey! : i.answerKey === 'A' ? 'B' : 'A', numericValue: null }
      : { position: i.position, choice: null, numericValue: correct ? i.numericAnswer! : i.numericAnswer! + 1 },
  )
}

// ── scoring ──────────────────────────────────────────────────────────────────

describe('gradeAttempt — totals', () => {
  it('scores a perfect paper at 15', () => {
    const items = standardPaper()
    const r = gradeAttempt(items, answerAll(items, true))
    expect(r.score).toBe(15)
    expect(r.correct).toBe(15)
    expect(r.incorrect).toBe(0)
    expect(r.skipped).toBe(0)
  })

  it('floors an all-wrong 12-MCQ paper at -3.00, not -1.25', () => {
    // 12 MCQ x -0.25 = -3.00; the 3 numeric items score 0, never negative.
    const items = standardPaper()
    const r = gradeAttempt(items, answerAll(items, false))
    expect(r.score).toBe(-3)
    expect(r.incorrect).toBe(15)
  })

  it('floors an all-MCQ all-wrong paper at -3.75', () => {
    const items = Array.from({ length: 15 }, (_, n) => mcq(n + 1, 'maths'))
    const r = gradeAttempt(items, answerAll(items, false))
    expect(r.score).toBe(-3.75)
  })

  it('scores an untouched paper at 0 with everything skipped', () => {
    const items = standardPaper()
    const r = gradeAttempt(items, [])
    expect(r.score).toBe(0)
    expect(r.skipped).toBe(15)
    expect(r.correct).toBe(0)
    expect(r.incorrect).toBe(0)
  })

  it('treats a null answer as skipped, not wrong', () => {
    const items = [mcq(1, 'maths')]
    const r = gradeAttempt(items, [{ position: 1, choice: null, numericValue: null }])
    expect(r.score).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.incorrect).toBe(0)
  })

  it('mixes correct, wrong and skipped without drift', () => {
    const items = [mcq(1, 'maths'), mcq(2, 'maths'), mcq(3, 'maths'), mcq(4, 'maths')]
    const r = gradeAttempt(items, [
      { position: 1, choice: 'A', numericValue: null }, // correct  +1
      { position: 2, choice: 'B', numericValue: null }, // wrong  -0.25
      { position: 3, choice: 'C', numericValue: null }, // wrong  -0.25
      // 4 skipped                                                    0
    ])
    expect(r.score).toBe(0.5)
    expect(r.correct).toBe(1)
    expect(r.incorrect).toBe(2)
    expect(r.skipped).toBe(1)
  })

  it('does not accumulate floating point error across a full wrong paper', () => {
    const items = Array.from({ length: 15 }, (_, n) => mcq(n + 1, 'maths'))
    const r = gradeAttempt(items, answerAll(items, false))
    expect(Number.isInteger(r.score * 100)).toBe(true)
  })
})

// ── numeric items ────────────────────────────────────────────────────────────

describe('gradeAttempt — numeric items', () => {
  it('marks an exact numeric answer correct', () => {
    const r = gradeAttempt([numeric(1, 'maths', 840)], [{ position: 1, choice: null, numericValue: 840 }])
    expect(r.score).toBe(1)
  })

  it('scores a wrong numeric answer 0, never -0.25', () => {
    const r = gradeAttempt([numeric(1, 'maths', 840)], [{ position: 1, choice: null, numericValue: 920 }])
    expect(r.score).toBe(0)
    expect(r.incorrect).toBe(1) // counted as attempted-and-wrong, but not penalised
  })

  it('accepts an answer exactly on the tolerance boundary', () => {
    const items = [numeric(1, 'science', 18, 0.5)]
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 18.5 }]).score).toBe(1)
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 17.5 }]).score).toBe(1)
  })

  it('rejects an answer just outside the tolerance boundary', () => {
    const items = [numeric(1, 'science', 18, 0.5)]
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 18.51 }]).score).toBe(0)
  })

  it('handles a tolerance of zero as exact equality', () => {
    const items = [numeric(1, 'maths', 30, 0)]
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 30 }]).score).toBe(1)
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 30.0001 }]).score).toBe(0)
  })

  it('is not fooled by floating point representation at the boundary', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754; a naive abs() comparison fails this.
    const items = [numeric(1, 'maths', 0.3, 0)]
    expect(gradeAttempt(items, [{ position: 1, choice: null, numericValue: 0.1 + 0.2 }]).score).toBe(1)
  })
})

// ── sections ─────────────────────────────────────────────────────────────────

describe('gradeAttempt — section scores', () => {
  it('reports each subject separately and they sum to the total', () => {
    const items = standardPaper()
    const r = gradeAttempt(items, answerAll(items, true))
    expect(r.sections.maths).toBe(5)
    expect(r.sections.english).toBe(5)
    expect(r.sections.science).toBe(5)
    expect(r.sections.maths + r.sections.english + r.sections.science).toBe(r.score)
  })

  it('reports zero for a subject with no items rather than omitting it', () => {
    const r = gradeAttempt([mcq(1, 'maths')], [{ position: 1, choice: 'A', numericValue: null }])
    expect(r.sections.english).toBe(0)
    expect(r.sections.science).toBe(0)
  })

  it('isolates a weak section — 5/5/0 is visibly different from 3/3/4', () => {
    const items = standardPaper()
    const answers = answerAll(items, true).map((a) => {
      const item = items.find((i) => i.position === a.position)!
      if (item.subject !== 'science') return a
      return item.format === 'mcq'
        ? { ...a, choice: 'B' as const }
        : { ...a, numericValue: -1 }
    })
    const r = gradeAttempt(items, answers)
    expect(r.sections.maths).toBe(5)
    expect(r.sections.english).toBe(5)
    // 4 wrong MCQ (-1.00) + 1 wrong numeric (0)
    expect(r.sections.science).toBe(-1)
  })
})

// ── malformed input ──────────────────────────────────────────────────────────

describe('gradeAttempt — malformed input', () => {
  it('ignores an answer for a position that is not on the paper', () => {
    const r = gradeAttempt([mcq(1, 'maths')], [
      { position: 1, choice: 'A', numericValue: null },
      { position: 99, choice: 'A', numericValue: null },
    ])
    expect(r.score).toBe(1)
    expect(r.correct).toBe(1)
  })

  it('ignores a numeric value supplied for an MCQ item', () => {
    const r = gradeAttempt([mcq(1, 'maths')], [{ position: 1, choice: null, numericValue: 5 }])
    expect(r.skipped).toBe(1)
    expect(r.score).toBe(0)
  })

  it('ignores a choice supplied for a numeric item', () => {
    const r = gradeAttempt([numeric(1, 'maths', 30)], [{ position: 1, choice: 'A', numericValue: null }])
    expect(r.skipped).toBe(1)
    expect(r.score).toBe(0)
  })

  it('takes the last answer when a position appears twice', () => {
    const r = gradeAttempt([mcq(1, 'maths', 'A')], [
      { position: 1, choice: 'B', numericValue: null },
      { position: 1, choice: 'A', numericValue: null },
    ])
    expect(r.score).toBe(1)
  })

  it('returns a zeroed result for an empty paper rather than throwing', () => {
    const r = gradeAttempt([], [])
    expect(r.score).toBe(0)
    expect(r.sections.maths).toBe(0)
  })
})

// ── per-question detail (drives the report, spec §8) ──────────────────────────

describe('gradeAttempt — per-question verdicts', () => {
  it('returns one verdict per item, in paper order', () => {
    const items = [mcq(1, 'maths'), numeric(2, 'science', 18), mcq(3, 'english')]
    const r = gradeAttempt(items, [
      { position: 1, choice: 'A', numericValue: null },
      { position: 2, choice: null, numericValue: 99 },
    ])
    expect(r.perQuestion.map((q) => q.position)).toEqual([1, 2, 3])
    expect(r.perQuestion.map((q) => q.verdict)).toEqual(['correct', 'incorrect', 'skipped'])
    expect(r.perQuestion.map((q) => q.delta)).toEqual([1, 0, 0])
  })
})
