import 'server-only'
import type { Db } from './supabase'
import { assembleForAnswerSheet, assemblePaper, choosePaperShape, type PoolItem } from '../lib/assemble'
import { NUMERIC_SLOTS } from '../lib/omr/layout'
import { parseClassLevel, type ClassLevel } from '../lib/classes'
import { generateToken } from '../lib/token'

export type TestMode = 'online' | 'paper'

export interface Assessment {
  id: string
  lead_id: string
  token: string
  issue_seq: number
  created_at: string
  expires_at: string
  state: string
  question_count: number
  limit_minutes: number
  class_level: number | null
  /** 'paper' for a test sat at the institute on a printed paper (2026-10-16). */
  mode: TestMode
  /** The six-digit number printed on a paper test's answer sheet; null online. */
  paper_no: number | null
  superseded_by: string | null
  voided_reason: string | null
}

/**
 * Issues a test for a lead: draws a fresh paper and writes it atomically.
 *
 * The draw happens here, where it is unit tested; the write happens in the
 * `issue_assessment` function, where it gets a transaction. Splitting an
 * assessment from its items across two REST calls risks a paper with missing
 * questions, scored out of the full count regardless.
 *
 * The class's pool picks the paper: 30 questions once its syllabus batch is
 * live, 15 until then (2026-10-06).
 *
 * A paper test is the same draw, kept within the OMR sheet's numeric boxes.
 * Only a counsellor or superadmin may issue one; the database enforces that
 * (migration 0018), so a telecaller's call fails there.
 */
export async function issueAssessment(
  db: Db,
  { leadId, issuedBy, mode = 'online' }: { leadId: string; issuedBy?: string | null; mode?: TestMode },
): Promise<{ assessment: Assessment }> {
  // Fail before the draw, not after. The RPC re-checks both conditions inside
  // the transaction — that is the real guard — but reaching it via a
  // StratumExhaustedError would report the wrong reason entirely.
  await assertIssuable(db, leadId)

  // The class decides the pool. An admit to class N draws content taught up to
  // N−1 (src/lib/classes); live_pool() applies that, and issue_assessment
  // re-checks the finished paper inside its transaction.
  const classLevel = await admittingClass(db, leadId)
  const pool = await livePool(db, classLevel)
  const seen = await itemsAlreadySeen(db, leadId)

  const shape = choosePaperShape(pool)
  const draw = { pool, shape, excludeItemIds: seen, forClass: classLevel }
  const paper = mode === 'paper' ? assembleForAnswerSheet({ ...draw, maxNumeric: NUMERIC_SLOTS }) : assemblePaper(draw)

  const { data, error } = await db.rpc('issue_assessment', {
    p_lead_id: leadId,
    p_issued_by: issuedBy ?? null,
    p_token: generateToken(),
    p_item_ids: paper.map((item) => item.id),
    // Named only when it is not the default, so an online issue is the same
    // call it was before migration 0018.
    ...(mode === 'paper' ? { p_mode: 'paper' } : {}),
  })

  if (error) throw new Error(error.message)
  return { assessment: data as Assessment }
}

/**
 * Cheap preconditions, checked before any work.
 *
 * Without these, a lead who has used all 3 issues fails inside the draw with a
 * message about the item bank, which sends whoever reads the log looking in
 * entirely the wrong place.
 */
async function assertIssuable(db: Db, leadId: string): Promise<void> {
  const { data, error } = await db
    .from('assessments')
    .select('issue_seq, state')
    .eq('lead_id', leadId)

  if (error) throw new Error(error.message)

  const prior = data ?? []
  if (prior.some((a) => a.state === 'submitted')) {
    throw new Error('This candidate has already submitted a test.')
  }
  if (prior.length >= 3) {
    throw new Error('This candidate has already been issued 3 tests.')
  }
}

/**
 * The class this lead is being admitted to. Issuing without one has no pool to
 * draw from, and the database refuses it too; failing here gives staff a
 * sentence instead of a constraint name.
 */
async function admittingClass(db: Db, leadId: string): Promise<ClassLevel> {
  const { data, error } = await db.from('leads').select('name, class_level').eq('id', leadId).maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Candidate not found.')
  // Imported leads may have no name; the candidate confirms theirs on screen.
  if (!data.name) throw new Error('Add the candidate’s name before issuing a test.')

  const classLevel = parseClassLevel(data.class_level)
  if (classLevel === null) {
    throw new Error('Set the class this candidate is being admitted to before issuing a test.')
  }
  return classLevel
}

/**
 * Every live item this class may be shown, as the draw needs it: id, subject,
 * difficulty, part and format, and no answer.
 *
 * Goes through `live_pool()` rather than selecting test_items, because SELECT
 * on that table is scoped to items a staff member has already seen on a paper
 * (migration 0008). Reading it directly meant a newly promoted item was
 * invisible to a counsellor and could never be drawn.
 */
async function livePool(db: Db, classLevel: ClassLevel): Promise<PoolItem[]> {
  const { data, error } = await db.rpc('live_pool', { p_class: classLevel })

  if (error) throw new Error(`could not load the item bank: ${error.message}`)
  return (data ?? []) as PoolItem[]
}

/**
 * Items this lead has already been shown on a previous issue.
 *
 * A reissue that repeats questions is worth less than a fresh one — the
 * candidate has had three hours to look the first set up.
 */
async function itemsAlreadySeen(db: Db, leadId: string): Promise<string[]> {
  const { data: priors, error: priorsError } = await db
    .from('assessments')
    .select('id')
    .eq('lead_id', leadId)

  if (priorsError) throw new Error(priorsError.message)
  if (!priors?.length) return []

  const { data, error } = await db
    .from('assessment_items')
    .select('item_id')
    .in('assessment_id', priors.map((p) => p.id))

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.item_id as string)
}
