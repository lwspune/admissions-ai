import 'server-only'
import type { Db } from './supabase'
import { retentionCutoff, lastActivity, isExpired } from '../lib/retention'

export interface PurgeReport {
  cutoff: string
  dryRun: boolean
  leads: number
  identifyAttempts: number
  /** Refs of what would go, capped — for the log, never for a response body. */
  leadIds: string[]
}

/**
 * Deletes candidate data past the twelve months the consent screen promises.
 *
 * Runs as service role: a cron has no session to act for, so there is no RLS
 * principal available. That is the one legitimate reason for a non-candidate
 * path to use it.
 *
 * Two separate deletions, and the second is the one easy to miss.
 * `identify_attempts` has NO foreign key to anything — it records a token, an
 * IP and a timestamp so the rate limiter can count across serverless
 * instances. Deleting a lead cascades through assessments, attempts, answers
 * and events, and leaves those IP rows untouched. A purge that only deleted
 * leads would quietly retain personal data forever while reporting success.
 */
export async function purgeExpired(
  db: Db,
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<PurgeReport> {
  const cutoff = retentionCutoff(now)
  const cutoffIso = cutoff.toISOString()

  // Candidates whose lead row is old enough to be a candidate for deletion.
  // The lead date alone does not decide it — a lead entered thirteen months
  // ago and reissued last week is active — so the assessments are checked too.
  const { data: oldLeads, error: leadsError } = await db
    .from('leads')
    .select('id, created_at, assessments(created_at)')
    .lt('created_at', cutoffIso)

  if (leadsError) throw new Error(`could not read leads for purge: ${leadsError.message}`)

  const expired = (oldLeads ?? []).filter((lead) => {
    const assessments = (lead.assessments ?? []) as { created_at: string }[]
    return isExpired(
      lastActivity(lead.created_at as string, assessments.map((a) => a.created_at)),
      cutoff,
    )
  })
  const leadIds = expired.map((l) => l.id as string)

  const { count: staleIdentify, error: countError } = await db
    .from('identify_attempts')
    .select('id', { count: 'exact', head: true })
    .lt('at', cutoffIso)

  if (countError) throw new Error(`could not count identify_attempts: ${countError.message}`)

  const report: PurgeReport = {
    cutoff: cutoffIso,
    dryRun,
    leads: leadIds.length,
    identifyAttempts: staleIdentify ?? 0,
    leadIds,
  }

  if (dryRun) return report

  if (leadIds.length > 0) {
    // Cascades to assessments, assessment_items, attempts, attempt_answers
    // and attempt_events.
    const { error } = await db.from('leads').delete().in('id', leadIds)
    if (error) throw new Error(`could not delete expired leads: ${error.message}`)
  }

  if ((staleIdentify ?? 0) > 0) {
    const { error } = await db.from('identify_attempts').delete().lt('at', cutoffIso)
    if (error) throw new Error(`could not delete expired identify_attempts: ${error.message}`)
  }

  return report
}
