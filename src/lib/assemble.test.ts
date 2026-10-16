import { describe, it, expect } from 'vitest'
import { assemblePaper, assembleForAnswerSheet, choosePaperShape, StratumExhaustedError, type PoolItem } from './assemble'
import { SUBJECTS, SHAPE_15, SHAPE_30, type Difficulty, type Subject, type Part } from './types'

// ── helpers ──────────────────────────────────────────────────────────────────

/** A bank with `per` items in every (subject, difficulty) stratum. */
function pool(per: number): PoolItem[] {
  const out: PoolItem[] = []
  for (const subject of SUBJECTS) {
    for (const difficulty of ['easy', 'moderate', 'difficult'] as Difficulty[]) {
      for (let n = 0; n < per; n++) out.push({ id: `${subject}-${difficulty}-${n}`, subject, difficulty, part: 'basics' })
    }
  }
  return out
}

/** Deterministic rng so a failing draw is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const countBy = (items: PoolItem[], subject: Subject, difficulty: Difficulty) =>
  items.filter((i) => i.subject === subject && i.difficulty === difficulty).length

// ── composition ──────────────────────────────────────────────────────────────

describe('assemblePaper — composition', () => {
  it('draws exactly 15 items', () => {
    expect(assemblePaper({ pool: pool(20), rng: seeded(1) })).toHaveLength(15)
  })

  it('draws 3 easy, 1 moderate and 1 difficult per subject', () => {
    const paper = assemblePaper({ pool: pool(20), rng: seeded(2) })
    for (const subject of SUBJECTS) {
      expect(countBy(paper, subject, 'easy')).toBe(3)
      expect(countBy(paper, subject, 'moderate')).toBe(1)
      expect(countBy(paper, subject, 'difficult')).toBe(1)
    }
  })

  it('draws 5 items for each subject', () => {
    const paper = assemblePaper({ pool: pool(20), rng: seeded(3) })
    for (const subject of SUBJECTS) {
      expect(paper.filter((i) => i.subject === subject)).toHaveLength(5)
    }
  })

  it('never repeats an item within a paper', () => {
    const paper = assemblePaper({ pool: pool(6), rng: seeded(4) })
    expect(new Set(paper.map((i) => i.id)).size).toBe(15)
  })

  it('holds the composition regardless of seed', () => {
    for (let seed = 0; seed < 25; seed++) {
      const paper = assemblePaper({ pool: pool(20), rng: seeded(seed) })
      expect(paper).toHaveLength(15)
      for (const subject of SUBJECTS) {
        expect(countBy(paper, subject, 'easy')).toBe(3)
      }
    }
  })
})

// ── mixed order (spec §1: interleaved, not sectioned) ────────────────────────

describe('assemblePaper — ordering', () => {
  it('interleaves subjects rather than grouping them in blocks', () => {
    // A sectioned paper would give exactly 2 subject changes across 15 items.
    const paper = assemblePaper({ pool: pool(20), rng: seeded(7) })
    let changes = 0
    for (let n = 1; n < paper.length; n++) {
      if (paper[n]!.subject !== paper[n - 1]!.subject) changes++
    }
    expect(changes).toBeGreaterThan(5)
  })

  it('is deterministic for a given rng — the same seed draws the same paper', () => {
    const a = assemblePaper({ pool: pool(20), rng: seeded(11) })
    const b = assemblePaper({ pool: pool(20), rng: seeded(11) })
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id))
  })

  it('draws different papers for different seeds', () => {
    const a = assemblePaper({ pool: pool(40), rng: seeded(12) })
    const b = assemblePaper({ pool: pool(40), rng: seeded(13) })
    expect(a.map((i) => i.id)).not.toEqual(b.map((i) => i.id))
  })
})

// ── exclusions (reissue draws a fresh paper, spec §4) ────────────────────────

describe('assemblePaper — exclusions', () => {
  it('excludes items the lead has already seen', () => {
    const bank = pool(20)
    // Spread the exclusions across every stratum. Taking a contiguous slice
    // would empty one stratum outright and assert exhaustion instead.
    const seen = bank.filter((_, n) => n % 5 === 0).map((i) => i.id)
    expect(seen.length).toBeGreaterThan(0)
    const paper = assemblePaper({ pool: bank, excludeItemIds: seen, rng: seeded(5) })
    expect(paper.some((i) => seen.includes(i.id))).toBe(false)
    expect(paper).toHaveLength(15)
  })

  it('still composes correctly when exclusions thin the pool', () => {
    const bank = pool(8)
    // Remove 4 of every 8 items in each stratum.
    const seen = bank.filter((_, n) => n % 2 === 0).map((i) => i.id)
    const paper = assemblePaper({ pool: bank, excludeItemIds: seen, rng: seeded(6) })
    expect(paper).toHaveLength(15)
    for (const subject of SUBJECTS) {
      expect(countBy(paper, subject, 'easy')).toBe(3)
    }
  })

  it('treats an empty exclusion list the same as none', () => {
    const a = assemblePaper({ pool: pool(20), excludeItemIds: [], rng: seeded(9) })
    const b = assemblePaper({ pool: pool(20), rng: seeded(9) })
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id))
  })
})

// ── exhaustion must fail loudly, not silently short a paper ──────────────────

describe('assemblePaper — exhausted strata', () => {
  it('throws when a stratum cannot fill the required count', () => {
    const bank = pool(20).filter((i) => !(i.subject === 'science' && i.difficulty === 'easy'))
    expect(() => assemblePaper({ pool: bank, rng: seeded(8) })).toThrow(StratumExhaustedError)
  })

  it('names the subject, difficulty, need and availability in the error', () => {
    // Only 2 easy science items exist; the paper needs 3.
    const bank = pool(20).filter(
      (i) => !(i.subject === 'science' && i.difficulty === 'easy' && Number(i.id.split('-')[2]) >= 2),
    )
    let caught: StratumExhaustedError | null = null
    try {
      assemblePaper({ pool: bank, rng: seeded(8) })
    } catch (e) {
      caught = e as StratumExhaustedError
    }
    expect(caught).toBeInstanceOf(StratumExhaustedError)
    expect(caught!.subject).toBe('science')
    expect(caught!.difficulty).toBe('easy')
    expect(caught!.needed).toBe(3)
    expect(caught!.available).toBe(2)
    expect(caught!.message).toMatch(/science/i)
  })

  it('falls back to seen items rather than failing when a stratum is all-seen', () => {
    // A reissue that repeats a question beats no reissue at all. Failing here
    // would put a 500 in front of staff whenever the bank is thin.
    const bank = pool(3)
    const seen = bank.filter((i) => i.subject === 'maths' && i.difficulty === 'difficult').map((i) => i.id)
    const paper = assemblePaper({ pool: bank, excludeItemIds: seen, rng: seeded(10) })
    expect(paper).toHaveLength(15)
    expect(paper.filter((i) => i.subject === 'maths' && i.difficulty === 'difficult')).toHaveLength(1)
  })

  it('still prefers unseen items when some remain', () => {
    const bank = pool(20)
    const seen = bank.filter((_, n) => n % 5 === 0).map((i) => i.id)
    const paper = assemblePaper({ pool: bank, excludeItemIds: seen, rng: seeded(15) })
    expect(paper.some((i) => seen.includes(i.id))).toBe(false)
  })

  it('can still draw when every item in the bank has been seen', () => {
    // The live bank is exactly one paper today, so a reissue is all-repeats.
    // It must produce a full paper rather than failing.
    const bank: PoolItem[] = []
    for (const subject of SUBJECTS) {
      for (let n = 0; n < 3; n++) bank.push({ id: `${subject}-e-${n}`, subject, difficulty: 'easy', part: 'basics' })
      bank.push({ id: `${subject}-m`, subject, difficulty: 'moderate', part: 'basics' })
      bank.push({ id: `${subject}-d`, subject, difficulty: 'difficult', part: 'basics' })
    }
    const paper = assemblePaper({ pool: bank, excludeItemIds: bank.map((i) => i.id), rng: seeded(16) })
    expect(paper).toHaveLength(15)
  })
  it('throws on an empty pool rather than returning an empty paper', () => {
    expect(() => assemblePaper({ pool: [], rng: seeded(1) })).toThrow(StratumExhaustedError)
  })

  it('succeeds on a pool holding exactly the minimum', () => {
    const bank: PoolItem[] = []
    for (const subject of SUBJECTS) {
      for (let n = 0; n < 3; n++) bank.push({ id: `${subject}-e-${n}`, subject, difficulty: 'easy', part: 'basics' })
      bank.push({ id: `${subject}-m`, subject, difficulty: 'moderate', part: 'basics' })
      bank.push({ id: `${subject}-d`, subject, difficulty: 'difficult', part: 'basics' })
    }
    expect(assemblePaper({ pool: bank, rng: seeded(14) })).toHaveLength(15)
  })
})

// ── spread across the bank ───────────────────────────────────────────────────

describe('assemblePaper — spread', () => {
  it('does not keep returning the same items across many draws', () => {
    // With 100 per subject the bank should turn over, not cycle in lockstep.
    const bank = pool(34)
    const seen = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      for (const item of assemblePaper({ pool: bank, rng: seeded(seed) })) seen.add(item.id)
    }
    expect(seen.size).toBeGreaterThan(100)
  })

  it('gives two candidates papers that barely overlap', () => {
    const bank = pool(34) // ~100 items per subject
    const a = assemblePaper({ pool: bank, rng: seeded(21) })
    const b = assemblePaper({ pool: bank, rng: seeded(22) })
    const overlap = a.filter((i) => b.some((j) => j.id === i.id)).length
    expect(overlap).toBeLessThanOrEqual(3)
  })
})

// When the pool has already been filtered by class, the error has to say so,
// or whoever reads it goes looking at the bank total instead of the stratum
// that class actually has.
describe('assemblePaper — class in the error', () => {
  it('names the class a starved stratum was drawn for', () => {
    const thin = pool(20).filter((i) => !(i.subject === 'english' && i.difficulty === 'difficult'))
    expect(() => assemblePaper({ pool: thin, rng: seeded(1), forClass: 9 })).toThrow(/class 9/)
  })

  it('says nothing about class when none was given', () => {
    const thin = pool(20).filter((i) => !(i.subject === 'english' && i.difficulty === 'difficult'))
    expect(() => assemblePaper({ pool: thin, rng: seeded(1) })).toThrow(StratumExhaustedError)
    expect(() => assemblePaper({ pool: thin, rng: seeded(1) })).not.toThrow(/class/)
  })
})

// ── the 30-question paper (2026-10-06) ───────────────────────────────────────

/** Basics in every subject plus class-syllabus items in maths and science. */
function fullPool(per: number): PoolItem[] {
  const out = pool(per)
  for (const subject of ['maths', 'science'] as Subject[]) {
    for (const difficulty of ['easy', 'moderate', 'difficult'] as Difficulty[]) {
      for (let n = 0; n < per; n++) {
        out.push({ id: `syl-${subject}-${difficulty}-${n}`, subject, difficulty, part: 'syllabus' })
      }
    }
  }
  return out
}

