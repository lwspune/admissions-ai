// The parent pack's sample papers (content/parent-pack). Pure, so the one rule
// that matters to a parent — the sample shows only what their child can be
// tested on — is checked by the same functions the class rules live in.

import { isDrawableFor, isSyllabusFor, contentCeiling, type ClassLevel } from './classes'
import { SHAPE_15, type Subject, type Difficulty, type Part, type PaperShape } from './types'

export interface SampleItem {
  ref: string
  subject: Subject
  difficulty: Difficulty
  taught_in: number
  /** Basics unless stated; syllabus samples carry a term, like the bank. */
  part?: Part
  term?: number | null
}

/**
 * Why a sample paper cannot be shown to the parent of an admit to this class.
 * Empty when it can. A sample must have the shape of the paper that class
 * actually gets — 15 questions, or 30 once its syllabus batch is live — and
 * every question must be one that paper could hold.
 */
export function samplePaperProblems(
  classLevel: ClassLevel,
  items: readonly SampleItem[],
  shape: PaperShape = SHAPE_15,
): string[] {
  const problems: string[] = []

  if (items.length !== shape.questions) {
    problems.push(`has ${items.length} questions, the paper has ${shape.questions}`)
  }

  for (const { subject, part, difficulty, count: needed } of shape.quotas) {
    const count = items.filter(
      (i) => i.subject === subject && (i.part ?? 'basics') === part && i.difficulty === difficulty,
    ).length
    if (count !== needed) {
      const label = part === 'basics' ? `${subject}/${difficulty}` : `${subject}/syllabus/${difficulty}`
      problems.push(`${label}: ${count}, the paper has ${needed}`)
    }
  }

  for (const item of items) {
    if ((item.part ?? 'basics') === 'syllabus') {
      if (!isSyllabusFor(item.taught_in, item.term ?? null, classLevel)) {
        problems.push(
          `${item.ref} is class ${item.taught_in} term ${item.term ?? '?'} syllabus; an admit to class ${classLevel} is asked class ${contentCeiling(classLevel)} term 1`,
        )
      }
    } else if (!isDrawableFor(item.taught_in, classLevel)) {
      problems.push(
        `${item.ref} is taught in class ${item.taught_in}; an admit to class ${classLevel} is tested up to class ${contentCeiling(classLevel)}`,
      )
    }
  }

  return problems
}
