import { describe, it, expect } from 'vitest'
import {
  HIRING_SHAPE,
  HIRING_SOURCES,
  HIRING_SUBJECTS,
  rejectReason,
  toHiringItem,
  pickPool,
  lintHiringBank,
  type HiringItem,
  type SourceRow,
} from './hiring'

const opts = (correct: 'A' | 'B' | 'C' | 'D' = 'B') =>
  (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: `option ${label}`, is_correct: label === correct, image_url: null }))

const mcq = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: 'q1',
  text: String.raw`If \(x = 2\), find \(x^2\).`,
  context: null,
  image_url: null,
  question_format: 'mcq',
  numeric_answer: null,
  pyq_year: 2024,
  pyq_note: 'NDA (I) 2024',
  chapter: 'Algebra',
  options: opts(),
  ...over,
})

const numeric = (over: Partial<SourceRow> = {}): SourceRow =>
  mcq({ id: 'n1', question_format: 'numeric', numeric_answer: 17, options: [], pyq_note: 'JEE Main 2025 (22 Jan Shift 1)', ...over })

describe('the paper each subject gets', () => {
  it('is 15 questions for every subject', () => {
    for (const s of HIRING_SUBJECTS) expect(HIRING_SHAPE[s].mcq + HIRING_SHAPE[s].numeric).toBe(15)
  })

  it('is twelve MCQ and three typed answers in maths and science, fifteen MCQ in English', () => {
    expect(HIRING_SHAPE.maths).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.physics).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.chemistry).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.english).toMatchObject({ mcq: 15, numeric: 0, minutes: 20 })
  })

  it('draws MCQs from the exam the teacher will teach for, typed answers from JEE Mains', () => {
    const src = (s: (typeof HIRING_SUBJECTS)[number]) => HIRING_SOURCES[s].map((x) => `${x.source}/${x.format}`)
    expect(src('maths')).toEqual(['nda/mcq', 'jee-mains/numeric'])
    expect(src('physics')).toEqual(['mht-cet/mcq', 'jee-mains/numeric'])
    expect(src('chemistry')).toEqual(['mht-cet/mcq', 'jee-mains/numeric'])
    expect(src('english')).toEqual(['cds/mcq'])
  })

  it('imports a pool many times the paper, so two papers rarely share a question', () => {
    for (const s of HIRING_SUBJECTS) {
      for (const { format, pool } of HIRING_SOURCES[s]) {
        // Two random draws of k from a pool of p share k²/p questions on average.
        const k = HIRING_SHAPE[s][format]
        expect((k * k) / pool).toBeLessThanOrEqual(0.75)
      }
    }
  })
})

describe('rejectReason', () => {
  it('accepts a plain MCQ and a whole-number typed answer', () => {
    expect(rejectReason(mcq(), 'maths')).toBeNull()
    expect(rejectReason(numeric(), 'maths')).toBeNull()
  })

  it('refuses a figure on the question or on an option, since v1 stores no images', () => {
    expect(rejectReason(mcq({ image_url: 'https://x/fig.png' }), 'physics')).toBe('figure')
    const withImg = opts().map((o, i) => (i === 2 ? { ...o, image_url: 'https://x/o.png' } : o))
    expect(rejectReason(mcq({ options: withImg }), 'physics')).toBe('figure')
    expect(rejectReason(mcq({ text: 'See ![](https://x/f.png)' }), 'physics')).toBe('figure')
  })

  it('refuses a table', () => {
    expect(rejectReason(mcq({ text: '| a | b |\n|---|---|\n| 1 | 2 |' }), 'chemistry')).toBe('table')
  })

  it('refuses a shared stem in maths and science: the question leans on its neighbours', () => {
    expect(rejectReason(mcq({ context: 'Consider the following for the next two items.' }), 'maths')).toBe('context')
  })

  it('keeps a short English direction, but not a passage', () => {
    expect(rejectReason(mcq({ context: 'Directions: improve the underlined part.' }), 'english')).toBeNull()
    expect(rejectReason(mcq({ context: 'x'.repeat(161) }), 'english')).toBe('context')
  })

  it('refuses an MCQ without four options or one key', () => {
    expect(rejectReason(mcq({ options: opts().slice(0, 3) }), 'maths')).toBe('options')
    expect(rejectReason(mcq({ options: opts().map((o) => ({ ...o, is_correct: true })) }), 'maths')).toBe('key')
    expect(rejectReason(mcq({ options: opts().map((o) => ({ ...o, is_correct: false })) }), 'maths')).toBe('key')
    const blank = opts().map((o, i) => (i === 0 ? { ...o, text: '  ' } : o))
    expect(rejectReason(mcq({ options: blank }), 'maths')).toBe('options')
  })

  it('refuses a typed answer that is not a whole number from 0 to 9999', () => {
    expect(rejectReason(numeric({ numeric_answer: null }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: 2.5 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: -3 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: 10000 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: '42' }), 'maths')).toBeNull()
  })

  it('refuses maths KaTeX cannot draw', () => {
    expect(rejectReason(mcq({ text: String.raw`Find \(\frac{1}{\).` }), 'maths')).toBe('math')
    const bad = opts().map((o, i) => (i === 1 ? { ...o, text: String.raw`\(\sqrt{\)` } : o))
    expect(rejectReason(mcq({ options: bad }), 'maths')).toBe('math')
  })

  it('refuses an empty question', () => {
    expect(rejectReason(mcq({ text: '   ' }), 'maths')).toBe('empty')
  })
})

