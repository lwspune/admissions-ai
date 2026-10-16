import { describe, it, expect } from 'vitest'
import { toAnswerSheet } from './paperSheet'
import type { BankRow } from './serialize'

// The OMR sheet is generated in the browser, so what it is built from crosses
// to the client. It needs the formats in position order and who the sheet is
// for — never a question, an option or an answer. Checked on the serialized
// bytes, as toCandidatePaper's tests are, since a property check is defeated
// by nesting.

const row = (position: number, over: Partial<BankRow>): { position: number; item: BankRow } => ({
  position,
  item: {
    id: `00000000-0000-4000-8000-00000000000${position}`,
    ref: `M-E-0${position}`,
    subject: 'maths',
    part: 'basics',
    taught_in: 6,
    term: null,
    skill: 'secret-skill',
    difficulty: 'easy',
    format: 'mcq',
    stem: 'SECRET STEM',
    options: { A: 'SECRET A', B: 'SECRET B', C: 'SECRET C', D: 'SECRET D' },
    answer_key: 'C',
    numeric_answer: null,
    numeric_tolerance: 0,
    rationale: 'SECRET RATIONALE',
    status: 'live',
    stem_hi: 'SECRET HINDI',
    options_hi: null,
    ...over,
  },
})

const assessment = { paper_no: 470318, issued_at: '2026-10-16T05:30:00.000Z' }
const lead = { name: 'Rohan Patil', class_level: 9 }

describe('toAnswerSheet', () => {
  const paper = [
    row(2, { format: 'numeric', options: null, answer_key: null, numeric_answer: 3.25 }),
    row(1, {}),
    row(3, {}),
  ]

  it('gives the formats in position order, and who the sheet is for', () => {
    expect(toAnswerSheet({ assessment, lead, paper })).toEqual({
      paperNo: 470318,
      name: 'Rohan Patil',
      classLevel: 9,
      issuedAt: '2026-10-16T05:30:00.000Z',
      formats: ['mcq', 'numeric', 'mcq'],
    })
  })

  it('carries no question, option, answer, skill or id', () => {
    const bytes = JSON.stringify(toAnswerSheet({ assessment, lead, paper }))
    for (const secret of ['SECRET', 'C"', '3.25', 'M-E-0', '00000000-', 'easy', 'basics', 'maths']) {
      expect(bytes).not.toContain(secret)
    }
  })

  it('refuses a paper that is not a paper test', () => {
    expect(() => toAnswerSheet({ assessment: { ...assessment, paper_no: null }, lead, paper })).toThrow(/paper test/)
  })
})
