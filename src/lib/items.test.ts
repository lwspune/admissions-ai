import { describe, it, expect } from 'vitest'
import { resolveSeedStatus, groupBank, keySkew, notEnglish, type ItemStatus } from './items'
import { SUBJECTS, DIFFICULTIES, type Subject, type Difficulty } from './types'

const row = (ref: string | null, subject: Subject, difficulty: Difficulty) =>
  ({ ref, subject, difficulty }) as const

// The bank browser groups by subject and difficulty. Empty groups are kept on
// purpose: "science / difficult: 0" is the most useful thing the page can say
// to whoever is deciding what to author next, and a group that vanishes when
// empty says nothing at all.
describe('groupBank', () => {
  it('returns every subject-difficulty pair even when the bank is empty', () => {
    const groups = groupBank([])
    expect(groups).toHaveLength(SUBJECTS.length * DIFFICULTIES.length)
    expect(groups.every((g) => g.items.length === 0)).toBe(true)
  })

  it('orders groups by subject, then by difficulty', () => {
    const groups = groupBank([])
    expect(groups.map((g) => `${g.subject}/${g.difficulty}`)).toEqual([
      'maths/easy', 'maths/moderate', 'maths/difficult',
      'english/easy', 'english/moderate', 'english/difficult',
      'science/easy', 'science/moderate', 'science/difficult',
    ])
  })

  it('files each item under its own subject and difficulty', () => {
    const groups = groupBank([row('M-E-01', 'maths', 'easy'), row('S-D-05', 'science', 'difficult')])
    const find = (s: string) => groups.find((g) => `${g.subject}/${g.difficulty}` === s)!
    expect(find('maths/easy').items.map((i) => i.ref)).toEqual(['M-E-01'])
    expect(find('science/difficult').items.map((i) => i.ref)).toEqual(['S-D-05'])
    expect(find('english/easy').items).toEqual([])
  })

  it('sorts items by ref inside a group', () => {
    const groups = groupBank([
      row('M-E-13', 'maths', 'easy'),
      row('M-E-02', 'maths', 'easy'),
      row('M-E-07', 'maths', 'easy'),
    ])
    expect(groups[0]!.items.map((i) => i.ref)).toEqual(['M-E-02', 'M-E-07', 'M-E-13'])
  })

  it('puts items with no ref last rather than dropping them', () => {
    const groups = groupBank([row(null, 'maths', 'easy'), row('M-E-01', 'maths', 'easy')])
    expect(groups[0]!.items.map((i) => i.ref)).toEqual(['M-E-01', null])
  })

  it('loses nothing', () => {
    const items = [
      row('M-E-01', 'maths', 'easy'),
      row('E-M-04', 'english', 'moderate'),
      row('S-D-05', 'science', 'difficult'),
      row(null, 'english', 'easy'),
    ]
    expect(groupBank(items).flatMap((g) => g.items)).toHaveLength(items.length)
  })
})

// Regression: a plain `npm run items:seed` used to write status='review' on
// every row it upserted, which silently demoted the entire live bank and left
// nothing drawable. Issuing a test in production would have failed with no
// error pointing at the seed. Re-seeding must never take an item out of
// circulation; only an explicit promotion may change status.
describe('resolveSeedStatus', () => {
  it('leaves a live item live when re-seeding without a promotion', () => {
    expect(resolveSeedStatus({ current: 'live', promote: false })).toBe('live')
  })

  it('leaves a retired item retired when re-seeding without a promotion', () => {
    expect(resolveSeedStatus({ current: 'retired', promote: false })).toBe('retired')
  })

  it('starts a brand new item at review', () => {
    expect(resolveSeedStatus({ current: null, promote: false })).toBe('review')
  })

  it('keeps an unreviewed item at review', () => {
    expect(resolveSeedStatus({ current: 'review', promote: false })).toBe('review')
  })

  it('promotes to live only when explicitly asked', () => {
    expect(resolveSeedStatus({ current: 'review', promote: true })).toBe('live')
    expect(resolveSeedStatus({ current: null, promote: true })).toBe('live')
  })

  it('can bring a retired item back, since promotion is a deliberate act', () => {
    expect(resolveSeedStatus({ current: 'retired', promote: true })).toBe('live')
  })

  it('retires an item its file marks retired, even inside a promoted batch', () => {
    // A batch is promoted as a whole; an item withdrawn from it must not come back with it.
    for (const current of ['live', 'review', null] as const) {
      expect(resolveSeedStatus({ current, promote: true, retired: true })).toBe('retired')
      expect(resolveSeedStatus({ current, promote: false, retired: true })).toBe('retired')
    }
  })

  it('never invents a status outside the database CHECK', () => {
    const allowed: ItemStatus[] = ['review', 'live', 'retired']
    const currents: (ItemStatus | null)[] = ['review', 'live', 'retired', null]
    for (const current of currents) {
      for (const promote of [true, false]) {
        expect(allowed).toContain(resolveSeedStatus({ current, promote }))
      }
    }
  })
})