const countPart = (items: PoolItem[], subject: Subject, part: Part, difficulty?: Difficulty) =>
  items.filter((i) => i.subject === subject && i.part === part && (!difficulty || i.difficulty === difficulty)).length

describe('paper shapes', () => {
  it('the 15-question shape is 15 questions in 15 minutes', () => {
    expect(SHAPE_15.quotas.reduce((n, q) => n + q.count, 0)).toBe(15)
    expect(SHAPE_15.questions).toBe(15)
    expect(SHAPE_15.minutes).toBe(15)
  })

  it('the 30-question shape is 30 questions in 30 minutes', () => {
    expect(SHAPE_30.quotas.reduce((n, q) => n + q.count, 0)).toBe(30)
    expect(SHAPE_30.questions).toBe(30)
    expect(SHAPE_30.minutes).toBe(30)
  })
})

describe('assemblePaper — 30-question shape', () => {
  it('draws 10 per subject: English all basics, maths and science half syllabus', () => {
    const paper = assemblePaper({ pool: fullPool(20), shape: SHAPE_30, rng: seeded(31) })
    expect(paper).toHaveLength(30)
    expect(countPart(paper, 'english', 'basics')).toBe(10)
    expect(countPart(paper, 'english', 'syllabus')).toBe(0)
    for (const subject of ['maths', 'science'] as Subject[]) {
      expect(countPart(paper, subject, 'basics')).toBe(5)
      expect(countPart(paper, subject, 'syllabus')).toBe(5)
    }
  })

  it('keeps each part at its own difficulty mix', () => {
    const paper = assemblePaper({ pool: fullPool(20), shape: SHAPE_30, rng: seeded(32) })
    expect(countPart(paper, 'english', 'basics', 'easy')).toBe(6)
    expect(countPart(paper, 'english', 'basics', 'moderate')).toBe(2)
    expect(countPart(paper, 'english', 'basics', 'difficult')).toBe(2)
    for (const subject of ['maths', 'science'] as Subject[]) {
      for (const part of ['basics', 'syllabus'] as Part[]) {
        expect(countPart(paper, subject, part, 'easy')).toBe(3)
        expect(countPart(paper, subject, part, 'moderate')).toBe(1)
        expect(countPart(paper, subject, part, 'difficult')).toBe(1)
      }
    }
  })

  it('never fills a basics quota with a syllabus item', () => {
    // A pool with syllabus items only for maths: the 15-question paper must
    // still draw its maths from basics.
    const paper = assemblePaper({ pool: fullPool(20), shape: SHAPE_15, rng: seeded(33) })
    expect(paper.every((i) => i.part === 'basics')).toBe(true)
  })

  it('mixes the two parts through the paper rather than putting syllabus last', () => {
    const paper = assemblePaper({ pool: fullPool(20), shape: SHAPE_30, rng: seeded(34) })
    const firstHalf = paper.slice(0, 15).filter((i) => i.part === 'syllabus').length
    expect(firstHalf).toBeGreaterThan(0)
    expect(firstHalf).toBeLessThan(10)
  })

  it('names the part of a starved stratum', () => {
    const thin = fullPool(20).filter((i) => !(i.part === 'syllabus' && i.subject === 'science' && i.difficulty === 'difficult'))
    expect(() => assemblePaper({ pool: thin, shape: SHAPE_30, rng: seeded(35) })).toThrow(/syllabus/)
  })
})

