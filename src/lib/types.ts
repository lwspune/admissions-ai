// Shared vocabulary for the three pure modules (spec §2).
// These types mirror the database columns in supabase/migrations/0001_init.sql
// but deliberately do not import from a generated DB type: the pure modules must
// stay testable without a database.

export type Subject = 'maths' | 'english' | 'science'
export type Difficulty = 'easy' | 'moderate' | 'difficult'
export type Choice = 'A' | 'B' | 'C' | 'D'
export type Format = 'mcq' | 'numeric'

export const SUBJECTS: readonly Subject[] = ['maths', 'english', 'science'] as const
export const CHOICES: readonly Choice[] = ['A', 'B', 'C', 'D'] as const
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'moderate', 'difficult'] as const

/**
 * "basics" is the reasoning bank every class draws on (taught_in ≤ N−1);
 * "syllabus" is content from exactly class N−1's first-term NCERT chapters.
 */
export type Part = 'basics' | 'syllabus'
export const PARTS: readonly Part[] = ['basics', 'syllabus'] as const

/** Per subject, per part: the 3 easy / 1 moderate / 1 difficult of spec §1. */
export const PAPER_MIX: Readonly<Record<Difficulty, number>> = {
  easy: 3,
  moderate: 1,
  difficult: 1,
}

export interface Quota {
  subject: Subject
  part: Part
  difficulty: Difficulty
  count: number
}

export interface PaperShape {
  questions: number
  /** Active time allowed. One minute a question. */
  minutes: number
  quotas: readonly Quota[]
}

const mix = (subject: Subject, part: Part, easy: number, moderate: number, difficult: number): Quota[] => [
  { subject, part, difficulty: 'easy', count: easy },
  { subject, part, difficulty: 'moderate', count: moderate },
  { subject, part, difficulty: 'difficult', count: difficult },
]

/** The v1 paper, and what a class gets until its syllabus batch is live. */
export const SHAPE_15: PaperShape = {
  questions: 15,
  minutes: 15,
  quotas: SUBJECTS.flatMap((s) => mix(s, 'basics', 3, 1, 1)),
}

/**
 * The paper from 2026-10-06: ten per subject. English is all basics; maths and
 * science are five basics and five from class N−1's syllabus.
 */
export const SHAPE_30: PaperShape = {
  questions: 30,
  minutes: 30,
  quotas: [
    ...mix('maths', 'basics', 3, 1, 1),
    ...mix('maths', 'syllabus', 3, 1, 1),
    ...mix('english', 'basics', 6, 2, 2),
    ...mix('science', 'basics', 3, 1, 1),
    ...mix('science', 'syllabus', 3, 1, 1),
  ],
}

/** Active time a paper of this many minutes allows. */
export const limitMsFor = (minutes: number) => minutes * 60 * 1000
export const WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours from issue

/** Marking. Spec §6. */
export const MARK_CORRECT = 1
export const MARK_WRONG_MCQ = -0.25
export const MARK_WRONG_NUMERIC = 0
export const MARK_SKIPPED = 0
