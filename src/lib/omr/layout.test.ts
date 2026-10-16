import { describe, it, expect } from 'vitest'
import {
  A4,
  BUBBLE_MM,
  MAX_QUESTIONS,
  NUMERIC_PLACES,
  NUMERIC_SLOTS,
  buildAnswerSheetLayout,
  fitsAnswerBox,
  paperNoDigits,
  type AnswerSheetLayout,
} from './layout'
import type { Format } from '../types'

// The answer sheet for a paper test (2026-10-16). Its geometry is the contract
// with the scanner: the reader samples the bubbles the layout names, so these
// tests pin where everything is, that nothing collides, and above all that the
// FRAME does not move from paper to paper — the scanner must find the paper
// code before it knows which paper it is holding.

const mcq = (n: number): Format[] => Array.from({ length: n }, () => 'mcq' as const)
/** A 30-question paper with numeric questions at the given 1-based positions. */
const paper = (...numeric: number[]): Format[] =>
  mcq(MAX_QUESTIONS).map((f, i) => (numeric.includes(i + 1) ? 'numeric' : f))

const TYPICAL = paper(4, 9, 13, 17, 22, 27)
const FULL = paper(...Array.from({ length: NUMERIC_SLOTS }, (_, i) => i + 1))

interface Circle {
  x: number
  y: number
  r: number
  where: string
}

function allBubbles(l: AnswerSheetLayout): Circle[] {
  const out: Circle[] = []
  for (const q of l.questions) for (const o of q.options) out.push({ ...o, where: `Q${q.q}${o.label}` })
  for (const [i, c] of l.code.columns.entries()) for (const b of c.bubbles) out.push({ ...b, where: `code${i}:${b.value}` })
  for (const n of l.numeric) {
    for (const [i, c] of n.columns.entries()) for (const b of c.bubbles) out.push({ ...b, where: `N${n.q}c${i}:${b.value}` })
  }
  return out
}

