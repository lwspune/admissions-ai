import { describe, it, expect } from 'vitest'
import {
  needsHindi,
  hasHindi,
  paperHasHindi,
  sourceStamp,
  numbersIn,
  translationProblems,
  hindiCoverage,
  type HindiEntry,
} from './hindi'

// Hindi covers maths and science only (2026-10-11): English questions test
// English, and a translated one is a different question. The answer key, the
// numeric answer and the option order are shared with the English item, so a
// translation that drops a number or swaps two options is a wrong question
// that grades as a right one. These rules are what the lint and the paper
// lean on.

const mcq = {
  subject: 'maths' as const,
  format: 'mcq' as const,
  stem: 'A shirt costs ₹1,200 after a 20% discount. What was the marked price?',
  options: { A: '₹1,440', B: '₹1,500', C: '₹1,600', D: '₹1,250' },
}

const numeric = {
  subject: 'science' as const,
  format: 'numeric' as const,
  stem: 'A car covers 150 km in 2.5 hours. What is its average speed in km/h?',
  options: null,
}

const hiMcq = (over: Partial<HindiEntry> = {}): HindiEntry => ({
  ref: 'M-E-01',
  source: sourceStamp(mcq),
  stem_hi: '20% छूट के बाद एक कमीज़ ₹1,200 की है। उसका अंकित मूल्य क्या था?',
  options_hi: { A: '₹1,440', B: '₹1,500', C: '₹1,600', D: '₹1,250' },
  ...over,
})

const hiNumeric = (over: Partial<HindiEntry> = {}): HindiEntry => ({
  ref: 'S-E-01',
  source: sourceStamp(numeric),
  stem_hi: 'एक कार 2.5 घंटे में 150 km चलती है। उसकी औसत चाल km/h में कितनी है?',
  options_hi: null,
  ...over,
})

describe('needsHindi', () => {
  it('is true for maths and science, false for English', () => {
    expect(needsHindi('maths')).toBe(true)
    expect(needsHindi('science')).toBe(true)
    expect(needsHindi('english')).toBe(false)
  })
})

describe('hasHindi', () => {
  it('needs a stem and, for an MCQ, all four options', () => {
    expect(hasHindi({ ...mcq, stem_hi: 'प्रश्न', options_hi: { A: '1', B: '2', C: '3', D: '4' } })).toBe(true)
    expect(hasHindi({ ...mcq, stem_hi: 'प्रश्न', options_hi: null })).toBe(false)
    expect(hasHindi({ ...mcq, stem_hi: 'प्रश्न', options_hi: { A: '1', B: '2', C: '3', D: ' ' } })).toBe(false)
    expect(hasHindi({ ...mcq, stem_hi: '  ', options_hi: { A: '1', B: '2', C: '3', D: '4' } })).toBe(false)
  })

  it('needs only a stem for a numeric item', () => {
    expect(hasHindi({ ...numeric, stem_hi: 'प्रश्न', options_hi: null })).toBe(true)
    expect(hasHindi({ ...numeric, stem_hi: null, options_hi: null })).toBe(false)
  })
})

describe('paperHasHindi', () => {
  const hi = { stem_hi: 'प्रश्न', options_hi: { A: '1', B: '2', C: '3', D: '4' } }
  const english = { subject: 'english' as const, format: 'mcq' as const, stem_hi: null, options_hi: null }

  it('is true when every maths and science question has Hindi; English needs none', () => {
    expect(paperHasHindi([{ ...mcq, ...hi }, { ...numeric, stem_hi: 'प्रश्न', options_hi: null }, english])).toBe(true)
  })

  it('is false when a single maths or science question lacks it, so nobody gets a mixed paper', () => {
    expect(paperHasHindi([{ ...mcq, ...hi }, { ...numeric, stem_hi: null, options_hi: null }, english])).toBe(false)
  })

  it('is false for a paper with nothing to translate', () => {
    expect(paperHasHindi([english])).toBe(false)
    expect(paperHasHindi([])).toBe(false)
  })
})

describe('sourceStamp', () => {
  it('is stable for the same English text', () => {
    expect(sourceStamp(mcq)).toBe(sourceStamp({ ...mcq, options: { ...mcq.options } }))
  })

  it('changes when the stem or any option changes', () => {
    expect(sourceStamp({ ...mcq, stem: mcq.stem + ' ' })).not.toBe(sourceStamp(mcq))
    expect(sourceStamp({ ...mcq, options: { ...mcq.options, D: '₹1,260' } })).not.toBe(sourceStamp(mcq))
  })

  it('changes when two options swap, since the key letter is shared', () => {
    const swapped = { ...mcq, options: { ...mcq.options, A: mcq.options.B, B: mcq.options.A } }
    expect(sourceStamp(swapped)).not.toBe(sourceStamp(mcq))
  })
})

describe('numbersIn', () => {
  it('reads integers, decimals and Indian or Western digit grouping as one number', () => {
    expect(numbersIn('₹1,20,000 and 1,200 and 2.5 and 3/4')).toEqual(['120000', '1200', '2.5', '3', '4'])
  })

  it('ignores a full stop that ends a sentence', () => {
    expect(numbersIn('It is 12.')).toEqual(['12'])
  })
})

