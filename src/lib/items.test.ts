import { describe, it, expect } from 'vitest'
import { resolveSeedStatus, groupBank, type ItemStatus } from './items'
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
