// The parent pack's syllabus: which NCERT chapters an admit's paper draws on.
// Pure, because the answer depends on two moving things — the bank's class
// tags and which edition of each NCERT book the child used — and a sheet that
// names a chapter the child never had is the failure this exists to prevent.

import { contentCeiling, type ClassLevel } from './classes'
import type { Subject } from './types'

export type Edition = 'old' | 'new'

export interface SyllabusTopic {
  key: string
  subject: Subject
  label: string
  /** The lowest class tag among bank items on this topic; null if none. */
  taught_in: number | null
  /** Asked, but not a chapter in any school textbook (series, clocks, syllogisms). */
  reasoning: boolean
  /** The list it is printed under on the parent sheet; its subject if absent. */
  heading?: Heading
}

/** The parent sheet's basics lists: one per subject, and puzzles from all three. */
export type Heading = Subject | 'reasoning'

export interface SyllabusChapter {
  subject: Subject
  /** The class whose book holds the chapter. */
  classLevel: number
  edition: Edition
  book: string
  title: string
  topics: string[]
}

export interface SyllabusInput {
  /** The year (as its starting calendar year) in which an admit to N is in class N−1. */
  cohortYear: number
  /** The first year each class used the new NCERT book. A class absent here has none. */
  newFrom: Record<number, number>
  topics: SyllabusTopic[]
  chapters: SyllabusChapter[]
}

export interface PlacedChapter {
  subject: Subject
  classLevel: number
  book: string
  title: string
  /** Labels of the topics in this chapter that the paper can draw. */
  covers: string[]
}

export interface Syllabus {
  chapters: PlacedChapter[]
  reasoning: SyllabusTopic[]
  /** Drawable topics no chapter in the child's books teaches by class N−1. */
  unplaced: SyllabusTopic[]
}

/** Which edition of the class-`contentClass` book an admit to `admittingTo` used. */
export function editionStudied(
  contentClass: number,
  admittingTo: ClassLevel,
  cohortYear: number,
  newFrom: Record<number, number>,
): Edition {
  const yearStudied = cohortYear - (admittingTo - 1 - contentClass)
  const released = newFrom[contentClass]
  return released !== undefined && yearStudied >= released ? 'new' : 'old'
}

/** A topic's class: the lowest tag among bank items carrying one of its skills. */
export function topicClass(skills: readonly string[], bank: readonly { skill: string; taught_in: number }[]): number | null {
  const tags = bank.filter((i) => skills.includes(i.skill)).map((i) => i.taught_in)
  return tags.length === 0 ? null : Math.min(...tags)
}

/** Skills that no topic claims: a new skill the syllabus has not been told about. */
export function unmappedSkills(topics: readonly { skills: readonly string[] }[], skills: readonly string[]): string[] {
  const claimed = new Set(topics.flatMap((t) => t.skills))
  return [...new Set(skills.filter((s) => !claimed.has(s)))]
}

export function syllabusFor(admittingTo: ClassLevel, input: SyllabusInput): Syllabus {
  const ceiling = contentCeiling(admittingTo)
  const drawable = input.topics.filter((t) => t.taught_in !== null && t.taught_in <= ceiling)
  const byKey = new Map(drawable.map((t) => [t.key, t]))

  const studied = input.chapters
    .filter((c) => c.classLevel <= ceiling)
    .filter((c) => c.edition === editionStudied(c.classLevel, admittingTo, input.cohortYear, input.newFrom))
    .map((c) => ({ ...c, drawn: c.topics.filter((k) => byKey.has(k)) }))
    .filter((c) => c.drawn.length > 0)
    .sort((a, b) => a.classLevel - b.classLevel)

  const placed = new Set(studied.flatMap((c) => c.drawn))

  return {
    chapters: studied.map((c) => ({
      subject: c.subject,
      classLevel: c.classLevel,
      book: c.book,
      title: c.title,
      covers: c.drawn.map((k) => byKey.get(k)!.label),
    })),
    reasoning: drawable.filter((t) => t.reasoning),
    unplaced: drawable.filter((t) => !t.reasoning && !placed.has(t.key)),
  }
}

/**
 * The basics topics an admit to `admittingTo` can be asked, as the parent
 * sheet prints them: broad names under four headings, no class or book.
 * Topics may share a name (one broad science chapter, several bank topics);
 * it is listed once, where its first drawable topic falls.
 */
export function basicsTopics(admittingTo: ClassLevel, topics: readonly SyllabusTopic[]): Record<Heading, string[]> {
  const ceiling = contentCeiling(admittingTo)
  const lists: Record<Heading, string[]> = { maths: [], english: [], science: [], reasoning: [] }
  for (const t of topics) {
    const list = lists[t.heading ?? t.subject]
    if (t.taught_in !== null && t.taught_in <= ceiling && !list.includes(t.label)) list.push(t.label)
  }
  return lists
}
