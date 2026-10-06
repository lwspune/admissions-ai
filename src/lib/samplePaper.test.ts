import { describe, it, expect } from 'vitest'
import { samplePaperProblems, type SampleItem } from './samplePaper'
import type { Subject, Difficulty } from './types'

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