describe('inPromotionScope', () => {
  it('promotes everything when no batch is named', () => {
    expect(inPromotionScopeHelper('a.json', undefined)).toBe(true)
    expect(inPromotionScopeHelper('b.json', undefined)).toBe(true)
  })

  it('promotes only the named batch', () => {
    expect(inPromotionScopeHelper('legacy-iq-2025.json', 'legacy-iq-2025.json')).toBe(true)
    expect(inPromotionScopeHelper('calibration-batch.json', 'legacy-iq-2025.json')).toBe(false)
  })

  it('accepts the batch name without its extension', () => {
    expect(inPromotionScopeHelper('legacy-iq-2025.json', 'legacy-iq-2025')).toBe(true)
  })
})

// Imported separately so the describe blocks above read as behaviour, not plumbing.
import { inPromotionScope as inPromotionScopeHelper, parseOptionValue } from './items'

// Two options that differ as text but not as quantity are both wrong answers a
// candidate can eliminate together, and if one of them is the key the item has
// two correct answers. The string-equality check in items-lint cannot see it.
describe('parseOptionValue', () => {
  it('reduces fractions to a comparable value', () => {
    expect(parseOptionValue('2/3')).toEqual(parseOptionValue('4/6'))
    expect(parseOptionValue('1/2')).not.toEqual(parseOptionValue('2/3'))
  })

  it('ignores thousands separators', () => {
    expect(parseOptionValue('2,500')).toEqual(parseOptionValue('2500'))
  })

  it('keeps a unit as part of the identity, so 80 m never equals 80 kg', () => {
    expect(parseOptionValue('80 m')).not.toEqual(parseOptionValue('80 kg'))
    expect(parseOptionValue('80 m')).toEqual(parseOptionValue('80m'))
  })

  it('treats a percentage as its own unit', () => {
    expect(parseOptionValue('25%')).toEqual(parseOptionValue('25 %'))
    expect(parseOptionValue('25%')).not.toEqual(parseOptionValue('25'))
  })

  it('refuses anything carrying words, so 4% less never collides with 4% more', () => {
    expect(parseOptionValue('4% less')).toBeNull()
    expect(parseOptionValue('4% more')).toBeNull()
    expect(parseOptionValue('the same')).toBeNull()
    expect(parseOptionValue('7 minutes')).toBeNull()
  })

  it('refuses a fraction with a zero denominator rather than returning Infinity', () => {
    expect(parseOptionValue('3/0')).toBeNull()
  })

  it('refuses plain text', () => {
    expect(parseOptionValue('Thursday')).toBeNull()
    expect(parseOptionValue('BROWN')).toBeNull()
    expect(parseOptionValue('4-15-7')).toBeNull()
  })
})

// Per-class coverage. Filtering the draw by class splits every stratum, and
// the class that loses is the one whose candidate sees a 500. This is the
// number the lint and the bank page both read; it has to be right in one place.
import { coverageByClass, thirtyReadiness } from './items'
import type { Part } from './types'
import { CLASSES } from './classes'
import { PAPER_MIX } from './types'

