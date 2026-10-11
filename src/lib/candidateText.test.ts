import { describe, it, expect } from 'vitest'
import { CANDIDATE_TEXT, NOTICE_TEXT } from './candidateText'

// Every candidate screen reads its words from here, in English or Hindi. A
// missing or English-only Hindi string would show a candidate who chose Hindi
// a screen half in English, so each one is checked.

const DEVANAGARI = /[\u0900-\u097F]/

/** Every string a text object can produce, functions called with sample values. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return strings(value(3, 30))
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

describe('candidate screen text', () => {
  it('has the same entries in both languages', () => {
    expect(Object.keys(CANDIDATE_TEXT.hi).sort()).toEqual(Object.keys(CANDIDATE_TEXT.en).sort())
  })

  it('has Hindi in every Hindi string that holds a word', () => {
    for (const [key, value] of Object.entries(CANDIDATE_TEXT.hi)) {
      for (const s of strings(value)) {
        if (/[A-Za-z]|[\u0900-\u097F]/.test(s)) expect(`${key}: ${s}`).toMatch(DEVANAGARI)
      }
    }
  })

  it('never leaves an English entry blank', () => {
    for (const [key, value] of Object.entries(CANDIDATE_TEXT.en)) {
      expect(`${key}:${strings(value).join('')}`.trim().length).toBeGreaterThan(key.length + 1)
    }
  })

  it('puts the numbers into the sentences that carry them', () => {
    for (const lang of ['en', 'hi'] as const) {
      const t = CANDIDATE_TEXT[lang]
      expect(t.rules.paper(30, 30)).toContain('30')
      expect(t.rules.syllabus(9)).toContain('9')
      expect(t.part.syllabus(9)).toContain('9')
      expect(t.review.unanswered(4)).toContain('4')
      expect(t.announce.minutes(5)).toContain('5')
    }
  })

  it('says "question" in the singular for one unanswered question', () => {
    expect(CANDIDATE_TEXT.en.review.unanswered(1)).toMatch(/^1 question not/)
    expect(CANDIDATE_TEXT.en.review.unanswered(2)).toMatch(/^2 questions not/)
  })
})

describe('notice text', () => {
  it('has a Hindi title and body for every notice', () => {
    for (const [status, notice] of Object.entries(NOTICE_TEXT)) {
      expect(`${status} ${notice.hi.title}`).toMatch(DEVANAGARI)
      expect(`${status} ${notice.hi.body}`).toMatch(DEVANAGARI)
      expect(notice.en.title.length).toBeGreaterThan(0)
    }
  })
})
