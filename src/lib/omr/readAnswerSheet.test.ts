import { describe, it, expect } from 'vitest'
import { buildAnswerSheetLayout, paperNoDigits, NUMERIC_PLACES } from './layout'
import { locateSheet, readAnswers, toLiveRead, type NumericRead, type McqRead } from './readAnswerSheet'
import { solveHomographyLS, applyH } from './gridFit'
import type { ImageLike } from './detectSquares'
import type { Format } from '../types'

// The whole chain, on a sheet drawn from the REAL layout the PDF is drawn
// from: registration squares, empty rings, the paper code printed filled, and
// marks where a candidate would make them. nda-tracker's lesson stands — every
// bug in its reader survived a unit test that shared an assumption with the
// code; rendering the actual sheet is what caught them.

const S = 5 // px per mm

type Marks = {
  mcq?: Record<number, number[]> // position -> option indexes marked
  numeric?: Record<number, (number | number[] | null)[]> // position -> per column digit(s), null = blank
  faint?: Record<number, number> // position -> option index only partly filled
  paperNo?: number | null
}

function blankImage(width: number, height: number): ImageLike & { put: (x: number, y: number, v: number) => void } {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const put = (x: number, y: number, v: number) => {
    x |= 0
    y |= 0
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
  return { width, height, data, put }
}

function render(formats: Format[], marks: Marks = {}): ImageLike {
  const l = buildAnswerSheetLayout(formats)
  const img = blankImage(Math.round(l.page.width * S), Math.round(l.page.height * S))
  const disc = (cx: number, cy: number, r: number, v: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.put(x, y, v)
  }
  const ring = (cx: number, cy: number, r: number) => {
    const steps = Math.max(60, Math.round(2 * Math.PI * r * 3))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI
      for (const rr of [r, r - 0.8]) img.put(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 50)
    }
  }
  const bubble = (b: { x: number; y: number; r: number }, mark: 'none' | 'pen' | 'faint' | 'printed') => {
    ring(b.x * S, b.y * S, b.r * S)
    if (mark === 'pen') disc(b.x * S, b.y * S, b.r * S * 0.75, 25)
    // Partly filled, as a dot or a half-hearted fill is. Grey alone is not
    // "faint" to this reader: it thresholds locally, so light ink is still ink.
    if (mark === 'faint') disc(b.x * S, b.y * S, b.r * S * 0.4, 25)
    if (mark === 'printed') disc(b.x * S, b.y * S, b.r * S, 0)
  }
  for (const s of l.registration) {
    for (let y = 0; y < s.size * S; y++) for (let x = 0; x < s.size * S; x++) img.put(s.x * S + x, s.y * S + y, 0)
  }
  const code = marks.paperNo === null ? null : paperNoDigits(marks.paperNo ?? 470318)
  l.code.columns.forEach((c, i) => c.bubbles.forEach((b) => bubble(b, code && code[i] === b.value ? 'printed' : 'none')))
  for (const q of l.questions) {
    q.options.forEach((o, i) =>
      bubble(o, marks.faint?.[q.q] === i ? 'faint' : (marks.mcq?.[q.q] ?? []).includes(i) ? 'pen' : 'none'),
    )
  }
  for (const box of l.numeric) {
    const want = marks.numeric?.[box.q] ?? []
    box.columns.forEach((c, ci) => {
      const d = want[ci]
      const digits = d == null ? [] : Array.isArray(d) ? d : [d]
      c.bubbles.forEach((b) => bubble(b, digits.includes(b.value) ? 'pen' : 'none'))
    })
  }
  return img
}