describe('coverageByClass', () => {
  const item = (subject: Subject, difficulty: Difficulty, taught_in: number) => ({ subject, difficulty, taught_in })

  /** `per` items in every stratum, all tagged `taught_in`. */
  const bank = (per: number, taught_in = 6) => {
    const out = []
    for (const s of SUBJECTS) for (const d of DIFFICULTIES) for (let n = 0; n < per; n++) out.push(item(s, d, taught_in))
    return out
  }

  const cell = (cells: ReturnType<typeof coverageByClass>, c: number, s: Subject, d: Difficulty) =>
    cells.find((x) => x.classLevel === c && x.subject === s && x.difficulty === d)!

  it('reports every class × subject × difficulty, classes outermost', () => {
    const cells = coverageByClass([])
    expect(cells).toHaveLength(CLASSES.length * SUBJECTS.length * DIFFICULTIES.length)
    expect(cells.slice(0, 9).every((c) => c.classLevel === CLASSES[0])).toBe(true)
    expect(cells.map((c) => c.classLevel)).toEqual([...cells.map((c) => c.classLevel)].sort((a, b) => a - b))
  })

  it('counts only items taught at or below the class ceiling', () => {
    const cells = coverageByClass([
      item('maths', 'easy', 6),
      item('maths', 'easy', 8),
      item('maths', 'easy', 9),
      item('maths', 'easy', 11),
    ])
    expect(cell(cells, 9, 'maths', 'easy').count).toBe(2)
    expect(cell(cells, 10, 'maths', 'easy').count).toBe(3)
    expect(cell(cells, 11, 'maths', 'easy').count).toBe(3)
    expect(cell(cells, 12, 'maths', 'easy').count).toBe(4)
  })

  it('carries the paper need for each difficulty', () => {
    const cells = coverageByClass([])
    expect(cell(cells, 9, 'maths', 'easy').needed).toBe(PAPER_MIX.easy)
    expect(cell(cells, 9, 'maths', 'moderate').needed).toBe(PAPER_MIX.moderate)
    expect(cell(cells, 9, 'maths', 'difficult').needed).toBe(PAPER_MIX.difficult)
  })

  it('marks a stratum short when a paper cannot be filled', () => {
    const cells = coverageByClass(bank(2))
    expect(cell(cells, 9, 'maths', 'easy').status).toBe('short')
    expect(cell(cells, 9, 'maths', 'moderate').status).toBe('ok')
  })

  it('marks a stratum thin when every paper would draw the same items', () => {
    // Exactly the need in each stratum: every class-9 paper is the same paper.
    const exact = []
    for (const s of SUBJECTS) for (const d of DIFFICULTIES) for (let n = 0; n < PAPER_MIX[d]; n++) exact.push(item(s, d, 6))
    const cells = coverageByClass(exact)
    expect(cell(cells, 9, 'maths', 'easy').status).toBe('thin')
    expect(cell(cells, 9, 'maths', 'moderate').status).toBe('thin')
    expect(cells.every((c) => c.status === 'thin')).toBe(true)
  })

  it('marks a stratum ok at double the need or more', () => {
    const cells = coverageByClass(bank(6))
    expect(cells.every((c) => c.status === 'ok')).toBe(true)
  })

  it('is per class: a bank tagged at class 9 strands class 9 and serves class 10', () => {
    const cells = coverageByClass(bank(6, 9))
    expect(cells.filter((c) => c.classLevel === 9).every((c) => c.status === 'short')).toBe(true)
    expect(cells.filter((c) => c.classLevel === 10).every((c) => c.status === 'ok')).toBe(true)
  })
})

// 2026-10-06: 73% of keys were A (science 27 of 28), so answering A to every
// question scored about 9 of 15. Options are served in authored order, so the
// key position is what the candidate sees.
describe('keySkew', () => {
  const mcq = (subject: Subject, answer_key: string) => ({ subject, format: 'mcq', answer_key })
  const keys = (subject: Subject, letters: string) => [...letters].map((k) => mcq(subject, k))

  it('passes a subject whose keys are spread', () => {
    expect(keySkew(keys('science', 'ABCDABCDAB'))).toEqual([])
  })

  it('flags a subject where one letter holds more than 40% of the keys', () => {
    const skew = keySkew(keys('science', 'AAAAABCDAB'))
    expect(skew).toEqual([{ subject: 'science', letter: 'A', count: 6, total: 10 }])
  })

  it('judges each subject on its own keys', () => {
    const skew = keySkew([...keys('maths', 'ABCDABCD'), ...keys('english', 'BBBBBBAC')])
    expect(skew.map((s) => s.subject)).toEqual(['english'])
  })

  it('ignores numeric items and subjects too small to judge', () => {
    const numeric = Array.from({ length: 20 }, () => ({ subject: 'maths' as Subject, format: 'numeric', answer_key: null }))
    expect(keySkew([...numeric, ...keys('maths', 'AAAA')])).toEqual([])
  })
})

