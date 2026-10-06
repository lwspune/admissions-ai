import { describe, it, expect } from 'vitest'
import {
  CLASSES,
  TAUGHT_IN_MIN,
  TAUGHT_IN_MAX,
  parseClassLevel,
  contentCeiling,
  isDrawableFor,
  isSyllabusFor,
} from './classes'

// The lead form used to store class as free text ("9", "9th", "IX"), which no
// filter can act on. The only values that mean anything are the five classes
// the institute admits to; everything else is refused rather than guessed.
describe('parseClassLevel', () => {
  it('accepts the five admitted classes as numbers or strings', () => {
    expect(parseClassLevel(8)).toBe(8)
    expect(parseClassLevel(9)).toBe(9)
    expect(parseClassLevel('10')).toBe(10)
    expect(parseClassLevel(' 11 ')).toBe(11)
    expect(parseClassLevel('12')).toBe(12)
  })

  it('refuses classes outside the admitted range', () => {
    expect(parseClassLevel(7)).toBeNull()
    expect(parseClassLevel('13')).toBeNull()
  })

  it('refuses anything that is not a plain integer', () => {
    expect(parseClassLevel('9th')).toBeNull()
    expect(parseClassLevel('IX')).toBeNull()
    expect(parseClassLevel('9.5')).toBeNull()
    expect(parseClassLevel('')).toBeNull()
    expect(parseClassLevel(null)).toBeNull()
    expect(parseClassLevel(undefined)).toBeNull()
  })
})

// An admit to class N has finished class N−1, and in the admission season is
// in nobody's class yet. The paper is drawn from content taught up to N−1.
describe('contentCeiling', () => {
  it('is one class below the class being admitted to', () => {
    expect(contentCeiling(8)).toBe(7)
    expect(contentCeiling(9)).toBe(8)
    expect(contentCeiling(10)).toBe(9)
    expect(contentCeiling(11)).toBe(10)
    expect(contentCeiling(12)).toBe(11)
  })

  it('always lands inside the range an item can be tagged with', () => {
    for (const c of CLASSES) {
      expect(contentCeiling(c)).toBeGreaterThanOrEqual(TAUGHT_IN_MIN)
      expect(contentCeiling(c)).toBeLessThanOrEqual(TAUGHT_IN_MAX)
    }
  })
})

describe('isDrawableFor', () => {
  it('allows an item taught at or below the ceiling', () => {
    expect(isDrawableFor(7, 8)).toBe(true)
    expect(isDrawableFor(6, 9)).toBe(true)
    expect(isDrawableFor(8, 9)).toBe(true)
    expect(isDrawableFor(11, 12)).toBe(true)
  })

  it('refuses an item taught in the class being admitted to or above', () => {
    expect(isDrawableFor(8, 8)).toBe(false)
    expect(isDrawableFor(9, 9)).toBe(false)
    expect(isDrawableFor(11, 11)).toBe(false)
    expect(isDrawableFor(10, 9)).toBe(false)
  })

  it('lets the floor reach every class, so an untagged bank changes nothing', () => {
    for (const c of CLASSES) expect(isDrawableFor(TAUGHT_IN_MIN, c)).toBe(true)
  })
})

// Syllabus questions (2026-10-06) come from exactly class N−1, first term:
// a candidate tested in October has not been taught the rest of the year.
describe('isSyllabusFor', () => {
  it('takes first-term content of the class just below the admitting class', () => {
    expect(isSyllabusFor(9, 1, 10)).toBe(true)
    expect(isSyllabusFor(11, 1, 12)).toBe(true)
  })

  it('refuses second-term content', () => {
    expect(isSyllabusFor(9, 2, 10)).toBe(false)
  })

  it('refuses an earlier class, unlike basics', () => {
    expect(isSyllabusFor(8, 1, 10)).toBe(false)
  })

  it('refuses the admitting class itself', () => {
    expect(isSyllabusFor(10, 1, 10)).toBe(false)
  })

  it('refuses an item with no term', () => {
    expect(isSyllabusFor(9, null, 10)).toBe(false)
  })
})
