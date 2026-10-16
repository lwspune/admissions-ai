// The answer sheet for a paper test — pure, deterministic, in millimetres.
//
// THIS MODULE IS THE CONTRACT BETWEEN THE PRINTED SHEET AND THE SCANNER. The
// PDF renderer draws from it and the reader samples bubbles from it; if the two
// ever computed geometry apart they would drift, and a drifted reader misreads
// answers silently rather than failing. Ported from nda-tracker's OMR layout
// (2026-09), whose ratios were measured off Evalbee sheets that real phones
// read: pitch = 1.5 × bubble, registration squares the size of a bubble, a grid
// of squares rather than four corners.
//
// What differs, and why:
//
//   • ONE FIXED FRAME FOR EVERY PAPER. nda-tracker's sheet is generic and sizes
//     its bubbles to the question count. Here every sheet belongs to one paper,
//     and the scanner has to read that paper's code before it knows anything
//     else about it — so the registration grid, the code block and every slot
//     sit in the same place on every sheet. A paper only changes which rows get
//     A–D bubbles and which numeric slots are drawn.
//   • NUMERIC ANSWERS. A paper carries numeric questions (about 5 of 30, up to
//     15 seen in simulated draws), which an A–D grid cannot hold. Each gets a
//     box: four digits before a printed point and two after, one column of 0–9
//     bubbles per place. 18 slots fit at a 2.5 mm bubble; `issue_assessment`
//     refuses a paper test with more numeric questions than that.
//   • THE CODE IS PRINTED, NOT BUBBLED BY THE CANDIDATE. The sheet is made for
//     one paper, so its six-digit number is printed with its bubbles already
//     filled, and nobody can mis-bubble it.

import type { Format } from '../types'

export const LAYOUT_VERSION = 'p1'
export const A4 = { width: 210, height: 297 } as const

/** 2.5 mm: the largest bubble at which 30 rows and 18 numeric boxes fit one A4 page. */
export const BUBBLE_MM = 2.5
export const MAX_QUESTIONS = 30
export const NUMERIC_SLOTS = 18
export const PAPER_NO_DIGITS = 6
/** Each numeric box column, by place value. The point is printed between 1 and 0.1. */
export const NUMERIC_PLACES = [1000, 100, 10, 1, 0.1, 0.01] as const

const OPTIONS = ['A', 'B', 'C', 'D'] as const
const PITCH = BUBBLE_MM * 1.5
const R = BUBBLE_MM / 2
const REG = BUBBLE_MM
const MARGIN = 8
const GUTTER = 2
const GROUP_SIZE = 5
const REG_ROW_TARGET = 25
const BAND_GAP = 4
const NUMERIC_ROW_GAP = 3
const PER_HALF = 3
const LABEL_H = 4
const WRITE_H = 5
const BOX_GAP = 1.5
const DOT_GAP = PITCH / 2

const PT_PER_MM = 72 / 25.4
/** Type sizes in points. Fixed, because the bubble is. */
export const FONTS = { number: 6.5, option: 5.5, digit: 5, header: 9, small: 6.5, stamp: 5 } as const

/** Height of a line of type, in mm. */
export const fontHeightMm = (pt: number) => pt / PT_PER_MM
/** Helvetica digits are 0.556 em wide; a conservative width for `text` at `pt`. */
export const textWidthMm = (text: string, pt: number) => text.length * 0.556 * fontHeightMm(pt)

const round = (n: number) => Math.round(n * 1000) / 1000