/** A phone photo: perspective, a frame bigger than the page, a shadow, bilinear like a real sensor. */
function photograph(page: ImageLike, { shade = 0, flip = false } = {}): ImageLike {
  const W = 1100
  const Hh = 1500
  const corners = [
    { x: 0, y: 0 },
    { x: page.width, y: 0 },
    { x: page.width, y: page.height },
    { x: 0, y: page.height },
  ]
  const where = [
    { x: 70, y: 60 },
    { x: 1040, y: 95 },
    { x: 1010, y: 1440 },
    { x: 40, y: 1400 },
  ]
  const dst = flip ? [where[2]!, where[3]!, where[0]!, where[1]!] : where
  const inv = solveHomographyLS(dst, corners)!
  const out = blankImage(W, Hh)
  const at = (x: number, y: number) => page.data[(y * page.width + x) * 4]!
  for (let Y = 0; Y < Hh; Y++) {
    for (let X = 0; X < W; X++) {
      const p = applyH(inv, X, Y)
      let v = 235 // the desk
      if (p.x >= 0 && p.y >= 0 && p.x < page.width - 1 && p.y < page.height - 1) {
        const x0 = Math.floor(p.x)
        const y0 = Math.floor(p.y)
        const tx = p.x - x0
        const ty = p.y - y0
        v =
          at(x0, y0) * (1 - tx) * (1 - ty) +
          at(x0 + 1, y0) * tx * (1 - ty) +
          at(x0, y0 + 1) * (1 - tx) * ty +
          at(x0 + 1, y0 + 1) * tx * ty
      }
      out.put(X, Y, Math.max(0, v - shade * (X / W) * (Y / Hh)))
    }
  }
  return out
}

const at = (positions: number[]): Format[] =>
  Array.from({ length: 30 }, (_, i) => (positions.includes(i + 1) ? 'numeric' : 'mcq'))
const FORMATS = at([3, 11, 20, 24])

const mcq = (read: ReturnType<typeof readAnswers>, q: number) => read.answers.find((a) => a.q === q) as McqRead
const num = (read: ReturnType<typeof readAnswers>, q: number) => read.answers.find((a) => a.q === q) as NumericRead

function readBack(image: ImageLike, formats = FORMATS) {
  const located = locateSheet(image)
  if (!located.ok) throw new Error(`not located: ${located.reason}`)
  return { located, read: readAnswers(image, located, formats) }
}

describe('locateSheet — which paper is this?', () => {
  it('reads the printed paper number off a flat sheet', () => {
    const r = locateSheet(render(FORMATS, { paperNo: 470318 }))
    expect(r.ok && r.paperNo).toBe(470318)
  })

  it('reads it through perspective and a shadow, as a phone takes it', () => {
    const r = locateSheet(photograph(render(FORMATS, { paperNo: 123456 }), { shade: 90 }))
    expect(r.ok && r.paperNo).toBe(123456)
  })

  it('reads a sheet photographed upside down, and says so', () => {
    const r = locateSheet(photograph(render(FORMATS, { paperNo: 470318 }), { flip: true }))
    expect(r.ok && r.paperNo).toBe(470318)
    expect(r.ok && r.flipped).toBe(true)
  })

  it('refuses a sheet whose paper code is not printed, rather than reading a number into it', () => {
    const r = locateSheet(render(FORMATS, { paperNo: null }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/paper number/i)
  })

  it('refuses half a sheet', () => {
    const page = render(FORMATS)
    const half = { ...page, height: Math.round(page.height / 2), data: page.data.slice(0, page.width * Math.round(page.height / 2) * 4) }
    const r = locateSheet(half)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBeTruthy()
  })

  it('refuses a page with no sheet on it', () => {
    const r = locateSheet(blankImage(800, 1100))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/registration|sheet/i)
  })

  it('reports where the sheet is, for the viewfinder to outline', () => {
    const r = locateSheet(render(FORMATS))
    expect(r.ok && r.corners).toHaveLength(4)
  })
})

