import 'server-only'
import type { Db } from './supabase'
import type { ItemStatus } from '../lib/items'
import type { Subject, Difficulty, Format, Choice } from '../lib/types'

export interface BankItem {
  id: string
  ref: string | null
  subject: Subject
  skill: string
  difficulty: Difficulty
  /** The class in which the content is taught; an admit to class N may see taughtIn ≤ N−1. */
  taughtIn: number
  status: ItemStatus
  format: Format
  stem: string
  options: Record<Choice, string> | null
  answerKey: Choice | null
  numericAnswer: number | null
  numericTolerance: number
  rationale: string | null
}

/**
 * The whole item bank, answer keys included.
 *
 * Runs on the session-bound client so RLS decides who may read it — the page's
 * role check is a courtesy that keeps a wrong link from rendering an empty
 * screen, not the access rule. Moving that rule into an `if` here would be the
 * bug this layering exists to prevent.
 */
export async function loadBank(db: Db): Promise<BankItem[]> {
  const { data, error } = await db
    .from('test_items')
    .select('id, ref, subject, skill, difficulty, taught_in, status, format, stem, options, answer_key, numeric_answer, numeric_tolerance, rationale')
    .order('ref')

  if (error) throw new Error(`could not read the item bank: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    ref: (row.ref as string | null) ?? null,
    subject: row.subject as Subject,
    skill: row.skill as string,
    difficulty: row.difficulty as Difficulty,
    taughtIn: Number(row.taught_in),
    status: row.status as ItemStatus,
    format: row.format as Format,
    stem: row.stem as string,
    options: (row.options as Record<Choice, string> | null) ?? null,
    answerKey: (row.answer_key as Choice | null) ?? null,
    numericAnswer: row.numeric_answer === null ? null : Number(row.numeric_answer),
    numericTolerance: Number(row.numeric_tolerance ?? 0),
    rationale: (row.rationale as string | null) ?? null,
  }))
}
