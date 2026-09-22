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

/** Per subject, per paper. Spec §1. */
export const PAPER_MIX: Readonly<Record<Difficulty, number>> = {
  easy: 3,
  moderate: 1,
  difficult: 1,
}

export const QUESTIONS_PER_PAPER = 15
export const LIMIT_MS = 15 * 60 * 1000 // 15 minutes of active time
export const WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours from issue

/** Marking. Spec §6. */
export const MARK_CORRECT = 1
export const MARK_WRONG_MCQ = -0.25
export const MARK_WRONG_NUMERIC = 0
export const MARK_SKIPPED = 0