describe('readAnswers — what the candidate marked', () => {
  const marks: Marks = {
    mcq: { 1: [0], 2: [2], 7: [3], 30: [1] },
    numeric: {
      3: [null, null, 2, 5, null, null], // 25
      11: [null, null, null, 3, 2, 5], // 3.25
      20: [3, 0, 0, 0, null, null], // 3000
      24: [null, null, null, 0, null, null], // 0, written in the units column
    },
  }

  for (const [label, image] of [
    ['a flat sheet', () => render(FORMATS, marks)],
    ['a phone photo with a shadow', () => photograph(render(FORMATS, marks), { shade: 90 })],
    ['a phone photo held upside down', () => photograph(render(FORMATS, marks), { flip: true })],
  ] as const) {
    it(`reads every answer exactly off ${label}`, () => {
      const { read } = readBack(image())
      expect(mcq(read, 1).choice).toBe('A')
      expect(mcq(read, 2).choice).toBe('C')
      expect(mcq(read, 7).choice).toBe('D')
      expect(mcq(read, 30).choice).toBe('B')
      expect(mcq(read, 4).state).toBe('blank')
      expect(num(read, 3).value).toBe(25)
      expect(num(read, 11).value).toBe(3.25)
      expect(num(read, 20).value).toBe(3000)
      expect(num(read, 24).value).toBe(0)
      expect(num(read, 24).state).toBe('single')
      expect(read.reviewCount).toBe(0)
      expect(read.complete).toBe(true)
    })
  }

  it('reads an untouched numeric box as blank, not as 0', () => {
    const { read } = readBack(render(FORMATS, { mcq: { 1: [0] } }))
    expect(num(read, 3).state).toBe('blank')
    expect(num(read, 3).value).toBeNull()
  })

  it('flags two bubbles in one row as a double mark, never picking one', () => {
    const { read } = readBack(render(FORMATS, { mcq: { 1: [0], 5: [0, 2] } }))
    expect(mcq(read, 5).state).toBe('multi')
    expect(mcq(read, 5).choice).toBeNull()
    expect(mcq(read, 5).review).toBe(true)
    expect(read.complete).toBe(false)
  })

  it('flags a numeric column with two digits marked', () => {
    const { read } = readBack(render(FORMATS, { mcq: { 1: [0] }, numeric: { 3: [null, null, [2, 7], 5, null, null] } }))
    expect(num(read, 3).state).toBe('review')
    expect(num(read, 3).value).toBeNull()
    expect(read.complete).toBe(false)
  })

  it('flags a partly filled bubble for a person instead of deciding it', () => {
    const { read } = readBack(render(FORMATS, { mcq: { 1: [0], 2: [1] }, faint: { 6: 2 } }))
    expect(mcq(read, 6).review).toBe(true)
    expect(read.complete).toBe(false)
  })

  it('reads a sheet nobody wrote on as all blank, with nothing to review', () => {
    const { read } = readBack(render(FORMATS))
    expect(read.answers.every((a) => a.state === 'blank')).toBe(true)
    expect(read.complete).toBe(true)
  })

  it('reads the 15-question paper too', () => {
    const fifteen: Format[] = Array.from({ length: 15 }, (_, i) => (i === 4 ? 'numeric' : 'mcq'))
    const { read } = readBack(render(fifteen, { mcq: { 15: [3] }, numeric: { 5: [null, null, null, 7, 5, null] } }), fifteen)
    expect(read.answers).toHaveLength(15)
    expect(mcq(read, 15).choice).toBe('D')
    expect(num(read, 5).value).toBe(7.5)
  })

  it('decodes every place, from thousands to hundredths', () => {
    const { read } = readBack(render(FORMATS, { numeric: { 3: [9, 9, 9, 9, 9, 9], 11: [null, null, null, null, 0, 1] } }))
    expect(num(read, 3).value).toBe(9999.99)
    expect(num(read, 11).value).toBe(0.01)
    expect(NUMERIC_PLACES).toHaveLength(6)
  })
})

describe('toLiveRead', () => {
  it('gives the live scanner one value per position, so two equal reads sign alike', () => {
    const image = render(FORMATS, { mcq: { 1: [0] }, numeric: { 3: [null, null, 2, 5, null, null] } })
    const { located, read } = readBack(image)
    const live = toLiveRead(located, read)
    expect(live).toMatchObject({ ok: true, complete: true, paperNo: 470318 })
    expect(live.answers?.[1]).toBe('A')
    expect(live.answers?.[3]).toBe(25)
    expect(live.answers?.[2]).toBeNull()
  })
})
