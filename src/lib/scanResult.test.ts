import { describe, it, expect } from 'vitest'
import { resolveAnswer, scanAnswers, validateScanAnswers, type ScanAnswer } from './scanResult'
import type { SheetRead, McqRead, NumericRead } from './omr/readAnswerSheet'
import type { Format } from './types'

// What happens between reading a sheet and saving it. The reader refuses to
// guess, so every refusal needs an answer a person can give, and the save is
// built only from a sheet with nothing left open. The server checks the same
// shape again, because the browser is not the boundary.

const mcq = (q: number, o: Partial<McqRead> = {}): McqRead => ({
  q,
  format: 'mcq',
  state: 'single',
  choice: 'A',
  marked: ['A'],
  review: false,
  scores: [0.9, 0, 0, 0],
  ...o,
})
const num = (q: number, o: Partial<NumericRead> = {}): NumericRead => ({
  q,
  format: 'numeric',
  state: 'single',
  value: 25,
  review: false,
  columns: [],
  ...o,
})
const sheet = (answers: (McqRead | NumericRead)[]): SheetRead => {
  const reviewCount = answers.filter((a) => a.review).length
  return {
    answers,
    reviewCount,
    complete: reviewCount === 0,
    calibration: { blank: false, low: 0, high: 1, range: 1, emptyAt: 0.3, fillAt: 0.55 },
  }
}

describe('resolveAnswer', () => {
  const open = sheet([
    mcq(1),
    mcq(2, { state: 'multi', choice: null, marked: ['A', 'C'], review: true }),
    num(3, { state: 'review', value: null, review: true }),
  ])

  it('settles a flagged question and says a person decided it', () => {
    const r = resolveAnswer(open, 2, { kind: 'choice', choice: 'C' })
    const a = r.answers.find((x) => x.q === 2)!
    expect(a.review).toBe(false)
    expect(a.byHand).toBe(true)
    expect(r.reviewCount).toBe(1)
    expect(r.complete).toBe(false)
  })

  it('is complete only once every flag is settled', () => {
    const r = resolveAnswer(resolveAnswer(open, 2, { kind: 'double' }), 3, { kind: 'number', value: 12.5 })
    expect(r.complete).toBe(true)
  })

  it('refuses an outcome that does not fit the question', () => {
    expect(() => resolveAnswer(open, 2, { kind: 'number', value: 3 })).toThrow(/multiple-choice/)
    expect(() => resolveAnswer(open, 3, { kind: 'choice', choice: 'A' })).toThrow(/numeric/)
    expect(() => resolveAnswer(open, 3, { kind: 'number', value: 12345 })).toThrow(/0 to 9999.99/)
  })

  it('does not change the sheet it was given', () => {
    resolveAnswer(open, 2, { kind: 'blank' })
    expect(open.answers[1]!.review).toBe(true)
  })
})

describe('scanAnswers', () => {
  it('turns a settled sheet into one answer per position', () => {
    const settled = resolveAnswer(
      resolveAnswer(
        sheet([
          mcq(1, { choice: 'B' }),
          mcq(2, { state: 'multi', choice: null, marked: ['A', 'C'], review: true }),
          num(3, { value: 3.25 }),
          mcq(4, { state: 'blank', choice: null, marked: [] }),
          num(5, { state: 'review', value: null, review: true }),
        ]),
        2,
        { kind: 'double' },
      ),
      5,
      { kind: 'blank' },
    )
    expect(scanAnswers(settled)).toEqual<ScanAnswer[]>([
      { position: 1, choice: 'B', numericValue: null, doubleMark: false, byHand: false },
      { position: 2, choice: null, numericValue: null, doubleMark: true, byHand: true },
      { position: 3, choice: null, numericValue: 3.25, doubleMark: false, byHand: false },
      { position: 4, choice: null, numericValue: null, doubleMark: false, byHand: false },
      { position: 5, choice: null, numericValue: null, doubleMark: false, byHand: true },
    ])
  })

  it('refuses a sheet with anything still open', () => {
    expect(() => scanAnswers(sheet([mcq(1, { state: 'review', choice: null, review: true })]))).toThrow(/still/)
  })
})

describe('validateScanAnswers', () => {
  const formats: Format[] = ['mcq', 'numeric', 'mcq']
  const good: ScanAnswer[] = [
    { position: 1, choice: 'A', numericValue: null, doubleMark: false, byHand: false },
    { position: 2, choice: null, numericValue: 7.5, doubleMark: false, byHand: false },
    { position: 3, choice: null, numericValue: null, doubleMark: true, byHand: true },
  ]

  it('accepts one well-shaped answer per position', () => {
    expect(validateScanAnswers(formats, good)).toBeNull()
  })

  it.each([
    ['a missing position', good.slice(0, 2)],
    ['a repeated position', [...good, good[0]!]],
    ['a position off the paper', [...good.slice(0, 2), { ...good[2]!, position: 4 }]],
    ['a letter on a numeric question', [good[0]!, { ...good[1]!, choice: 'B' as const, numericValue: null }, good[2]!]],
    ['a number on a multiple-choice question', [{ ...good[0]!, choice: null, numericValue: 3 }, good[1]!, good[2]!]],
    ['a letter that is not A–D', [{ ...good[0]!, choice: 'E' as never }, good[1]!, good[2]!]],
    ['a number the sheet cannot hold', [good[0]!, { ...good[1]!, numericValue: -1 }, good[2]!]],
    ['a double mark that also carries an answer', [good[0]!, good[1]!, { ...good[2]!, choice: 'A' as const }]],
    ['not a list at all', 'nope' as never],
  ])('refuses %s', (_label, answers) => {
    expect(validateScanAnswers(formats, answers as ScanAnswer[])).toMatch(/./)
  })
})