// ── the 30-question paper (2026-10-06) ───────────────────────────────────────

describe('coverageByClass — basics only', () => {
  it('does not count syllabus items toward the 15-question fallback', () => {
    const cells = coverageByClass([
      { subject: 'maths' as Subject, difficulty: 'easy' as Difficulty, taught_in: 8, part: 'syllabus' as const },
      { subject: 'maths' as Subject, difficulty: 'easy' as Difficulty, taught_in: 8, part: 'basics' as const },
    ])
    expect(cells.find((c) => c.classLevel === 9 && c.subject === 'maths' && c.difficulty === 'easy')!.count).toBe(1)
  })
})

describe('thirtyReadiness', () => {
  type Row = { subject: Subject; difficulty: Difficulty; taught_in: number; part: Part; term: number | null }
  const many = (n: number, row: Row): Row[] => Array.from({ length: n }, () => ({ ...row }))

  /** Enough basics for every class, plus first-term class 9 syllabus. */
  function bankFor10(): Row[] {
    const out: Row[] = []
    for (const subject of SUBJECTS) {
      out.push(...many(6, { subject, difficulty: 'easy', taught_in: 6, part: 'basics', term: null }))
      out.push(...many(2, { subject, difficulty: 'moderate', taught_in: 6, part: 'basics', term: null }))
      out.push(...many(2, { subject, difficulty: 'difficult', taught_in: 6, part: 'basics', term: null }))
    }
    for (const subject of ['maths', 'science'] as Subject[]) {
      out.push(...many(3, { subject, difficulty: 'easy', taught_in: 9, part: 'syllabus', term: 1 }))
      out.push(...many(1, { subject, difficulty: 'moderate', taught_in: 9, part: 'syllabus', term: 1 }))
      out.push(...many(1, { subject, difficulty: 'difficult', taught_in: 9, part: 'syllabus', term: 1 }))
    }
    return out
  }

  const forClass = (rows: Row[], c: number) => thirtyReadiness(rows).find((r) => r.classLevel === c)!

  it('marks a class ready when every quota of the 30-question paper fills', () => {
    expect(forClass(bankFor10(), 10).ready).toBe(true)
    expect(forClass(bankFor10(), 10).missing).toEqual([])
  })

  it('leaves the other classes on 15 questions: syllabus is exactly class N−1', () => {
    expect(forClass(bankFor10(), 11).ready).toBe(false)
    expect(forClass(bankFor10(), 9).ready).toBe(false)
  })

  it('names what is missing', () => {
    const rows = bankFor10().filter((r) => !(r.part === 'syllabus' && r.subject === 'science' && r.difficulty === 'difficult'))
    expect(forClass(rows, 10).missing).toEqual([
      { subject: 'science', part: 'syllabus', difficulty: 'difficult', count: 0, needed: 1 },
    ])
  })

  it('does not count second-term syllabus items', () => {
    const rows = bankFor10().map((r) => (r.part === 'syllabus' ? { ...r, term: 2 } : r))
    expect(forClass(rows, 10).ready).toBe(false)
  })
})

// The spec's English is language: vocabulary, grammar, sentences, reading, and
// verbal patterns. Syllogisms, seating and family-relation puzzles crept in
// under English as "logical deduction"; the user moved them out (2026-10-07).
describe('notEnglish', () => {
  it('flags a logic-puzzle skill filed under English', () => {
    for (const skill of ['syllogism', 'logical-deduction', 'quantifier-logic', 'relationship-reasoning']) {
      expect(notEnglish('english', skill)).toBe(true)
    }
  })

  it('passes language and verbal-pattern skills, and any skill in another subject', () => {
    for (const skill of ['synonym-in-context', 'error-identification', 'reading-inference', 'analogy', 'letter-series']) {
      expect(notEnglish('english', skill)).toBe(false)
    }
    expect(notEnglish('maths', 'logical-deduction')).toBe(false)
  })
})