// A class moves to 30 questions only when its syllabus batch is live; until
// then it keeps the 15-question paper (decision 2026-10-06).
describe('choosePaperShape', () => {
  it('gives the 30-question shape when every quota can be filled', () => {
    expect(choosePaperShape(fullPool(20))).toBe(SHAPE_30)
  })

  it('falls back to 15 questions when the class has no syllabus items', () => {
    expect(choosePaperShape(pool(20))).toBe(SHAPE_15)
  })

  it('falls back when one syllabus stratum is short', () => {
    const thin = fullPool(20).filter((i) => !(i.part === 'syllabus' && i.subject === 'science' && i.difficulty === 'difficult'))
    expect(choosePaperShape(thin)).toBe(SHAPE_15)
  })

  it('falls back when English basics cannot fill 6 easy for the longer paper', () => {
    const thin = fullPool(20).filter((i) => !(i.subject === 'english' && i.difficulty === 'easy' && Number(i.id.split('-')[2]) >= 5))
    expect(choosePaperShape(thin)).toBe(SHAPE_15)
  })
})

describe('assembleForAnswerSheet', () => {
  // A paper test's OMR sheet has a fixed number of numeric boxes (2026-10-16),
  // so its draw is redrawn until it fits — the same shape, the same rules.
  const withFormats = (items: PoolItem[], numeric: (i: PoolItem, n: number) => boolean): PoolItem[] =>
    items.map((i, n) => ({ ...i, format: numeric(i, n) ? 'numeric' : 'mcq' }))
  const numericCount = (paper: PoolItem[]) => paper.filter((i) => i.format === 'numeric').length

  it('keeps the numeric questions within the sheet, and the paper its shape', () => {
    const items = withFormats(fullPool(20), (i, n) => i.subject !== 'english' && n % 2 === 0)
    for (let seed = 1; seed <= 20; seed++) {
      const paper = assembleForAnswerSheet({ pool: items, shape: SHAPE_30, rng: seeded(seed), maxNumeric: 8 })
      expect(paper).toHaveLength(30)
      expect(numericCount(paper)).toBeLessThanOrEqual(8)
      expect(countPart(paper, 'maths', 'syllabus')).toBe(5)
    }
  })

  it('fails loudly when the pool cannot make a paper that fits', () => {
    const items = withFormats(fullPool(20), (i) => i.subject !== 'english')
    expect(() => assembleForAnswerSheet({ pool: items, shape: SHAPE_30, rng: seeded(3), maxNumeric: 18 })).toThrow(
      /numeric/,
    )
  })

  it('refuses a pool that does not say which items are numeric', () => {
    expect(() => assembleForAnswerSheet({ pool: fullPool(20), shape: SHAPE_30, rng: seeded(4), maxNumeric: 18 })).toThrow(
      /format/,
    )
  })
})
