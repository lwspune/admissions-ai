// Reading a photographed paper-test answer sheet.
//
// Two steps, because the sheet says which paper it is before anyone can know
// where its answers are:
//
//   1. `locateSheet` finds the registration grid, solves where the page sits in
//      the photo, and reads the printed paper code. The frame is the same on
//      every paper (layout.ts), so this needs no paper at all.
//   2. `readAnswers` takes that paper's formats — fetched by its number — and
//      reads every row and numeric box.
//
// The photo can be upside down: the grid is symmetric, so both ways up are
// tried and only the one whose code block reads cleanly is accepted. Both or
// neither reading cleanly is a refusal, never a pick. Everything not clearly
// marked or clearly empty goes to a person (readBubbles.ts).

import { buildAnswerSheetLayout, NUMERIC_PLACES, PAPER_NO_DIGITS, type AnswerSheetLayout } from './layout'
import { detectRegistrationSquares, sampleDarkness, type ImageLike } from './detectSquares'
import { fitLattice, solveHomographyLS, applyH, type H, type Pt } from './gridFit'
import { calibrate, decideQuestion, type Calibration, type Decision } from './readBubbles'
import type { LiveRead } from './liveCapture'
import type { Choice, Format } from '../types'

const CHOICES = ['A', 'B', 'C', 'D'] as const
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** The code bubbles are printed solid, so a real one samples near 1; ink this light is not the printer's. */
const PRINTED_MIN = 0.6

/** The frame every sheet shares; only its registration grid and code block are used here. */
const FRAME = buildAnswerSheetLayout(['mcq'])

export type Located =
  | {
      ok: true
      paperNo: number
      /** The photo was taken upside down. */
      flipped: boolean
      /** Page millimetres -> photo pixels. */
      H: H
      /** The sheet's outline in the photo, for the viewfinder. */
      corners: Pt[]
      squaresFound: number
      mask: Uint8Array
    }
  | { ok: false; reason: string; squaresFound?: number }

export interface McqRead extends Decision<Choice> {
  format: 'mcq'
  /** Set once a person settles it (scanResult.ts): two marks, graded wrong. */
  doubleMark?: boolean
  byHand?: boolean
}

export interface NumericRead {
  q: number
  format: 'numeric'
  /** 'single' is a readable number; 'review' is a column a person must look at. */
  state: 'single' | 'blank' | 'review'
  value: number | null
  review: boolean
  columns: Decision<(typeof DIGITS)[number]>[]
  doubleMark?: boolean
  byHand?: boolean
}

export type AnswerRead = McqRead | NumericRead

export interface SheetRead {
  answers: AnswerRead[]
  reviewCount: number
  complete: boolean
  calibration: Calibration
}

/** The layout's registration squares by grid column and row, as centres in mm. */
function frameGrid(l: AnswerSheetLayout) {
  const xs = [...new Set(l.registration.map((s) => s.x))].sort((a, b) => a - b)
  const ys = [...new Set(l.registration.map((s) => s.y))].sort((a, b) => a - b)
  const half = l.geometry.registrationSize / 2
  return {
    cols: xs.length,
    rows: ys.length,
    at: (i: number, j: number): Pt | null => (i < xs.length && j < ys.length ? { x: xs[i]! + half, y: ys[j]! + half } : null),
  }
}

/** Darkness of a bubble at page (x, y) mm with radius r mm, sampled in the photo. */
function sampler(image: ImageLike, mask: Uint8Array, h: H) {
  return (x: number, y: number, r: number) => {
    const c = applyH(h, x, y)
    const edge = applyH(h, x + r, y)
    return sampleDarkness(mask, image.width, image.height, c.x, c.y, Math.hypot(edge.x - c.x, edge.y - c.y))
  }
}

/** The code block's six digits, or null unless each column has exactly one printed bubble. */
function readCode(sample: (x: number, y: number, r: number) => number): number | null {
  const columns = FRAME.code.columns.map((c) => c.bubbles.map((b) => sample(b.x, b.y, b.r)))
  const cal = calibrate(columns.flat())
  if (cal.blank || cal.high < PRINTED_MIN) return null
  const digits: number[] = []
  for (const [i, scores] of columns.entries()) {
    const d = decideQuestion({ q: i, options: DIGITS, scores }, cal)
    if (d.state !== 'single' || Math.max(...scores) < PRINTED_MIN) return null
    digits.push(Number(d.choice))
  }
  if (digits.length !== PAPER_NO_DIGITS || digits[0] === 0) return null
  return Number(digits.join(''))
}

