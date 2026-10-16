import { CHOICES, type Choice, type Format } from './types'
import { fitsAnswerBox } from './omr/layout'
import type { SheetRead, AnswerRead } from './omr/readAnswerSheet'

/** One position of a scanned paper test, as it is saved. */
export interface ScanAnswer {
  position: number
  choice: Choice | null
  numericValue: number | null
  /** Two bubbles in one row, or two digits in one column: graded wrong, never blank. */
  doubleMark: boolean
  /** A person settled it rather than the reader. Shown on the report, unscored. */
  byHand: boolean
}

/** A person's answer to a flagged question. */
export type Outcome =
  | { kind: 'choice'; choice: Choice }
  | { kind: 'number'; value: number }
  | { kind: 'blank' }
  | { kind: 'double' }

function withCounts(answers: AnswerRead[], base: SheetRead): SheetRead {
  const reviewCount = answers.filter((a) => a.review).length
  return { ...base, answers, reviewCount, complete: reviewCount === 0 }
}

/**
 * Settle one question on a read sheet. Returns a new sheet; the old one is
 * untouched, so the review list can be undone by keeping it.
 */
export function resolveAnswer(read: SheetRead, q: number, outcome: Outcome): SheetRead {
  const answers = read.answers.map((a): AnswerRead => {
    if (a.q !== q) return a
    if (a.format === 'mcq') {
      if (outcome.kind === 'number') throw new Error(`Q${q} is multiple-choice: choose a letter, blank or two marks`)
      return {
        ...a,
        state: outcome.kind === 'choice' ? 'single' : outcome.kind === 'double' ? 'multi' : 'blank',
        choice: outcome.kind === 'choice' ? outcome.choice : null,
        doubleMark: outcome.kind === 'double',
        review: false,
        byHand: true,
      }
    }
    if (outcome.kind === 'choice') throw new Error(`Q${q} is numeric: enter the number, blank or two marks`)
    if (outcome.kind === 'number' && !fitsAnswerBox(outcome.value)) {
      throw new Error(`Q${q}: the answer box holds 0 to 9999.99, with at most two decimals`)
    }
    return {
      ...a,
      state: outcome.kind === 'number' ? 'single' : outcome.kind === 'double' ? 'review' : 'blank',
      value: outcome.kind === 'number' ? outcome.value : null,
      doubleMark: outcome.kind === 'double',
      review: false,
      byHand: true,
    }
  })
  return withCounts(answers, read)
}

/** The save, from a sheet with nothing left open. */
export function scanAnswers(read: SheetRead): ScanAnswer[] {
  if (!read.complete) throw new Error(`${read.reviewCount} question(s) still need a decision`)
  return read.answers.map((a) => ({
    position: a.q,
    choice: a.format === 'mcq' ? a.choice : null,
    numericValue: a.format === 'numeric' ? a.value : null,
    doubleMark: Boolean(a.doubleMark),
    byHand: Boolean(a.byHand),
  }))
}

/**
 * The server's check of a scan before anything is written: one answer per
 * position of this paper, each the shape its question takes. Null when good,
 * else what is wrong. The database checks it again (migration 0019).
 */
export function validateScanAnswers(formats: readonly Format[], answers: ScanAnswer[]): string | null {
  if (!Array.isArray(answers)) return 'answers must be a list'
  if (answers.length !== formats.length) return `expected ${formats.length} answers, got ${answers.length}`
  const seen = new Set<number>()
  for (const a of answers) {
    if (!a || !Number.isInteger(a.position) || a.position < 1 || a.position > formats.length) {
      return `position ${a?.position} is not on this paper`
    }
    if (seen.has(a.position)) return `position ${a.position} appears twice`
    seen.add(a.position)
    if (typeof a.doubleMark !== 'boolean' || typeof a.byHand !== 'boolean') return `Q${a.position}: flags must be true or false`
    if (a.doubleMark && (a.choice !== null || a.numericValue !== null)) {
      return `Q${a.position}: a double mark carries no answer`
    }
    if (formats[a.position - 1] === 'mcq') {
      if (a.numericValue !== null) return `Q${a.position} is multiple-choice and cannot take a number`
      if (a.choice !== null && !CHOICES.includes(a.choice)) return `Q${a.position}: ${String(a.choice)} is not A–D`
    } else {
      if (a.choice !== null) return `Q${a.position} is numeric and cannot take a letter`
      if (a.numericValue !== null && !(typeof a.numericValue === 'number' && fitsAnswerBox(a.numericValue))) {
        return `Q${a.position}: ${String(a.numericValue)} does not fit the answer box`
      }
    }
  }
  return null
}