describe('toHiringItem', () => {
  it('turns an MCQ into the bank shape, options keyed by letter', () => {
    expect(toHiringItem(mcq({ options: opts('C') }), 'maths', 'nda')).toEqual({
      source_ref: 'q1',
      source: 'nda',
      paper: 'NDA (I) 2024',
      // (the note names exam and year, so it stands alone)
      subject: 'maths',
      chapter: 'Algebra',
      format: 'mcq',
      direction: null,
      stem: String.raw`If \(x = 2\), find \(x^2\).`,
      options: { A: 'option A', B: 'option B', C: 'option C', D: 'option D' },
      answer_key: 'C',
      numeric_answer: null,
    })
  })

  it('carries a typed answer as a number and no options', () => {
    expect(toHiringItem(numeric({ numeric_answer: '42' }), 'physics', 'jee-mains')).toMatchObject({
      format: 'numeric',
      options: null,
      answer_key: null,
      numeric_answer: 42,
    })
  })

  it('keeps an English direction, trimmed', () => {
    expect(toHiringItem(mcq({ context: '  Directions: spot the error. ' }), 'english', 'cds').direction).toBe(
      'Directions: spot the error.',
    )
  })

  it('names the paper from the year when PYQ Vault has no note', () => {
    expect(toHiringItem(mcq({ pyq_note: null, pyq_year: 2019 }), 'maths', 'nda').paper).toBe('NDA 2019')
    expect(toHiringItem(mcq({ pyq_note: null, pyq_year: null }), 'maths', 'nda').paper).toBe('NDA')
  })

  // PYQ Vault's note is a sitting label whose form varies by exam.
  it('leads with the exam and year, then the note', () => {
    const paper = (note: string, year: number, source: 'nda' | 'mht-cet' | 'jee-mains' | 'cds') =>
      toHiringItem(mcq({ pyq_note: note, pyq_year: year }), 'maths', source).paper
    expect(paper('21 April Shift I', 2025, 'mht-cet')).toBe('MHT-CET 2025 · 21 April Shift I')
    expect(paper('Paper 25', 2024, 'jee-mains')).toBe('JEE Mains 2024 · Paper 25')
    expect(paper('NDA 1', 2019, 'nda')).toBe('NDA 2019 · NDA 1')
    // The note already holds the year: not repeated.
    expect(paper('29 January 2023', 2023, 'jee-mains')).toBe('JEE Mains · 29 January 2023')
    // The note already names exam and year: the note alone.
    expect(paper('CDS (II) 2023 — English', 2023, 'cds')).toBe('CDS (II) 2023 — English')
  })
})

