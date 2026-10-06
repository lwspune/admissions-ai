// The parent pack's sample papers (content/parent-pack). Pure, so the one rule
// that matters to a parent — the sample shows only what their child can be
// tested on — is checked by the same function the class rule lives beside.

import { isDrawableFor, contentCeiling, type ClassLevel } from './classes'
import { SUBJECTS, DIFFICULTIES, PAPER_MIX, QUESTIONS_PER_PAPER, type Subject, type Difficulty } from './types'

export interface SampleItem {
  ref: string
  subject: Subject
  difficulty: Difficulty
  taught_in: number
}

/**
 * Why a sample paper cannot be shown to the parent of an admit to this class.
 * Empty when it can. A sample must have the real paper's shape and must not
 * reach above the class's content ceiling.
 */
export function samplePaperProblems(classLevel: ClassLevel, items: readonly SampleItem[]): string[] {
  const problems: string[] = []

  if (items.length !== QUESTIONS_PER_PAPER) {
    problems.push(`has ${items.length} questions, a paper has ${QUESTIONS_PER_PAPER}`)
  }

  for (const subject of SUBJECTS) {
    for (const difficulty of DIFFICULTIES) {
      const count = items.filter((i) => i.subject === subject && i.difficulty === difficulty).length
      if (count !== PAPER_MIX[difficulty]) {
        problems.push(`${subject}/${difficulty}: ${count}, a paper has ${PAPER_MIX[difficulty]}`)
      }
    }
  }

  for (const item of items) {
    if (!isDrawableFor(item.taught_in, classLevel)) {
      problems.push(
        `${item.ref} is taught in class ${item.taught_in}; an admit to class ${classLevel} is tested up to class ${contentCeiling(classLevel)}`,
      )
    }
  }

  return problems
}
