import { describe, it, expect } from 'vitest'
import { samplePaperProblems, type SampleItem } from './samplePaper'
import { SHAPE_30, type Subject, type Difficulty } from './types'

let n = 0
const item = (subject: Subject, difficulty: Difficulty, taught_in = 6): SampleItem => ({
  ref: `X-${++n}`,
  subject,
  difficulty,
  taught_in,
})

const subjectBlock = (subject: Subject, taught_in = 6): SampleItem[] => [
  item(subject, 'easy', taught_in),
  item(subject, 'easy', taught_in),
  item(subject, 'easy', taught_in),
  item(subject, 'moderate', taught_in),
  item(subject, 'difficult', taught_in),
]

const fullPaper = (): SampleItem[] => [
  ...subjectBlock('maths'),
  ...subjectBlock('english'),
  ...subjectBlock('science'),
]

// A sample paper goes to a parent as "what your child's test looks like". It
// has to be the real shape, and it must not show content the class cannot be
// tested on — a class 8 parent shown class 9 topics would be told the wrong
// syllabus by the very page meant to explain it.
describe('samplePaperProblems', () => {
  it('accepts a paper of the real shape within the class ceiling', () => {
    expect(samplePaperProblems(8, fullPaper())).toEqual([])
  })

  it('refuses an item taught at or above the class being admitted to', () => {
    const paper = fullPaper()
    paper[14] = { ...paper[14]!, ref: 'TOO-HIGH', taught_in: 8 }
    const problems = samplePaperProblems(8, paper)
    expect(problems).toHaveLength(1)
    expect(problems[0]!).toContain('TOO-HIGH')
  })

  it('allows content taught in the class just below', () => {
    const paper = fullPaper()
    paper[14] = { ...paper[14]!, taught_in: 9 }
    expect(samplePaperProblems(10, paper)).toEqual([])
  })

  it('refuses a paper whose difficulty mix differs from the real one', () => {
    const paper = fullPaper()
    paper[4] = { ...paper[4]!, difficulty: 'easy' }
    const problems = samplePaperProblems(8, paper)
    expect(problems.some((p) => p.includes('maths/easy'))).toBe(true)
    expect(problems.some((p) => p.includes('maths/difficult'))).toBe(true)
  })

  it('refuses a paper with a question missing', () => {
    const problems = samplePaperProblems(8, fullPaper().slice(1))
    expect(problems.some((p) => p.includes('15'))).toBe(true)
  })
})

// A class on the 30-question paper gets a 30-question sample (2026-10-07).
describe('samplePaperProblems — 30-question paper', () => {
  const syl = (subject: Subject, difficulty: Difficulty, over: Partial<SampleItem> = {}): SampleItem => ({
    ref: `S-${++n}`, subject, difficulty, taught_in: 9, part: 'syllabus', term: 1, ...over,
  })
  const english = (): SampleItem[] => [
    ...Array.from({ length: 6 }, () => item('english', 'easy')),
    item('english', 'moderate'), item('english', 'moderate'),
    item('english', 'difficult'), item('english', 'difficult'),
  ]
  const syllabusBlock = (subject: Subject): SampleItem[] => [
    syl(subject, 'easy'), syl(subject, 'easy'), syl(subject, 'easy'), syl(subject, 'moderate'), syl(subject, 'difficult'),
  ]
  const thirty = (): SampleItem[] => [
    ...subjectBlock('maths'), ...syllabusBlock('maths'),
    ...english(),
    ...subjectBlock('science'), ...syllabusBlock('science'),
  ]

  it('accepts a 30-question sample of the real shape for an admit to class 10', () => {
    expect(samplePaperProblems(10, thirty(), SHAPE_30)).toEqual([])
  })

  it('refuses a 15-question sample where the class is on 30', () => {
    expect(samplePaperProblems(10, fullPaper(), SHAPE_30).some((p) => p.includes('30'))).toBe(true)
  })

  it('refuses syllabus content from a class other than N−1', () => {
    const paper = thirty()
    const at = paper.findIndex((i) => i.part === 'syllabus')
    paper[at] = { ...paper[at]!, ref: 'OLD-CLASS', taught_in: 8 }
    expect(samplePaperProblems(10, paper, SHAPE_30).some((p) => p.includes('OLD-CLASS'))).toBe(true)
  })

  it('refuses second-term syllabus content', () => {
    const paper = thirty()
    const at = paper.findIndex((i) => i.part === 'syllabus')
    paper[at] = { ...paper[at]!, ref: 'TERM-TWO', term: 2 }
    expect(samplePaperProblems(10, paper, SHAPE_30).some((p) => p.includes('TERM-TWO'))).toBe(true)
  })
})
