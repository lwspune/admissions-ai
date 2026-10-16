// Turning bubble fill scores into answers — or refusing to.
//
// Ported from nda-tracker (src/lib/omr/readBubbles.js, 2026-09). THE RULE:
// never guess. A bubble that is neither clearly filled nor clearly empty goes
// to a human with its score attached. A silently misread bubble becomes a wrong
// score on a parent's sheet, which is far worse than a slow manual pass.
//
// Scores are 0..1, "how dark is this bubble" — plain numbers, so the decision
// is tested without an image anywhere near it.

/**
 * Minimum contrast between the empty baseline and the darkest mark before a
 * sheet is treated as having marks at all. Without it an UNFILLED sheet gets
 * its paper noise stretched across the range and every bubble goes to review.
 */
export const MIN_CONTRAST = 0.12

// Fractions of the sheet's own contrast range; between them, review.
const EMPTY_AT = 0.3
const FILL_AT = 0.55

export interface Calibration {
  blank: boolean
  low: number
  high: number
  range: number
  emptyAt: number
  fillAt: number
}

export type BubbleState = 'single' | 'blank' | 'multi' | 'review'

export interface Decision<T extends string = string> {
  q: number
  state: BubbleState
  choice: T | null
  marked: T[]
  review: boolean
  scores: number[]
  unsure?: T[]
}

const quantile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]!
}

/**
 * This sheet's own empty and filled levels: contrast against ITS OWN paper is
 * what lets pencil and biro, a light hand and a dim photo all read. The filled
 * level is the MAXIMUM, not a high quantile — a candidate who answered three
 * questions has 2% of bubbles inked, and a quantile would call the sheet blank.
 */
export function calibrate(scores: number[]): Calibration {
  const sorted = [...scores].sort((a, b) => a - b)
  const low = quantile(sorted, 0.15)
  const high = sorted.length ? sorted[sorted.length - 1]! : 0
  const range = high - low
  if (range < MIN_CONTRAST) return { blank: true, low, high, range, emptyAt: Infinity, fillAt: Infinity }
  return { blank: false, low, high, range, emptyAt: low + range * EMPTY_AT, fillAt: low + range * FILL_AT }
}

/**
 * Classify one row of scores. An unclear bubble is decisive even beside a
 * clear one — an erasure next to a fresh mark — and two clear marks are
 * `multi`, never blank: a double mark grades wrong, not unattempted.
 */
export function decideQuestion<T extends string>(
  row: { q: number; options: readonly T[]; scores: number[] },
  cal: Calibration,
): Decision<T> {
  const { q, options, scores } = row
  if (cal.blank) return { q, state: 'blank', choice: null, marked: [], review: false, scores }
  const marked: T[] = []
  const unsure: T[] = []
  scores.forEach((s, i) => {
    if (s >= cal.fillAt) marked.push(options[i]!)
    else if (s > cal.emptyAt) unsure.push(options[i]!)
  })
  if (unsure.length) return { q, state: 'review', choice: null, marked, review: true, scores, unsure }
  if (marked.length === 1) return { q, state: 'single', choice: marked[0]!, marked, review: false, scores }
  if (marked.length === 0) return { q, state: 'blank', choice: null, marked, review: false, scores }
  return { q, state: 'multi', choice: null, marked, review: true, scores }
}

/** A whole sheet of rows: answers where sure, the rest flagged. */
export function readSheet<T extends string>(
  rows: { q: number; options: readonly T[]; scores: number[] }[],
  { calibration }: { calibration?: Calibration } = {},
) {
  const cal = calibration ?? calibrate(rows.flatMap((r) => r.scores))
  const decisions = rows.map((r) => decideQuestion(r, cal))
  const needsReview = decisions.filter((d) => d.review)
  const answers: Record<number, T | null> = {}
  for (const d of decisions) answers[d.q] = d.choice
  return {
    answers,
    decisions,
    needsReview,
    reviewCount: needsReview.length,
    // A half-read sheet must not be savable as though it were finished.
    complete: needsReview.length === 0,
    calibration: cal,
  }
}
