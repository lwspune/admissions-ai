import 'server-only'
import type { Db } from './supabase'
import { assemblePaper, type PoolItem } from '../lib/assemble'
import { generateToken } from '../lib/token'

export interface Assessment {
  id: string
  lead_id: string
  token: string
  issue_seq: number
  created_at: string
  expires_at: string
  state: string
  superseded_by: string | null
  voided_reason: string | null
}

/**
 * Issues a test for a lead: draws a fresh paper and writes it atomically.
 *
 * The draw happens here, where it is unit tested; the write happens in the
 * `issue_assessment` function, where it gets a transaction. Splitting an
 * assessment from its 15 items across two REST calls risks a paper with
 * missing questions, scored out of 15 regardless.
 */
export async function issueAssessment(
  db: Db,
  { leadId, issuedBy }: { leadId: string; issuedBy?: string | null },
): Promise<{ assessment: Assessment }> {
  // Fail before the draw, not after. The RPC re-checks both conditions inside
  // the transaction — that is the real guard — but reaching it via a
  // StratumExhaustedError would report the wrong reason entirely.
  await assertIssuable(db, leadId)

  const pool = await livePool(db)
  const seen = await itemsAlreadySeen(db, leadId)

  const paper = assemblePaper({ pool, excludeItemIds: seen })

  const { data, error } = await db.rpc('issue_assessment', {
    p_lead_id: leadId,
    p_issued_by: issuedBy ?? null,
    p_token: generateToken(),
    p_item_ids: paper.map((item) => item.id),
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

/** Every live item, as the draw needs it. */
async function livePool(db: Db): Promise<PoolItem[]> {
  const { data, error } = await db
    .from('test_items')
    .select('id, subject, difficulty')
    .eq('status', 'live')

  if (error) throw new Error(`could not load the item bank: ${error.message}`)
  return (data ?? []) as PoolItem[]
}

/**
 * Items this lead has already been shown on a previous issue.
 *
 * A reissue that repeats questions is worth less than a fresh one — the
 * candidate has had two hours to look the first set up.
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
