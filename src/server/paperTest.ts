import 'server-only'
import type { Db } from './supabase'
import type { Role } from './auth'
import { toCandidatePaper, type BankRow, type CandidateQuestion } from '../lib/serialize'
import { toAnswerSheet, type AnswerSheet } from '../lib/paperSheet'
import { isUuid } from '../lib/leads'

export interface PaperTest {
  leadId: string
  name: string
  classLevel: number
  paperNo: number
  issuedAt: string
  /** The last day the sheets can be scanned. */
  expiresAt: string
  state: string
  minutes: number
  /** Class N−1 on a paper with a syllabus part; null otherwise. */
  syllabusClass: number | null
  /** Whether every maths and science question has a Hindi version. */
  hindi: boolean
  questions: CandidateQuestion[]
  sheet: AnswerSheet
}

/**
 * A paper test's question paper and answer sheet, for printing.
 *
 * Null for a telecaller, whatever lead it is: printing shows every question,
 * and telecallers never see question text (the rule `loadPaper` in report.ts
 * keeps for the report). Null too for an online test, or one RLS hides. The
 * questions go through `toCandidatePaper` and the sheet through
 * `toAnswerSheet`, the allow-lists, so no answer reaches the page — and only
 * the columns those need are selected at all.
 */
export async function loadPaperTest(db: Db, assessmentId: string, role: Role): Promise<PaperTest | null> {
  if (role === 'telecaller' || !isUuid(assessmentId)) return null

  const { data: a, error } = await db
    .from('assessments')
    .select('id, lead_id, mode, paper_no, created_at, expires_at, state, question_count, limit_minutes, class_level, leads(name)')
    .eq('id', assessmentId)
    .maybeSingle()
  if (error) throw new Error(`could not load the paper test: ${error.message}`)
  if (!a || a.mode !== 'paper' || a.class_level == null) return null

  const { data: rows, error: itemsError } = await db
    .from('assessment_items')
    .select('position, test_items(subject, part, format, stem, options, stem_hi, options_hi)')
    .eq('assessment_id', assessmentId)
    .order('position')
  if (itemsError) throw new Error(`could not load the paper: ${itemsError.message}`)

  const paper = (rows ?? []).map((r) => ({ position: r.position as number, item: r.test_items as never as BankRow }))
  const questions = toCandidatePaper(paper)
  const name = (a.leads as never as { name: string }).name
  const classLevel = a.class_level as number

  return {
    leadId: a.lead_id as string,
    name,
    classLevel,
    paperNo: a.paper_no as number,
    issuedAt: a.created_at as string,
    expiresAt: a.expires_at as string,
    state: a.state as string,
    minutes: a.limit_minutes as number,
    syllabusClass: a.question_count === 30 ? classLevel - 1 : null,
    hindi: questions.some((q) => q.stemHi !== null),
    questions,
    sheet: toAnswerSheet({
      assessment: { paper_no: a.paper_no as number, issued_at: a.created_at as string },
      lead: { name, class_level: classLevel },
      paper,
    }),
  }
}
