import { describe, it, expect } from 'vitest'
import { editionStudied, topicClass, unmappedSkills, syllabusFor, type SyllabusTopic, type SyllabusChapter } from './syllabus'

// NCERT replaced its books class by class: a child's book for a given class
// depends on the year they were in it. The sheets assume a cohort in class N−1
// during `cohortYear`, so class c was studied in cohortYear − (N−1−c).
const NEW_FROM = { 6: 2024, 7: 2025, 8: 2025, 9: 2026 }

describe('editionStudied', () => {
  it('gives the new book to a class studied after its release', () => {
    expect(editionStudied(7, 8, 2026, NEW_FROM)).toBe('new') // class 7 in 2026
    expect(editionStudied(6, 8, 2026, NEW_FROM)).toBe('new') // class 6 in 2025
    expect(editionStudied(8, 10, 2026, NEW_FROM)).toBe('new') // class 8 in 2025
  })

  it('gives the old book to a class studied before its release', () => {
    expect(editionStudied(7, 10, 2026, NEW_FROM)).toBe('old') // class 7 in 2024
    expect(editionStudied(9, 11, 2026, NEW_FROM)).toBe('old') // class 9 in 2025
  })

  it('gives the old book to a class with no new book yet', () => {
    expect(editionStudied(10, 11, 2026, NEW_FROM)).toBe('old')
  })
})

describe('topicClass', () => {
  it('is the lowest class tag among bank items with the topic’s skills', () => {
    const bank = [
      { skill: 'average', taught_in: 8 },
      { skill: 'weighted-average', taught_in: 7 },
      { skill: 'probability', taught_in: 9 },
    ]
    expect(topicClass(['average', 'weighted-average'], bank)).toBe(7)
  })

  it('is null when no bank item carries the topic', () => {
    expect(topicClass(['sound'], [{ skill: 'average', taught_in: 7 }])).toBeNull()
  })
})

describe('unmappedSkills', () => {
  it('lists skills no topic claims, once each', () => {
    const topics = [{ skills: ['average'] }, { skills: ['probability'] }]
    expect(unmappedSkills(topics, ['average', 'tense', 'tense', 'probability'])).toEqual(['tense'])
  })
})

const topic = (key: string, taught_in: number | null, reasoning = false): SyllabusTopic => ({
  key, subject: 'maths', label: key, taught_in, reasoning,
})
const chapter = (classLevel: number, edition: 'old' | 'new', title: string, topics: string[]): SyllabusChapter => ({
  subject: 'maths', classLevel, edition, book: edition === 'new' ? 'Ganita Prakash' : 'Mathematics', title, topics,
})

describe('syllabusFor', () => {
  const input = {
    cohortYear: 2026,
    newFrom: NEW_FROM,
    topics: [
      topic('patterns', 6),
      topic('percent', 8),
      topic('average', 7),
      topic('clocks', 6, true),
      topic('unused', null),
    ],
    chapters: [
      chapter(6, 'new', 'Patterns in Mathematics', ['patterns']),
      chapter(6, 'old', 'Whole Numbers', ['patterns']),
      chapter(8, 'new', 'Fractions in Disguise', ['percent']),
      chapter(7, 'old', 'Comparing Quantities', ['percent']),
      chapter(8, 'new', 'Tales by Dots and Lines', ['average', 'unused']),
      chapter(7, 'old', 'Data Handling', ['average']),
    ],
  }

  it('lists the chapter from the edition the child studied, not the other', () => {
    const sheet = syllabusFor(8, input)
    expect(sheet.chapters.map((c) => c.title)).toEqual(['Patterns in Mathematics'])
  })

  it('names only the topics the paper can draw for that class', () => {
    const sheet = syllabusFor(9, input)
    const disguise = sheet.chapters.find((c) => c.title === 'Fractions in Disguise')!
    expect(disguise.covers).toEqual(['percent'])
    const dots = sheet.chapters.find((c) => c.title === 'Tales by Dots and Lines')!
    expect(dots.covers).toEqual(['average'])
  })

  it('reports a drawable topic the child’s books do not teach by class N−1', () => {
    // An admit to 8 on the new books meets the mean only in class 8.
    expect(syllabusFor(8, input).unplaced.map((t) => t.key)).toEqual(['average'])
  })

  it('places a topic from an older book when the child used older books', () => {
    const sheet = syllabusFor(11, input)
    expect(sheet.chapters.map((c) => c.title)).toEqual(['Whole Numbers', 'Comparing Quantities', 'Data Handling'])
    expect(sheet.unplaced).toEqual([])
  })

  it('lists reasoning topics apart and never as unplaced', () => {
    const sheet = syllabusFor(8, input)
    expect(sheet.reasoning.map((t) => t.key)).toEqual(['clocks'])
  })
})