/** Find the sheet in a photo and read which paper it is. */
export function locateSheet(image: ImageLike): Located {
  const { squares, mask } = detectRegistrationSquares(image)
  if (squares.length < 8) {
    return {
      ok: false,
      reason: `Only ${squares.length} registration marks found — is the whole sheet in frame?`,
      squaresFound: squares.length,
    }
  }
  const fit = fitLattice(squares.map((s) => ({ x: s.cx, y: s.cy })))
  if (!fit) {
    return {
      ok: false,
      reason: 'The registration marks do not form a grid — try a flatter, sharper photo.',
      squaresFound: squares.length,
    }
  }
  const grid = frameGrid(FRAME)
  if (fit.cols !== grid.cols || fit.rows !== grid.rows) {
    return {
      ok: false,
      reason: `This does not look like a whole answer sheet (a ${fit.cols}×${fit.rows} grid, not ${grid.cols}×${grid.rows}). Get the whole page in the frame.`,
      squaresFound: squares.length,
    }
  }

  // Both ways up: the grid alone cannot say which is the top.
  const readings = [false, true].flatMap((flipped) => {
    const src: Pt[] = []
    const dst: Pt[] = []
    fit.indices.forEach((ix, k) => {
      if (!ix) return
      const mm = flipped ? grid.at(grid.cols - 1 - ix.i, grid.rows - 1 - ix.j) : grid.at(ix.i, ix.j)
      if (!mm) return
      src.push(mm)
      dst.push({ x: squares[k]!.cx, y: squares[k]!.cy })
    })
    const h = solveHomographyLS(src, dst)
    if (!h) return []
    const paperNo = readCode(sampler(image, mask, h))
    return paperNo == null ? [] : [{ flipped, h, paperNo }]
  })

  if (readings.length !== 1) {
    return {
      ok: false,
      reason:
        readings.length === 0
          ? 'The paper number could not be read. Keep the whole sheet in frame, flat and in good light.'
          : 'The sheet reads both ways up, so it cannot be trusted. Photograph it again.',
      squaresFound: squares.length,
    }
  }

  const { flipped, h, paperNo } = readings[0]!
  const size = FRAME.geometry.registrationSize
  const x0 = Math.min(...FRAME.registration.map((s) => s.x))
  const x1 = Math.max(...FRAME.registration.map((s) => s.x)) + size
  const y0 = Math.min(...FRAME.registration.map((s) => s.y))
  const y1 = Math.max(...FRAME.registration.map((s) => s.y)) + size
  const corners = (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as const
  ).map(([mx, my]) => applyH(h, mx, my))

  return { ok: true, paperNo, flipped, H: h, corners, squaresFound: squares.length, mask }
}

/** Hundredths, so 3 + 0.2 + 0.05 is exactly 3.25. */
const PLACE_HUNDREDTHS = NUMERIC_PLACES.map((p) => Math.round(p * 100))

/** Read every answer on a located sheet, given its paper's formats in position order. */
export function readAnswers(image: ImageLike, located: Extract<Located, { ok: true }>, formats: readonly Format[]): SheetRead {
  const l = buildAnswerSheetLayout(formats)
  const sample = sampler(image, located.mask, located.H)

  const mcqRows = l.questions
    .filter((q) => q.format === 'mcq')
    .map((q) => ({ q: q.q, scores: q.options.map((o) => sample(o.x, o.y, o.r)) }))
  const boxes = l.numeric.map((box) => ({
    q: box.q,
    columns: box.columns.map((c) => c.bubbles.map((b) => sample(b.x, b.y, b.r))),
  }))

  // One calibration over every answer bubble: the same pen on the same paper.
  // Not the code block — its printed fills would set the bar above any pencil.
  const cal = calibrate([...mcqRows.flatMap((r) => r.scores), ...boxes.flatMap((b) => b.columns.flat())])

  const byQ = new Map<number, AnswerRead>()
  for (const r of mcqRows) {
    byQ.set(r.q, { ...decideQuestion({ q: r.q, options: CHOICES, scores: r.scores }, cal), format: 'mcq' })
  }
  for (const b of boxes) {
    const columns = b.columns.map((scores, i) => decideQuestion({ q: i, options: DIGITS, scores }, cal))
    const unclear = columns.some((c) => c.state === 'review' || c.state === 'multi')
    const written = columns.filter((c) => c.state === 'single')
    let read: NumericRead
    if (unclear) read = { q: b.q, format: 'numeric', state: 'review', value: null, review: true, columns }
    else if (written.length === 0) read = { q: b.q, format: 'numeric', state: 'blank', value: null, review: false, columns }
    else {
      // A blank column is a zero in that place; "0" is written in the units column.
      const hundredths = columns.reduce(
        (sum, c, i) => sum + (c.state === 'single' ? Number(c.choice) * PLACE_HUNDREDTHS[i]! : 0),
        0,
      )
      read = { q: b.q, format: 'numeric', state: 'single', value: hundredths / 100, review: false, columns }
    }
    byQ.set(b.q, read)
  }

  const answers = l.questions.map((q) => byQ.get(q.q)!)
  const reviewCount = answers.filter((a) => a.review).length
  return { answers, reviewCount, complete: reviewCount === 0, calibration: cal }
}

/** What the live scanner compares frame to frame. */
export function toLiveRead(located: Extract<Located, { ok: true }>, read: SheetRead): LiveRead {
  return {
    ok: true,
    paperNo: located.paperNo,
    complete: read.complete,
    reviewCount: read.reviewCount,
    answers: Object.fromEntries(
      read.answers.map((a) => [a.q, a.format === 'mcq' ? a.choice : a.value] as const),
    ),
  }
}