describe('translationProblems', () => {
  it('passes a faithful MCQ and a faithful numeric item', () => {
    expect(translationProblems(mcq, hiMcq())).toEqual([])
    expect(translationProblems(numeric, hiNumeric())).toEqual([])
  })

  it('refuses Hindi on an English question', () => {
    const english = { ...mcq, subject: 'english' as const }
    expect(translationProblems(english, hiMcq({ source: sourceStamp(english) }))).toContainEqual(
      expect.stringMatching(/English questions stay in English/),
    )
  })

  it('refuses a translation of English text that has since changed', () => {
    const edited = { ...mcq, stem: mcq.stem.replace('20%', '25%') }
    expect(translationProblems(edited, hiMcq())).toContainEqual(expect.stringMatching(/English has changed/))
  })

  it('refuses a stem with a number missing — the most dangerous slip', () => {
    const problems = translationProblems(mcq, hiMcq({ stem_hi: 'छूट के बाद एक कमीज़ ₹1,200 की है। उसका अंकित मूल्य क्या था?' }))
    expect(problems).toContainEqual(expect.stringMatching(/stem.*20/))
  })

  it('refuses options whose numbers moved between letters, since the key letter is shared', () => {
    const swapped = hiMcq({ options_hi: { A: '₹1,500', B: '₹1,440', C: '₹1,600', D: '₹1,250' } })
    const problems = translationProblems(mcq, swapped)
    expect(problems).toContainEqual(expect.stringMatching(/option A/))
    expect(problems).toContainEqual(expect.stringMatching(/option B/))
  })

  it('refuses Devanagari digits, so a number reads the same in both languages', () => {
    const problems = translationProblems(numeric, hiNumeric({ stem_hi: 'एक कार २.५ घंटे में १५० km चलती है। औसत चाल? 150 2.5' }))
    expect(problems).toContainEqual(expect.stringMatching(/0–9/))
  })

  it('refuses a stem with no Hindi in it', () => {
    expect(translationProblems(numeric, hiNumeric({ stem_hi: 'A car covers 150 km in 2.5 hours.' }))).toContainEqual(
      expect.stringMatching(/no Hindi/),
    )
  })

  it('refuses a blank stem', () => {
    expect(translationProblems(numeric, hiNumeric({ stem_hi: ' ' }))).toContainEqual(expect.stringMatching(/stem_hi is blank/))
  })

  it('refuses MCQ options that are missing, blank, extra or identical', () => {
    expect(translationProblems(mcq, hiMcq({ options_hi: null }))).toContainEqual(expect.stringMatching(/options_hi/))
    expect(
      translationProblems(mcq, hiMcq({ options_hi: { A: '₹1,440', B: '₹1,500', C: '₹1,600', D: '' } })),
    ).toContainEqual(expect.stringMatching(/blank/))
    expect(
      translationProblems(mcq, hiMcq({ options_hi: { A: '₹1,440', B: '₹1,500', C: '₹1,600', D: '₹1,250', E: 'x' } as never })),
    ).toContainEqual(expect.stringMatching(/exactly A–D/))
    const twins = { ...mcq, options: { A: 'हाँ 1', B: 'हाँ 1', C: '3', D: '4' } }
    expect(
      translationProblems(
        { ...mcq, options: { A: 'yes 1', B: 'no 1', C: '3', D: '4' } },
        hiMcq({ source: sourceStamp({ ...mcq, options: { A: 'yes 1', B: 'no 1', C: '3', D: '4' } }), options_hi: twins.options }),
      ),
    ).toContainEqual(expect.stringMatching(/identical/))
  })

  it('refuses options on a numeric item', () => {
    expect(
      translationProblems(numeric, hiNumeric({ options_hi: { A: '1', B: '2', C: '3', D: '4' } })),
    ).toContainEqual(expect.stringMatching(/numeric item carries no options/))
  })
})

// A class offers Hindi on a paper only when every question drawn for it has a
// Hindi version, so the useful number is per class: of the maths and science
// items that class can draw, how many are translated.
describe('hindiCoverage', () => {
  const bank = [
    { ref: 'M1', subject: 'maths' as const, taught_in: 6, part: 'basics' as const, term: null },
    { ref: 'M2', subject: 'maths' as const, taught_in: 9, part: 'basics' as const, term: null },
    { ref: 'S1', subject: 'science' as const, taught_in: 7, part: 'syllabus' as const, term: 1 },
    { ref: 'S2', subject: 'science' as const, taught_in: 7, part: 'syllabus' as const, term: 2 },
    { ref: 'E1', subject: 'english' as const, taught_in: 6, part: 'basics' as const, term: null },
    { ref: 'M3', subject: 'maths' as const, taught_in: 6, part: 'basics' as const, term: null, status: 'retired' },
  ]
  const byClass = (translated: string[]) =>
    Object.fromEntries(hindiCoverage(bank, new Set(translated)).map((c) => [c.classLevel, c]))

  it('counts only the maths and science items a class can draw, retired ones left out', () => {
    const c = byClass([])
    expect(c[8]).toMatchObject({ total: 2, translated: 0 }) // M1, and S1 (class 7 term 1)
    expect(c[10]).toMatchObject({ total: 2, translated: 0 }) // M1, M2
  })

  it('counts the translated ones and says when a class is complete', () => {
    const c = byClass(['M1', 'S1'])
    expect(c[8]).toMatchObject({ total: 2, translated: 2, complete: true })
    expect(c[10]).toMatchObject({ total: 2, translated: 1, complete: false })
  })
})
