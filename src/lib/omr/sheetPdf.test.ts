import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildAnswerSheetLayout, LAYOUT_VERSION, NUMERIC_PLACES } from './layout'
import type { AnswerSheet } from '../paperSheet'
import type { Format } from '../types'

// jsPDF is mocked so these tests pin WHAT gets drawn. A sheet missing its
// registration squares or with the wrong code bubble filled still renders and
// still prints; it just can never be read, or is read as another paper.

type Call = unknown[]
const calls: Record<'rect' | 'circle' | 'text', Call[]> = { rect: [], circle: [], text: [] }
const reset = () => {
  calls.rect = []
  calls.circle = []
  calls.text = []
}

vi.mock('jspdf', () => ({
  jsPDF: class {
    opts: unknown
    constructor(opts: unknown) {
      this.opts = opts
    }
    rect(...a: Call) {
      calls.rect.push(a)
    }
    circle(...a: Call) {
      calls.circle.push(a)
    }
    text(...a: Call) {
      calls.text.push(a)
    }
    splitTextToSize(text: string) {
      return [text]
    }
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setFontSize() {}
    setFont() {}
    setTextColor() {}
    output() {
      return new Blob(['%PDF'], { type: 'application/pdf' })
    }
  },
}))

const { renderAnswerSheetPdf } = await import('./sheetPdf')

const formats: Format[] = Array.from({ length: 30 }, (_, i) => ([3, 11, 24].includes(i + 1) ? 'numeric' : 'mcq'))
const sheet: AnswerSheet = {
  paperNo: 470318,
  name: 'Rohan Patil',
  classLevel: 9,
  issuedAt: '2026-10-16T05:30:00.000Z',
  formats,
}
const layout = buildAnswerSheetLayout(formats)
const printed = () => calls.text.map((c) => String(c[0])).join('\n')

describe('renderAnswerSheetPdf', () => {
  beforeEach(reset)

  it('draws every bubble the layout names, and no other circle', async () => {
    await renderAnswerSheetPdf(sheet)
    const bubbles =
      layout.questions.reduce((n, q) => n + q.options.length, 0) +
      layout.code.columns.length * 10 +
      layout.numeric.length * NUMERIC_PLACES.length * 10
    const dots = layout.numeric.length
    expect(calls.circle).toHaveLength(bubbles + dots)
  })

  it('fills exactly the paper number’s bubbles in the code block', async () => {
    await renderAnswerSheetPdf(sheet)
    const filled = calls.circle.filter((c) => c[3] === 'FD' || c[3] === 'F')
    const expected = [4, 7, 0, 3, 1, 8].map((digit, i) => {
      const b = layout.code.columns[i]!.bubbles[digit]!
      return [b.x, b.y]
    })
    const dots = layout.numeric.map((n) => [n.dot.x, n.dot.y])
    expect(filled.map((c) => [c[0], c[1]]).sort()).toEqual([...expected, ...dots].sort())
  })

  it('draws every registration square FILLED — an outline will not register', async () => {
    await renderAnswerSheetPdf(sheet)
    const squares = calls.rect.filter((c) => c[4] === 'F')
    expect(squares).toHaveLength(layout.registration.length)
  })

  it('prints who and which paper the sheet is for', async () => {
    await renderAnswerSheetPdf(sheet)
    const text = printed()
    expect(text).toContain('Rohan Patil')
    expect(text).toContain('470318')
    expect(text).toMatch(/Class\D*9/)
    expect(text).toContain('16 Oct 2026')
  })

  it('prints every question number, and labels each numeric box with its question', async () => {
    await renderAnswerSheetPdf(sheet)
    const texts = calls.text.map((c) => String(c[0]))
    for (let q = 1; q <= 30; q++) expect(texts).toContain(String(q))
    for (const q of [3, 11, 24]) expect(texts).toContain(`Q${q}`)
  })

  it('stamps the layout version, so a sheet outliving a layout change is spotted by eye', async () => {
    await renderAnswerSheetPdf(sheet)
    expect(printed()).toContain(`OMR ${LAYOUT_VERSION}`)
  })

  it('returns a PDF', async () => {
    const blob = await renderAnswerSheetPdf(sheet)
    expect(blob.type).toBe('application/pdf')
  })

  it('refuses a paper number the code block cannot carry', async () => {
    await expect(renderAnswerSheetPdf({ ...sheet, paperNo: 42 })).rejects.toThrow(/digits/)
  })
})
