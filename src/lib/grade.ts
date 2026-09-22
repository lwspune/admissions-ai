import {
  SUBJECTS,
  MARK_CORRECT,
  MARK_WRONG_MCQ,
  MARK_WRONG_NUMERIC,
  MARK_SKIPPED,
  type Subject,
  type Choice,
  type Format,
} from './types'

export interface GradeItem {
  position: number
  subject: Subject
  format: Format
  answerKey: Choice | null
  numericAnswer: number | null
  numericTolerance: number
}

export interface GradeAnswer {
  position: number
  choice: Choice | null
  numericValue: number | null
}

export type Verdict = 'correct' | 'incorrect' | 'skipped'

export interface GradeResult {
  score: number
  correct: number
  incorrect: number
  skipped: number
  sections: Record<Subject, number>
  perQuestion: { position: number; verdict: Verdict; delta: number }[]
}

/**
 * Marks are whole hundredths, so the running totals are kept as integers and
 * divided once at the end. Summing -0.25 fifteen times in floating point drifts,
 * and a score that renders as -3.7500000000000004 in a report is indefensible.
 */
const HUNDREDTHS = 100
const toHundredths = (mark: number) => Math.round(mark * HUNDREDTHS)

/**
 * Numeric answers need a floating-point cushion even at tolerance 0: a candidate
 * typing an expression that evaluates to 0.1 + 0.2 must not be marked wrong
 * against a stored key of 0.3. The cushion scales with magnitude so it stays
 * negligible against a real tolerance.
 */
function numericMatches(given: number, answer: number, tolerance: number): boolean {
  const cushion = 1e-9 * Math.max(1, Math.abs(answer))
  return Math.abs(given - answer) <= tolerance + cushion
}

function emptySections(): Record<Subject, number> {
  return SUBJECTS.reduce(
    (acc, subject) => ({ ...acc, [subject]: 0 }),
    {} as Record<Subject, number>,
  )
}

/**
 * Grades one attempt. Pure: no clock, no database, no IO.
 *
 * Marking (spec §6): +1 correct · -0.25 wrong MCQ · 0 wrong numeric · 0 skipped.
 * A wrong numeric answer is never penalised — there is nothing to guess at, so
 * penalising it would only discourage attempts on the ungoogleable questions.
 *
 * Deliberately computes no pass/fail: the cut-off is a human decision made
 * outside this system.
 */
export function gradeAttempt(items: GradeItem[], answers: GradeAnswer[]): GradeResult {
  // Last answer wins — a resumed attempt may replay an earlier save.
  const byPosition = new Map<number, GradeAnswer>()
  for (const answer of answers) byPosition.set(answer.position, answer)

  const sectionHundredths = emptySections()
  const perQuestion: GradeResult['perQuestion'] = []
  let totalHundredths = 0
  let correct = 0
  let incorrect = 0
  let skipped = 0

  for (const item of items) {
    const answer = byPosition.get(item.position)
    const verdict = verdictFor(item, answer)

    const mark =
      verdict === 'correct'
        ? MARK_CORRECT
        : verdict === 'skipped'
          ? MARK_SKIPPED
          : item.format === 'mcq'
            ? MARK_WRONG_MCQ
            : MARK_WRONG_NUMERIC

    const delta = toHundredths(mark)
    totalHundredths += delta
    sectionHundredths[item.subject] += delta

    if (verdict === 'correct') correct++
    else if (verdict === 'incorrect') incorrect++
    else skipped++

    perQuestion.push({ position: item.position, verdict, delta: delta / HUNDREDTHS })
  }

  const sections = emptySections()
  for (const subject of SUBJECTS) sections[subject] = sectionHundredths[subject] / HUNDREDTHS

  return {
    score: totalHundredths / HUNDREDTHS,
    correct,
    incorrect,
    skipped,
    sections,
    perQuestion,
  }
}

/**
 * An answer of the wrong shape for its item counts as skipped, not wrong. The
 * database constrains the shape, so a mismatch here means corrupt or replayed
 * data — and guessing that a stray numeric value was "meant" to be an MCQ
 * choice would invent an answer the candidate never gave.
 */
function verdictFor(item: GradeItem, answer: GradeAnswer | undefined): Verdict {
  if (!answer) return 'skipped'

  if (item.format === 'mcq') {
    if (answer.choice == null) return 'skipped'
    return answer.choice === item.answerKey ? 'correct' : 'incorrect'
  }

  if (answer.numericValue == null || !Number.isFinite(answer.numericValue)) return 'skipped'
  if (item.numericAnswer == null) return 'skipped'
  return numericMatches(answer.numericValue, item.numericAnswer, item.numericTolerance)
    ? 'correct'
    : 'incorrect'
}