export interface Point {
  x: number
  y: number
}
export interface Rect extends Point {
  width: number
  height: number
}
export interface DigitBubble extends Point {
  value: number
  r: number
}
export interface DigitColumn {
  writeBox: Rect
  bubbles: DigitBubble[]
}
export interface OptionBubble extends Point {
  label: (typeof OPTIONS)[number]
  r: number
}
export interface QuestionRow {
  q: number
  format: Format
  /** Start of the question number's text, measured so the number ends clear of the bubbles. */
  numberAnchor: Point
  /** A–D on a multiple-choice row; empty on a numeric one. */
  options: OptionBubble[]
  /** "A B C D" above the first row of each group of five. */
  groupHeader: { labels: readonly string[]; anchors: Point[] } | null
  /** Where "→ box" is written on a numeric row; null on a multiple-choice one. */
  pointer: Point | null
}
export interface NumericBox {
  q: number
  slot: number
  label: Point
  columns: (DigitColumn & { place: (typeof NUMERIC_PLACES)[number] })[]
  /** The printed decimal point, between the units and tenths write boxes. */
  dot: Point
  digitLabels: (Point & { value: number })[]
}
export interface Square extends Point {
  size: number
}
export interface AnswerSheetLayout {
  unit: 'mm'
  version: string
  page: { width: number; height: number }
  geometry: { bubbleDiameter: number; bubbleRadius: number; pitch: number; registrationSize: number }
  header: { box: Rect; lines: Point[]; stampEnd: Point; stampMaxWidth: number }
  instructions: Rect
  code: { label: Point; columns: DigitColumn[]; digitLabels: (Point & { value: number })[] }
  questions: QuestionRow[]
  numeric: NumericBox[]
  registration: Square[]
  anchors: (Square & { corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' })[]
  grid: { cols: number; rows: number }
}

/** Whether a numeric answer can be bubbled: 0 to 9999.99, at most two decimals. */
export function fitsAnswerBox(value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value >= 10_000) return false
  const hundredths = value * 100
  return Math.abs(hundredths - Math.round(hundredths)) < 1e-6
}

/** The six digits a paper number prints as, most significant first. */
export function paperNoDigits(paperNo: number): number[] {
  if (!Number.isInteger(paperNo) || paperNo < 100_000 || paperNo > 999_999) {
    throw new Error(`a paper number has ${PAPER_NO_DIGITS} digits, got ${paperNo}`)
  }
  return String(paperNo).split('').map(Number)
}

// ── The fixed frame ─────────────────────────────────────────────────────────
//
// Three registration columns — the page's two edges and its middle — so a
// curled page is corrected locally on each half. Content lives in the two
// halves between them and never crosses the middle.

const REG_X = [MARGIN, round((MARGIN + A4.width - MARGIN - REG) / 2), A4.width - MARGIN - REG]
const HALF_W = REG_X[1]! - REG_X[0]! - REG - 2 * GUTTER
const HALF_X = [REG_X[0]! + REG + GUTTER, REG_X[1]! + REG + GUTTER]

const TOP = MARGIN + 2
const CODE_H = LABEL_H + WRITE_H + BOX_GAP + 10 * PITCH
const MCQ_TOP = TOP + CODE_H + BAND_GAP
const ROWS_PER_COLUMN = MAX_QUESTIONS / 2
const MCQ_H = ROWS_PER_COLUMN * PITCH + Math.ceil(ROWS_PER_COLUMN / GROUP_SIZE) * PITCH
const NUMERIC_TOP = MCQ_TOP + MCQ_H + BAND_GAP
const BOX_H = LABEL_H + WRITE_H + BOX_GAP + 10 * PITCH
const REG_BOTTOM = A4.height - MARGIN - REG

const DIGIT_LABEL_W = round(textWidthMm('0', FONTS.digit) + 2)
const NUMBER_W = round(textWidthMm('00', FONTS.number) + 3)
const MCQ_W = NUMBER_W + (OPTIONS.length - 1) * PITCH + BUBBLE_MM
const BOX_W = DIGIT_LABEL_W + (NUMERIC_PLACES.length - 1) * PITCH + DOT_GAP + BUBBLE_MM
const BOX_SPACING = (HALF_W - PER_HALF * BOX_W) / (PER_HALF - 1)

/** A column of ten bubbles, 0 at the top, with its write box above. */
function digitColumn(cx: number, top: number): DigitColumn {
  const writeY = top + LABEL_H
  const firstY = writeY + WRITE_H + BOX_GAP + R
  return {
    writeBox: { x: round(cx - PITCH / 2), y: round(writeY), width: round(PITCH), height: WRITE_H },
    bubbles: Array.from({ length: 10 }, (_, v) => ({ value: v, x: round(cx), y: round(firstY + v * PITCH), r: R })),
  }
}

function digitLabels(x: number, top: number): (Point & { value: number })[] {
  const firstY = top + LABEL_H + WRITE_H + BOX_GAP + R
  return Array.from({ length: 10 }, (_, v) => ({ value: v, x: round(x), y: round(firstY + v * PITCH) }))
}

function codeBlock(): AnswerSheetLayout['code'] {
  const x = HALF_X[1]!
  return {
    label: { x: round(x + DIGIT_LABEL_W), y: TOP },
    columns: Array.from({ length: PAPER_NO_DIGITS }, (_, i) => digitColumn(x + DIGIT_LABEL_W + R + i * PITCH, TOP)),
    digitLabels: digitLabels(x, TOP),
  }
}

function questionRow(q: number, format: Format): QuestionRow {
  const column = q <= ROWS_PER_COLUMN ? 0 : 1
  const i = (q - 1) % ROWS_PER_COLUMN
  // Each column is centred in its half; the halves are otherwise white space.
  const x = HALF_X[column]! + (HALF_W - MCQ_W) / 2
  const groupTop = MCQ_TOP + Math.floor(i / GROUP_SIZE) * (GROUP_SIZE * PITCH + PITCH)
  const cy = groupTop + PITCH + (i % GROUP_SIZE) * PITCH + R
  const firstX = x + NUMBER_W + R
  const numW = textWidthMm(String(q), FONTS.number)

  return {
    q,
    format,
    numberAnchor: { x: round(firstX - R - 1.5 - numW), y: round(cy) },
    options:
      format === 'mcq'
        ? OPTIONS.map((label, k) => ({ label, x: round(firstX + k * PITCH), y: round(cy), r: R }))
        : [],
    groupHeader:
      i % GROUP_SIZE === 0
        ? {
            labels: OPTIONS,
            anchors: OPTIONS.map((label, k) => ({
              x: round(firstX + k * PITCH - textWidthMm(label, FONTS.option) / 2),
              y: round(groupTop + PITCH / 2),
            })),
          }
        : null,
    pointer: format === 'numeric' ? { x: round(firstX - R), y: round(cy) } : null,
  }
}

function numericBox(q: number, slot: number): NumericBox {
  const row = Math.floor(slot / (2 * PER_HALF))
  const k = slot % (2 * PER_HALF)
  const x = HALF_X[k < PER_HALF ? 0 : 1]! + (k % PER_HALF) * (BOX_W + BOX_SPACING)
  const top = NUMERIC_TOP + row * (BOX_H + NUMERIC_ROW_GAP)
  const cx = (i: number) => x + DIGIT_LABEL_W + R + i * PITCH + (i >= 4 ? DOT_GAP : 0)
  const columns = NUMERIC_PLACES.map((place, i) => ({ place, ...digitColumn(cx(i), top) }))

  return {
    q,
    slot,
    label: { x: round(x + DIGIT_LABEL_W), y: round(top) },
    columns,
    dot: { x: round((cx(3) + cx(4)) / 2), y: round(top + LABEL_H + WRITE_H - 0.8) },
    digitLabels: digitLabels(x, top),
  }
}

function registration(): Pick<AnswerSheetLayout, 'registration' | 'anchors' | 'grid'> {
  const rows = Math.max(5, Math.round((REG_BOTTOM - MARGIN) / REG_ROW_TARGET) + 1)
  const step = (REG_BOTTOM - MARGIN) / (rows - 1)
  const ys = Array.from({ length: rows }, (_, i) => round(MARGIN + i * step))
  const square = (x: number, y: number): Square => ({ x, y, size: REG })
  const squares: Square[] = []
  for (const y of ys) for (const x of REG_X) squares.push(square(x, y))

  const [left, right] = [REG_X[0]!, REG_X[REG_X.length - 1]!]
  const [top, bottom] = [ys[0]!, ys[ys.length - 1]!]
  return {
    registration: squares,
    anchors: [
      { ...square(left, top), corner: 'topLeft' },
      { ...square(right, top), corner: 'topRight' },
      { ...square(left, bottom), corner: 'bottomLeft' },
      { ...square(right, bottom), corner: 'bottomRight' },
    ],
    grid: { cols: REG_X.length, rows },
  }
}

/**
 * The sheet for one paper, from its questions' formats in position order.
 * Refuses a paper it cannot hold rather than drawing past the page.
 */
export function buildAnswerSheetLayout(formats: readonly Format[]): AnswerSheetLayout {
  if (formats.length < 1 || formats.length > MAX_QUESTIONS) {
    throw new Error(`an answer sheet holds 1 to ${MAX_QUESTIONS} questions, got ${formats.length}`)
  }
  const numericAt = formats.flatMap((f, i) => (f === 'numeric' ? [i + 1] : []))
  if (numericAt.length > NUMERIC_SLOTS) {
    throw new Error(`an answer sheet holds ${NUMERIC_SLOTS} numeric questions, got ${numericAt.length}`)
  }

  const codeRight = HALF_X[1]! + DIGIT_LABEL_W + (PAPER_NO_DIGITS - 1) * PITCH + BUBBLE_MM
  const instructionsX = codeRight + 4

  return {
    unit: 'mm',
    version: LAYOUT_VERSION,
    page: { width: A4.width, height: A4.height },
    geometry: { bubbleDiameter: BUBBLE_MM, bubbleRadius: R, pitch: PITCH, registrationSize: REG },
    header: {
      box: { x: HALF_X[0]!, y: TOP, width: round(HALF_W), height: round(CODE_H) },
      // Title, then name, class, date and paper number, one per line.
      lines: Array.from({ length: 5 }, (_, i) => ({ x: HALF_X[0]! + 2, y: round(TOP + 6 + i * 9) })),
      // The stamp sits above the grid, right-aligned: the renderer measures it
      // and walks back from here.
      stampEnd: { x: A4.width - MARGIN, y: MARGIN - 2.5 },
      stampMaxWidth: A4.width - 2 * MARGIN,
    },
    instructions: {
      x: round(instructionsX),
      y: TOP,
      width: round(HALF_X[1]! + HALF_W - instructionsX),
      height: round(CODE_H),
    },
    code: codeBlock(),
    questions: formats.map((format, i) => questionRow(i + 1, format)),
    numeric: numericAt.map((q, slot) => numericBox(q, slot)),
    ...registration(),
  }
}