describe('buildAnswerSheetLayout — the questions', () => {
  it('gives every position one row, in order, with A–D bubbles on a multiple-choice row', () => {
    const l = buildAnswerSheetLayout(TYPICAL)
    expect(l.questions.map((q) => q.q)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    for (const q of l.questions.filter((q) => q.format === 'mcq')) {
      expect(q.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D'])
      expect(q.pointer).toBeNull()
    }
  })

  it('gives a numeric row no bubbles, only a pointer to its box', () => {
    const l = buildAnswerSheetLayout(TYPICAL)
    for (const pos of [4, 9, 13, 17, 22, 27]) {
      const row = l.questions[pos - 1]!
      expect(row.format).toBe('numeric')
      expect(row.options).toEqual([])
      expect(row.pointer).not.toBeNull()
    }
  })

  it('gives each numeric question one box, in position order, filling the slots from the first', () => {
    const l = buildAnswerSheetLayout(TYPICAL)
    expect(l.numeric.map((n) => n.q)).toEqual([4, 9, 13, 17, 22, 27])
    expect(l.numeric.map((n) => n.slot)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('gives a numeric box one column per place, 4 before the point and 2 after, each with 0–9', () => {
    const [box] = buildAnswerSheetLayout(TYPICAL).numeric
    expect(box!.columns.map((c) => c.place)).toEqual([...NUMERIC_PLACES])
    expect(NUMERIC_PLACES).toEqual([1000, 100, 10, 1, 0.1, 0.01])
    for (const c of box!.columns) expect(c.bubbles.map((b) => b.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    // The point sits between the units and the tenths column.
    expect(box!.dot.x).toBeGreaterThan(box!.columns[3]!.bubbles[0]!.x)
    expect(box!.dot.x).toBeLessThan(box!.columns[4]!.bubbles[0]!.x)
  })

  it('lays out the 15-question fallback paper too', () => {
    const l = buildAnswerSheetLayout(mcq(15).map((f, i) => (i === 5 ? 'numeric' : f)))
    expect(l.questions).toHaveLength(15)
    expect(l.numeric.map((n) => n.q)).toEqual([6])
  })

  it('holds a paper with every numeric slot used', () => {
    expect(buildAnswerSheetLayout(FULL).numeric).toHaveLength(NUMERIC_SLOTS)
  })

  it('refuses a paper it cannot hold, rather than overflowing the page', () => {
    expect(() => buildAnswerSheetLayout([])).toThrow(/question/)
    expect(() => buildAnswerSheetLayout(mcq(31))).toThrow(/question/)
    expect(() => buildAnswerSheetLayout(paper(...Array.from({ length: NUMERIC_SLOTS + 1 }, (_, i) => i + 1)))).toThrow(
      /numeric/,
    )
  })
})

describe('buildAnswerSheetLayout — the frame does not move from paper to paper', () => {
  // The scanner reads the paper code before it knows the paper, so the
  // registration grid and the code block may not depend on the paper at all.
  const layouts = [mcq(30), TYPICAL, FULL, mcq(15)].map(buildAnswerSheetLayout)

  it('keeps the registration grid and its corners identical', () => {
    for (const l of layouts) {
      expect(l.registration).toEqual(layouts[0]!.registration)
      expect(l.anchors).toEqual(layouts[0]!.anchors)
    }
  })

  it('keeps the paper code block identical', () => {
    for (const l of layouts) expect(l.code).toEqual(layouts[0]!.code)
  })

  it('keeps every question number where it is, whatever its format', () => {
    for (const l of layouts) {
      for (const q of l.questions) expect(q.numberAnchor).toEqual(layouts[0]!.questions[q.q - 1]!.numberAnchor)
    }
  })

  it('puts slot k in the same place whichever question fills it', () => {
    const a = buildAnswerSheetLayout(paper(1, 2))
    const b = buildAnswerSheetLayout(paper(20, 30))
    expect(b.numeric[1]!.columns).toEqual(a.numeric[1]!.columns)
  })

  it('is deterministic', () => {
    expect(buildAnswerSheetLayout(TYPICAL)).toEqual(buildAnswerSheetLayout(TYPICAL))
  })
})

describe('buildAnswerSheetLayout — everything on the page and apart', () => {
  const l = buildAnswerSheetLayout(FULL)
  const bubbles = allBubbles(l)

  it('keeps every bubble and square inside the page margins', () => {
    for (const b of bubbles) {
      expect(b.x - b.r, b.where).toBeGreaterThanOrEqual(5)
      expect(b.x + b.r, b.where).toBeLessThanOrEqual(A4.width - 5)
      expect(b.y - b.r, b.where).toBeGreaterThanOrEqual(5)
      expect(b.y + b.r, b.where).toBeLessThanOrEqual(A4.height - 5)
    }
    for (const s of l.registration) {
      expect(s.x).toBeGreaterThanOrEqual(5)
      expect(s.y).toBeGreaterThanOrEqual(5)
      expect(s.x + s.size).toBeLessThanOrEqual(A4.width - 5)
      expect(s.y + s.size).toBeLessThanOrEqual(A4.height - 5)
    }
  })

  it('never overlaps two bubbles', () => {
    const clash: string[] = []
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i]!
        const b = bubbles[j]!
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 0.5) clash.push(`${a.where}~${b.where}`)
      }
    }
    expect(clash).toEqual([])
  })

  it('keeps bubbles clear of the registration squares the reader locks onto', () => {
    const near: string[] = []
    for (const b of bubbles) {
      for (const s of l.registration) {
        const cx = Math.max(s.x, Math.min(b.x, s.x + s.size))
        const cy = Math.max(s.y, Math.min(b.y, s.y + s.size))
        if (Math.hypot(b.x - cx, b.y - cy) < b.r + 0.5) near.push(b.where)
      }
    }
    expect(near).toEqual([])
  })

  it('keeps each question number to the left of its own bubbles', () => {
    for (const q of l.questions.filter((q) => q.format === 'mcq')) {
      expect(q.numberAnchor.x).toBeLessThan(q.options[0]!.x - q.options[0]!.r)
    }
  })

  it('keeps the instructions and the header clear of every bubble', () => {
    const boxes = [l.instructions, l.header.box]
    for (const box of boxes) {
      for (const b of bubbles) {
        const inside =
          b.x + b.r > box.x && b.x - b.r < box.x + box.width && b.y + b.r > box.y && b.y - b.r < box.y + box.height
        expect(inside, b.where).toBe(false)
      }
    }
  })

  it('uses the bubble size the sheet was sized for', () => {
    expect(l.geometry.bubbleDiameter).toBe(BUBBLE_MM)
    for (const b of bubbles) expect(b.r).toBe(BUBBLE_MM / 2)
  })
})

describe('buildAnswerSheetLayout — registration grid', () => {
  const l = buildAnswerSheetLayout(TYPICAL)

  it('is a full grid with a middle column, so a curled page is corrected locally', () => {
    expect(l.grid.cols).toBe(3)
    expect(l.grid.rows).toBeGreaterThanOrEqual(5)
    expect(l.registration).toHaveLength(l.grid.cols * l.grid.rows)
    expect(new Set(l.registration.map((s) => s.x)).size).toBe(l.grid.cols)
    expect(new Set(l.registration.map((s) => s.y)).size).toBe(l.grid.rows)
  })

  it('names exactly four corner anchors, one per corner', () => {
    const corners = Object.fromEntries(l.anchors.map((a) => [a.corner, a]))
    expect(Object.keys(corners).sort()).toEqual(['bottomLeft', 'bottomRight', 'topLeft', 'topRight'])
    expect(corners.topLeft!.x).toBeLessThan(corners.topRight!.x)
    expect(corners.topLeft!.y).toBeLessThan(corners.bottomLeft!.y)
  })

  it('keeps every bubble inside the frame the corners make', () => {
    const xs = l.registration.map((s) => s.x)
    const ys = l.registration.map((s) => s.y)
    for (const b of allBubbles(l)) {
      expect(b.x, b.where).toBeGreaterThan(Math.min(...xs))
      expect(b.x, b.where).toBeLessThan(Math.max(...xs))
      expect(b.y, b.where).toBeGreaterThan(Math.min(...ys))
      expect(b.y, b.where).toBeLessThan(Math.max(...ys) + l.geometry.registrationSize)
    }
  })
})

describe('buildAnswerSheetLayout — the paper code', () => {
  it('has one column per digit, each with bubbles 0–9', () => {
    const { code } = buildAnswerSheetLayout(TYPICAL)
    expect(code.columns).toHaveLength(6)
    for (const c of code.columns) expect(c.bubbles.map((b) => b.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('paperNoDigits', () => {
  it('splits a paper number into its six digits', () => {
    expect(paperNoDigits(123456)).toEqual([1, 2, 3, 4, 5, 6])
    expect(paperNoDigits(100000)).toEqual([1, 0, 0, 0, 0, 0])
  })

  it('refuses a number the code block cannot carry', () => {
    for (const bad of [99_999, 1_000_000, 123456.5, Number.NaN]) expect(() => paperNoDigits(bad)).toThrow()
  })
})

describe('fitsAnswerBox', () => {
  it('accepts what four digits and two decimals can hold', () => {
    for (const v of [0, 7, 3000, 9999.99, 3.25, 32.4, 2.7]) expect(fitsAnswerBox(v), String(v)).toBe(true)
  })

  it('refuses negatives, five-digit numbers and a third decimal', () => {
    for (const v of [-1, -0.5, 10_000, 3.125, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fitsAnswerBox(v), String(v)).toBe(false)
    }
  })
})
