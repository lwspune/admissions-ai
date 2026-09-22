import { describe, it, expect } from 'vitest'
import { toCandidatePaper, type BankRow } from './serialize'

// The single most important test file in the project: if an answer key ever
// reaches the client, the test measures nothing and nobody finds out.

function mcqRow(overrides: Partial<BankRow> = {}): BankRow {
  return {
    id: 'item-1',
    ref: 'M-E-01',
    subject: 'maths',
    skill: 'number-series',
    difficulty: 'easy',
    format: 'mcq',
    stem: 'Find the next number: 3, 6, 11, 18, 27, ___',
    options: { A: '36', B: '38', C: '37', D: '40' },
    answer_key: 'B',
    numeric_answer: null,
    numeric_tolerance: 0,
    rationale: 'Differences are consecutive odd numbers, so 27 + 11 = 38.',
    status: 'live',
    ...overrides,
  }
}

function numericRow(overrides: Partial<BankRow> = {}): BankRow {
  return {
    ...mcqRow(),
    id: 'item-2',
    ref: 'M-D-05',
    format: 'numeric',
    stem: 'What is the selling price in rupees?',
    options: null,
    answer_key: null,
    numeric_answer: 840,
    numeric_tolerance: 0,
    rationale: 'Marked price 1120, less 25% = 840.',
    ...overrides,
  }
}

const paper = [
  { position: 1, item: mcqRow() },
  { position: 2, item: numericRow() },
]

describe('toCandidatePaper — the answer key never leaves the server', () => {
  it('omits answer_key entirely', () => {
    const out = toCandidatePaper(paper)
    for (const q of out) expect('answer_key' in q).toBe(false)
  })

  it('omits numeric_answer entirely', () => {
    const out = toCandidatePaper(paper)
    for (const q of out) expect('numeric_answer' in q).toBe(false)
  })

  it('omits the rationale, which states the answer in prose', () => {
    const out = toCandidatePaper(paper)
    for (const q of out) expect('rationale' in q).toBe(false)
  })

  it('leaks nothing through the serialized JSON, however nested', () => {
    // A property-level check can be defeated by a nested object; this asserts
    // on the actual bytes that would go over the wire.
    const json = JSON.stringify(toCandidatePaper(paper))
    expect(json).not.toContain('answer_key')
    expect(json).not.toContain('numeric_answer')
    expect(json).not.toContain('rationale')
    expect(json).not.toContain('840')
    expect(json).not.toContain('Differences are consecutive')
  })

  it('omits the item id and ref — they identify the item across attempts', () => {
    const json = JSON.stringify(toCandidatePaper(paper))
    expect(json).not.toContain('item-1')
    expect(json).not.toContain('M-E-01')
  })

  it('omits difficulty — knowing an item is easy changes how it is answered', () => {
    const json = JSON.stringify(toCandidatePaper(paper))
    expect(json).not.toContain('difficulty')
    expect(json).not.toContain('easy')
  })

  it('carries exactly the whitelisted fields and nothing else', () => {
    // An allow-list, not a delete-list: a column added to the bank later must
    // not silently start reaching candidates.
    const out = toCandidatePaper(paper)
    expect(Object.keys(out[0]!).sort()).toEqual(['format', 'options', 'position', 'stem', 'subject'])
  })
})

describe('toCandidatePaper — what the candidate does need', () => {
  it('keeps the stem, subject, format and position', () => {
    const [q] = toCandidatePaper([{ position: 7, item: mcqRow() }])
    expect(q!.position).toBe(7)
    expect(q!.subject).toBe('maths')
    expect(q!.format).toBe('mcq')
    expect(q!.stem).toContain('Find the next number')
  })

  it('keeps all four options for an MCQ, in A-D order', () => {
    const [q] = toCandidatePaper([{ position: 1, item: mcqRow() }])
    expect(q!.options).toEqual({ A: '36', B: '38', C: '37', D: '40' })
  })

  it('sends null options for a numeric item', () => {
    const [q] = toCandidatePaper([{ position: 1, item: numericRow() }])
    expect(q!.options).toBeNull()
  })

  it('preserves paper order by position', () => {
    const out = toCandidatePaper([
      { position: 3, item: mcqRow() },
      { position: 1, item: numericRow() },
      { position: 2, item: mcqRow({ id: 'item-3' }) },
    ])
    expect(out.map((q) => q.position)).toEqual([1, 2, 3])
  })

  it('returns an empty array for an empty paper rather than throwing', () => {
    expect(toCandidatePaper([])).toEqual([])
  })

  it('drops an unexpected option key rather than passing it through', () => {
    const row = mcqRow({ options: { A: '1', B: '2', C: '3', D: '4', E: 'leak' } as never })
    const json = JSON.stringify(toCandidatePaper([{ position: 1, item: row }]))
    expect(json).not.toContain('leak')
  })
})
