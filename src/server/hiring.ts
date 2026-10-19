import 'server-only'
import type { Db } from './supabase'
import type { ItemStatus } from '../lib/items'
import type { Choice } from '../lib/types'
import type { HiringFormat, HiringSource, HiringSubject } from '../lib/hiring'

// The teacher screening test's server side (HIRING_TEST_SPEC.md). Every read
// here runs on the session-bound client: can_hire() in migration 0020 decides
// who sees what, not an `if` in this file.

export interface HiringBankItem {
  id: string
  sourceRef: string
  source: HiringSource
  paper: string
  subject: HiringSubject
  chapter: string
  format: HiringFormat
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
  answerKey: Choice | null
  numericAnswer: number | null
  status: ItemStatus
}

/** One subject's questions, answers included. A subject holds a few hundred, under the API's 1000-row page. */
export async function loadHiringBank(db: Db, subject: HiringSubject): Promise<HiringBankItem[]> {
  const { data, error } = await db
    .from('hiring_items')
    .select('id, source_ref, source, paper, subject, chapter, format, direction, stem, options, answer_key, numeric_answer, status')
    .eq('subject', subject)
    .order('format')
    .order('chapter')
    .order('source_ref')

  if (error) throw new Error(`could not read the hiring bank: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    sourceRef: row.source_ref as string,
    source: row.source as HiringSource,
    paper: row.paper as string,
    subject: row.subject as HiringSubject,
    chapter: row.chapter as string,
    format: row.format as HiringFormat,
    direction: (row.direction as string | null) ?? null,
    stem: row.stem as string,
    options: (row.options as Record<Choice, string> | null) ?? null,
    answerKey: (row.answer_key as Choice | null) ?? null,
    numericAnswer: row.numeric_answer === null ? null : Number(row.numeric_answer),
    status: row.status as ItemStatus,
  }))
}