describe('lintHiringBank', () => {
  const item = (over: Partial<HiringItem> = {}): HiringItem => ({
    source_ref: 'r1',
    source: 'nda',
    paper: 'NDA 2024',
    subject: 'maths',
    chapter: 'Algebra',
    format: 'mcq',
    direction: null,
    stem: String.raw`Find \(x\).`,
    options: { A: '1', B: '2', C: '3', D: '4' },
    answer_key: 'A',
    numeric_answer: null,
    ...over,
  })
  // Exactly what every paper needs, so the coverage rule is quiet.
  const full = (): HiringItem[] =>
    HIRING_SUBJECTS.flatMap((subject) =>
      (['mcq', 'numeric'] as const).flatMap((format) =>
        Array.from({ length: HIRING_SHAPE[subject][format] }, (_, i) =>
          item({
            source_ref: `${subject}-${format}-${i}`,
            subject,
            source: subject === 'english' ? 'cds' : format === 'numeric' ? 'jee-mains' : subject === 'maths' ? 'nda' : 'mht-cet',
            format,
            options: format === 'mcq' ? { A: '1', B: '2', C: '3', D: '4' } : null,
            answer_key: format === 'mcq' ? 'A' : null,
            numeric_answer: format === 'numeric' ? 7 : null,
          }),
        ),
      ),
    )

  it('passes a bank that can fill every paper', () => {
    expect(lintHiringBank(full())).toEqual([])
  })

  it('names a subject that cannot fill its paper', () => {
    const bank = full().filter((i) => !(i.subject === 'physics' && i.format === 'numeric' && i.source_ref.endsWith('-0')))
    expect(lintHiringBank(bank)).toEqual(['physics: 2 typed-answer questions, the paper needs 3'])
  })

  it('does not count retired questions towards a paper', () => {
    const bank = full().map((i) => (i.source_ref === 'english-mcq-0' ? { ...i, status: 'retired' as const } : i))
    expect(lintHiringBank(bank)).toEqual(['english: 14 MCQ questions, the paper needs 15'])
  })

  it('refuses a repeated reference', () => {
    expect(lintHiringBank([...full(), item({ source_ref: 'maths-mcq-0' })])).toContain('maths-mcq-0: listed twice')
  })

  it('refuses a broken shape, a source the subject does not use, and maths KaTeX cannot draw', () => {
    const errors = lintHiringBank([
      ...full(),
      item({ source_ref: 'x1', options: { A: '1', B: '2', C: '3', D: '' } }),
      item({ source_ref: 'x2', format: 'numeric', options: null, answer_key: null, numeric_answer: 2.5, source: 'jee-mains' }),
      item({ source_ref: 'x3', source: 'cds' }),
      item({ source_ref: 'x4', direction: 'Directions: none here.' }),
      item({ source_ref: 'x5', stem: String.raw`\(\frac{1}{\)` }),
    ])
    expect(errors).toEqual([
      'x1: an MCQ needs four options and a key',
      'x2: a typed answer must be a whole number from 0 to 9999',
      'x3: maths MCQ comes from nda, not cds',
      'x4: only English carries a direction',
      expect.stringMatching(/^x5: maths KaTeX cannot draw/),
    ])
  })
})

describe('pickPool', () => {
  const rows = (chapter: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ source_ref: `${chapter}-${i}`, chapter }))
  const candidates = [...rows('Algebra', 60), ...rows('Calculus', 30), ...rows('Trigonometry', 10)]

  it('takes exactly n, with no repeats', () => {
    const picked = pickPool(candidates, 50, 'seed')
    expect(picked).toHaveLength(50)
    expect(new Set(picked.map((p) => p.source_ref)).size).toBe(50)
  })

  it('spreads across chapters in proportion to the source', () => {
    const picked = pickPool(candidates, 50, 'seed')
    const count = (c: string) => picked.filter((p) => p.chapter === c).length
    expect([count('Algebra'), count('Calculus'), count('Trigonometry')]).toEqual([30, 15, 5])
  })

  it('is the same pick for the same seed, and a different one for another', () => {
    const ids = (seed: string) => pickPool(candidates, 50, seed).map((p) => p.source_ref)
    expect(ids('a')).toEqual(ids('a'))
    expect(ids('a')).not.toEqual(ids('b'))
  })

  it('takes everything when the source has fewer than n', () => {
    expect(pickPool(candidates, 500, 'seed')).toHaveLength(100)
  })

  it('lists the pick by chapter, then by reference, so a re-import diffs cleanly', () => {
    const picked = pickPool(candidates, 20, 'seed')
    const keys = picked.map((p) => `${p.chapter}\u0000${p.source_ref}`)
    expect(keys).toEqual([...keys].sort())
  })
})
